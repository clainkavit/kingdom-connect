import type { PostKind } from "./opportunity-browse";
import { supabase } from "./supabase";

const BUCKET = "response-files";
export const RESPONSE_FILE_MAX = 5 * 1024 * 1024;
export const NOTE_MAX = 2000;

export type ResponseStatus = "new" | "shortlisted" | "declined" | "withdrawn";
export type ResponseKind = "application" | "interest";
export type PickedPdf = { uri: string; name: string; mime: string; size: number };

export type RespondResult =
  | "ok"
  | "not_open"
  | "own_post"
  | "level2_required"
  | "already_responded"
  | "invalid_note"
  | "contact_details"
  | "invalid_attachment"
  | "failed";

export type MyResponse = { id: string; status: ResponseStatus };

export type MyResponseItem = {
  id: string;
  opportunityId: string;
  kind: ResponseKind;
  status: ResponseStatus;
  title: string;
  type: PostKind;
  postStatus: string;
  sentAt: Date;
};

export type PostResponse = {
  id: string;
  memberId: string;
  memberName: string;
  kind: ResponseKind;
  note: string;
  attachmentPath: string | null;
  status: ResponseStatus;
  sentAt: Date;
};

export type ResponsesApi = {
  mine: (opportunityId: string) => Promise<MyResponse | null>;
  respond: (opportunityId: string, note: string, file: PickedPdf | null) => Promise<RespondResult>;
  withdraw: (responseId: string) => Promise<boolean>;
  myResponses: () => Promise<MyResponseItem[]>;
  forPost: (opportunityId: string) => Promise<PostResponse[]>;
  setStatus: (responseId: string, status: "shortlisted" | "declined") => Promise<boolean>;
  thread: (opportunityId: string, other?: string) => Promise<string | null>;
  level: () => Promise<number>;
  fileLink: (path: string) => Promise<string | null>;
  pickPdf: () => Promise<PickedPdf | null>;
};

/** O03: apply or express interest (S18), my responses (S19) and a post's responses (S21). */
export const responsesApi = (pickPdf: () => Promise<PickedPdf | null>): ResponsesApi => ({
  async mine(opportunityId) {
    const { data, error } = await supabase.rpc("my_response", { opportunity: opportunityId });
    if (error) throw error;
    const row = (data as { response_id: string; status: ResponseStatus }[])[0];
    return row ? { id: row.response_id, status: row.status } : null;
  },

  async respond(opportunityId, note, file) {
    let path: string | null = null;
    if (file) {
      const { data } = await supabase.auth.getSession();
      path = `${data.session?.user.id ?? ""}/${crypto.randomUUID()}.pdf`;
      const blob = await (await fetch(file.uri)).blob();
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "application/pdf" });
      if (upload.error) return "failed";
    }
    const { data, error } = await supabase.rpc("respond_to_opportunity", {
      opportunity: opportunityId,
      note: note.trim() || null,
      attachment_path: path,
    });
    const result = (data as { result: RespondResult }[] | null)?.[0]?.result ?? "failed";
    if ((error || result !== "ok") && path) await supabase.storage.from(BUCKET).remove([path]);
    return error ? "failed" : result;
  },

  async withdraw(responseId) {
    const { data, error } = await supabase.rpc("withdraw_response", { response: responseId });
    return !error && data === "ok";
  },

  async myResponses() {
    const { data, error } = await supabase.rpc("my_responses");
    if (error) throw error;
    return (
      data as {
        response_id: string;
        opportunity_id: string;
        kind: ResponseKind;
        status: ResponseStatus;
        title: string;
        type: PostKind;
        opportunity_status: string;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.response_id,
      opportunityId: r.opportunity_id,
      kind: r.kind,
      status: r.status,
      title: r.title,
      type: r.type,
      postStatus: r.opportunity_status,
      sentAt: new Date(r.created_at),
    }));
  },

  async forPost(opportunityId) {
    const { data, error } = await supabase.rpc("responses_for_post", {
      opportunity: opportunityId,
    });
    if (error) throw error;
    return (
      data as {
        response_id: string;
        member_id: string;
        member_name: string;
        kind: ResponseKind;
        note: string | null;
        attachment_path: string | null;
        status: ResponseStatus;
        created_at: string;
      }[]
    ).map((r) => ({
      id: r.response_id,
      memberId: r.member_id,
      memberName: r.member_name,
      kind: r.kind,
      note: r.note ?? "",
      attachmentPath: r.attachment_path,
      status: r.status,
      sentAt: new Date(r.created_at),
    }));
  },

  async setStatus(responseId, status) {
    const { data, error } = await supabase.rpc("set_response_status", {
      response: responseId,
      next_status: status,
    });
    return !error && data === "ok";
  },

  async thread(opportunityId, other) {
    const { data, error } = await supabase.rpc("opportunity_thread", {
      opportunity: opportunityId,
      other: other ?? null,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  },

  async level() {
    const { data, error } = await supabase.rpc("member_dashboard");
    if (error) throw error;
    return (data as { level: number }[] | null)?.[0]?.level ?? 1;
  },

  async fileLink(path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  },

  pickPdf,
});
