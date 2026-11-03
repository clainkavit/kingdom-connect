import { photoLinks } from "./avatars";
import { connectionsApi } from "./connections";
import { supabase } from "./supabase";

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export type PickedFile = { uri: string; name: string; mime: string; size: number };

export type FileProblem = "too_large" | "wrong_type";

/** Checked before sending; the server checks the same limits again. */
export function fileProblem(file: PickedFile): FileProblem | null {
  if (!(FILE_TYPES as readonly string[]).includes(file.mime)) return "wrong_type";
  if (file.size > MAX_FILE_BYTES) return "too_large";
  return null;
}

export type ThreadSummary = {
  threadId: string;
  otherId: string;
  fullName: string;
  photoUrl: string | null;
  lastBody: string;
  lastDeleted: boolean;
  lastAt: string;
  unread: boolean;
};

export type Attachment = { id: string; fileName: string; mime: string; url: string | null };

export type Message = {
  id: string;
  mine: boolean;
  body: string;
  deleted: boolean;
  createdAt: string;
  attachments: Attachment[];
};

export type Thread = {
  id: string;
  otherId: string;
  otherName: string;
  reported: boolean;
  canSend: boolean;
  messages: Message[];
};

export type MessagesApi = {
  threads: () => Promise<ThreadSummary[]>;
  openThread: (memberId: string) => Promise<string | null>;
  load: (threadId: string) => Promise<Thread | null>;
  send: (threadId: string, body: string, file: PickedFile | null) => Promise<boolean>;
  remove: (messageId: string) => Promise<boolean>;
  markRead: (threadId: string) => Promise<void>;
  subscribe: (threadId: string, onChange: () => void) => () => void;
  pickFile: () => Promise<PickedFile | null>;
};

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? "";
}

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
  created_at: string;
  attachments: { id: string; storage_path: string; file_name: string; mime: string }[];
};

async function fileLinks(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await supabase.storage.from("message-files").createSignedUrls(paths, 300);
  return new Map(
    (data ?? []).flatMap((l) => (l.path && l.signedUrl ? [[l.path, l.signedUrl] as const] : [])),
  );
}

export function messagesApi(pick: () => Promise<PickedFile | null>): MessagesApi {
  return {
    async threads() {
      const { data, error } = await supabase.rpc("my_threads");
      if (error) throw error;
      const rows = (data ?? []) as {
        thread_id: string;
        other_id: string;
        full_name: string | null;
        photo_path: string | null;
        last_body: string | null;
        last_deleted: boolean;
        last_message_at: string;
        unread: boolean;
      }[];
      const urls = await photoLinks(rows.map((r) => r.photo_path));
      return rows.map((r) => ({
        threadId: r.thread_id,
        otherId: r.other_id,
        fullName: r.full_name ?? "",
        photoUrl: (r.photo_path && urls.get(r.photo_path)) || null,
        lastBody: r.last_body ?? "",
        lastDeleted: r.last_deleted,
        lastAt: r.last_message_at,
        unread: r.unread,
      }));
    },

    async openThread(memberId) {
      const me = await userId();
      const [a, b] = [me, memberId].sort() as [string, string];
      const find = () =>
        supabase
          .from("message_threads")
          .select("id")
          .eq("member_a", a)
          .eq("member_b", b)
          .is("idea_id", null)
          .is("opportunity_id", null)
          .maybeSingle();
      const found = await find();
      if (found.data) return found.data.id as string;
      const made = await supabase
        .from("message_threads")
        .insert({ member_a: a, member_b: b })
        .select("id")
        .single();
      if (made.data) return made.data.id as string;
      return ((await find()).data?.id as string | undefined) ?? null;
    },

    async load(threadId) {
      const me = await userId();
      const thread = await supabase
        .from("message_threads")
        .select("id, member_a, member_b, status")
        .eq("id", threadId)
        .maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data) return null;
      const otherId = thread.data.member_a === me ? thread.data.member_b : thread.data.member_a;
      const [messages, other, relation] = await Promise.all([
        supabase
          .from("messages")
          .select(
            "id, sender_id, body, deleted_at, created_at, attachments:message_attachments(id, storage_path, file_name, mime)",
          )
          .eq("thread_id", threadId)
          .order("created_at"),
        supabase.from("profiles").select("full_name").eq("member_id", otherId).maybeSingle(),
        connectionsApi.relation(otherId).catch(() => "none" as const),
      ]);
      if (messages.error) throw messages.error;
      const rows = (messages.data ?? []) as MessageRow[];
      const links = await fileLinks(rows.flatMap((r) => r.attachments.map((a) => a.storage_path)));
      return {
        id: threadId,
        otherId,
        otherName: other.data?.full_name ?? "",
        reported: thread.data.status === "reported",
        canSend: relation === "connected" && thread.data.status !== "closed",
        messages: rows.map((r) => ({
          id: r.id,
          mine: r.sender_id === me,
          body: r.body,
          deleted: r.deleted_at !== null,
          createdAt: r.created_at,
          attachments: r.attachments.map((a) => ({
            id: a.id,
            fileName: a.file_name,
            mime: a.mime,
            url: links.get(a.storage_path) ?? null,
          })),
        })),
      };
    },

    async send(threadId, body, file) {
      const message = await supabase
        .from("messages")
        .insert({ thread_id: threadId, body: body.trim() })
        .select("id")
        .single();
      if (message.error || !message.data) return false;
      if (!file) return true;
      const path = `${threadId}/${message.data.id}/${file.name.replace(/[^\w.-]+/g, "_")}`;
      const blob = await (await fetch(file.uri)).blob();
      const upload = await supabase.storage
        .from("message-files")
        .upload(path, blob, { contentType: file.mime });
      const attached =
        !upload.error &&
        !(
          await supabase.from("message_attachments").insert({
            message_id: message.data.id,
            storage_path: path,
            file_name: file.name.slice(0, 200),
            mime: file.mime,
            size: file.size,
          })
        ).error;
      if (!attached) await this.remove(message.data.id);
      return attached;
    },

    async remove(messageId) {
      const files = await supabase
        .from("message_attachments")
        .select("storage_path")
        .eq("message_id", messageId);
      const paths = (files.data ?? []).map((f) => f.storage_path as string);
      if (paths.length) await supabase.storage.from("message-files").remove(paths);
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      return !error;
    },

    async markRead(threadId) {
      const markThread = async () => {
        const first = await supabase.from("thread_reads").insert({ thread_id: threadId });
        if (first.error?.code === "23505")
          await supabase
            .from("thread_reads")
            .update({ last_read_at: new Date().toISOString() })
            .eq("thread_id", threadId);
      };
      await Promise.all([
        markThread(),
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("kind", "C3")
          .eq("payload->>thread_id", threadId)
          .is("read_at", null),
      ]);
    },

    subscribe(threadId, onChange) {
      const channel = supabase
        .channel(`thread:${threadId}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
          onChange,
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    },

    pickFile: pick,
  };
}
