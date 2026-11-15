import { supabase } from "./supabase";

export const PICK_SIZES = ["5", "10", "15", "20"] as const;
export type PickSize = (typeof PICK_SIZES)[number];

export type PickRequestStatus = "waiting" | "picking" | "asking" | "sent" | "stopped";
export type RequestPickResult =
  | "ok"
  | "not_found"
  | "not_allowed"
  | "invalid"
  | "contact_details"
  | "already_requested"
  | "failed";

export type PickRequest = {
  status: PickRequestStatus;
  wanted: number;
  note: string;
  agreed: number | null;
  sentAt: Date | null;
};

export type PickPerson = {
  id: string;
  memberId: string;
  fullName: string;
  headline: string | null;
  regionEn: string | null;
  regionSw: string | null;
  verifiedBusiness: boolean;
  why: string;
  posterView: "none" | "connect" | "not_fit";
};

export type PickInvite = {
  id: string;
  opportunityId: string;
  title: string;
  posterName: string;
  why: string;
  status: "asked" | "agreed" | "declined" | "expired" | "replaced";
  answerBy: Date;
};

export type AnswerResult = "ok" | "expired" | "already_answered" | "failed";

export type PicksApi = {
  request: (opportunityId: string, wanted: number, note: string) => Promise<RequestPickResult>;
  stop: (opportunityId: string) => Promise<boolean>;
  progress: (opportunityId: string) => Promise<PickRequest | null>;
  list: (opportunityId: string) => Promise<PickPerson[]>;
  setView: (pickId: string, view: "connect" | "not_fit") => Promise<boolean>;
  invites: () => Promise<PickInvite[]>;
  answer: (pickId: string, yes: boolean) => Promise<AnswerResult>;
  pickedPosts: () => Promise<Map<string, PickRequestStatus>>;
};

/** O16: Let Kingdom Connect pick for posters (S20, S50) and picked members (S51). */
export const picksApi: PicksApi = {
  async request(opportunityId, wanted, note) {
    const { data, error } = await supabase.rpc("request_pick", {
      opportunity: opportunityId,
      wanted,
      note,
    });
    return error ? "failed" : ((data as RequestPickResult | null) ?? "failed");
  },

  async stop(opportunityId) {
    const { data, error } = await supabase.rpc("stop_pick", { opportunity: opportunityId });
    return !error && data === "ok";
  },

  async progress(opportunityId) {
    const { data, error } = await supabase.rpc("my_pick_request", { opportunity: opportunityId });
    if (error) throw error;
    const row = (
      data as {
        status: PickRequestStatus;
        wanted: number;
        note: string;
        agreed: number | null;
        sent_at: string | null;
      }[]
    )[0];
    return row
      ? {
          status: row.status,
          wanted: row.wanted,
          note: row.note,
          agreed: row.agreed,
          sentAt: row.sent_at ? new Date(row.sent_at) : null,
        }
      : null;
  },

  async list(opportunityId) {
    const { data, error } = await supabase.rpc("pick_list", { opportunity: opportunityId });
    if (error) throw error;
    return (
      data as {
        pick_id: string;
        member_id: string;
        full_name: string | null;
        headline: string | null;
        region_en: string | null;
        region_sw: string | null;
        verified_business: boolean;
        why: string;
        poster_view: PickPerson["posterView"];
      }[]
    ).map((r) => ({
      id: r.pick_id,
      memberId: r.member_id,
      fullName: r.full_name ?? "",
      headline: r.headline,
      regionEn: r.region_en,
      regionSw: r.region_sw,
      verifiedBusiness: r.verified_business,
      why: r.why,
      posterView: r.poster_view,
    }));
  },

  async setView(pickId, view) {
    const { data, error } = await supabase.rpc("set_pick_view", { pick: pickId, view });
    return !error && data === "ok";
  },

  async invites() {
    const { data, error } = await supabase.rpc("my_pick_invites");
    if (error) throw error;
    return (
      data as {
        pick_id: string;
        opportunity_id: string;
        title: string;
        poster_name: string;
        why: string;
        status: PickInvite["status"];
        answered_by: string;
      }[]
    ).map((r) => ({
      id: r.pick_id,
      opportunityId: r.opportunity_id,
      title: r.title,
      posterName: r.poster_name,
      why: r.why,
      status: r.status,
      answerBy: new Date(r.answered_by),
    }));
  },

  async answer(pickId, yes) {
    const { data, error } = await supabase.rpc("answer_pick", { pick: pickId, yes });
    if (error) return "failed";
    return data === "ok" || data === "expired" || data === "already_answered" ? data : "failed";
  },

  async pickedPosts() {
    const { data, error } = await supabase.rpc("my_picked_posts");
    if (error) throw error;
    return new Map(
      (data as { opportunity_id: string; status: PickRequestStatus }[]).map((r) => [
        r.opportunity_id,
        r.status,
      ]),
    );
  },
};
