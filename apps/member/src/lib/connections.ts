import { photoLinks } from "./avatars";
import { supabase } from "./supabase";

export type Relation = "none" | "sent" | "received" | "connected";

export const MAX_NOTE_LENGTH = 300;
export const MAX_REQUESTS_PER_DAY = 30;

/** Characters as the server counts them, after trimming. */
export const noteLength = (note: string) => [...note.trim()].length;

export type SendResult =
  | "sent"
  | "connected"
  | "daily_limit"
  | "already_sent"
  | "they_asked_you"
  | "already_connected"
  | "not_available"
  | "failed";

export type Person = {
  memberId: string;
  fullName: string;
  headline: string;
  photoUrl: string | null;
};

export type ReceivedRequest = Person & { requestId: string; note: string };
export type SentRequest = Person & { requestId: string };

export type BlockedMember = { memberId: string; fullName: string };

export type ConnectionsApi = {
  received: () => Promise<ReceivedRequest[]>;
  sent: () => Promise<SentRequest[]>;
  connections: () => Promise<Person[]>;
  relation: (memberId: string) => Promise<Relation>;
  send: (memberId: string, note: string) => Promise<SendResult>;
  answer: (requestId: string, accept: boolean) => Promise<boolean>;
  withdraw: (requestId: string) => Promise<boolean>;
  remove: (memberId: string) => Promise<boolean>;
  block: (memberId: string) => Promise<boolean>;
  unblock: (memberId: string) => Promise<boolean>;
  blocked: () => Promise<BlockedMember[]>;
};

const serverRefusals: SendResult[] = [
  "daily_limit",
  "already_sent",
  "they_asked_you",
  "already_connected",
  "not_available",
];

type PersonRow = {
  full_name: string | null;
  headline: string | null;
  photo_path: string | null;
};

async function people<T extends PersonRow>(rows: T[], idOf: (row: T) => string) {
  const urls = await photoLinks(rows.map((r) => r.photo_path));
  return rows.map((r) => ({
    memberId: idOf(r),
    fullName: r.full_name ?? "",
    headline: r.headline ?? "",
    photoUrl: (r.photo_path && urls.get(r.photo_path)) || null,
  }));
}

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? "";
}

const setStatus = async (requestId: string, status: "accepted" | "declined" | "withdrawn") =>
  !(await supabase.from("connection_requests").update({ status }).eq("id", requestId)).error;

export const connectionsApi: ConnectionsApi = {
  async received() {
    const { data, error } = await supabase.rpc("my_received_requests");
    if (error) throw error;
    const rows = (data ?? []) as (PersonRow & {
      request_id: string;
      requester_id: string;
      note: string | null;
    })[];
    const found = await people(rows, (r) => r.requester_id);
    return found.map((p, i) => ({
      ...p,
      requestId: rows[i]!.request_id,
      note: rows[i]!.note ?? "",
    }));
  },

  async sent() {
    const { data, error } = await supabase.rpc("my_sent_requests");
    if (error) throw error;
    const rows = (data ?? []) as (PersonRow & { request_id: string; receiver_id: string })[];
    const found = await people(rows, (r) => r.receiver_id);
    return found.map((p, i) => ({ ...p, requestId: rows[i]!.request_id }));
  },

  async connections() {
    const me = await userId();
    const { data, error } = await supabase.from("connections").select("member_a, member_b");
    if (error) throw error;
    const others = (data ?? []).map((c) => (c.member_a === me ? c.member_b : c.member_a));
    if (!others.length) return [];
    const profiles = await supabase
      .from("profiles")
      .select("member_id, full_name, headline, photo_path")
      .in("member_id", others)
      .order("full_name");
    if (profiles.error) throw profiles.error;
    return people(profiles.data ?? [], (r) => r.member_id);
  },

  async relation(memberId) {
    const { data, error } = await supabase.rpc("connection_state", { member_id: memberId });
    if (error) throw error;
    return data as Relation;
  },

  async send(memberId, note) {
    const { error } = await supabase
      .from("connection_requests")
      .insert({ receiver_id: memberId, note: note.trim() || null });
    if (error) return serverRefusals.find((r) => r === error.message) ?? "failed";
    return (await connectionsApi.relation(memberId).catch(() => "sent")) === "connected"
      ? "connected"
      : "sent";
  },

  answer: (requestId, accept) => setStatus(requestId, accept ? "accepted" : "declined"),
  withdraw: (requestId) => setStatus(requestId, "withdrawn"),

  async remove(memberId) {
    const me = await userId();
    const [a, b] = [me, memberId].sort();
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("member_a", a!)
      .eq("member_b", b!);
    return !error;
  },

  async block(memberId) {
    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: await userId(), blocked_id: memberId });
    return !error;
  },

  async unblock(memberId) {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", await userId())
      .eq("blocked_id", memberId);
    return !error;
  },

  async blocked() {
    const { data, error } = await supabase.rpc("my_blocks");
    if (error) throw error;
    return ((data ?? []) as { member_id: string; full_name: string | null }[]).map((r) => ({
      memberId: r.member_id,
      fullName: r.full_name ?? "",
    }));
  },
};
