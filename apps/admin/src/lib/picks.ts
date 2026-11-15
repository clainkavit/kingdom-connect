import { supabase } from "./supabase";

export type PickQueueItem = {
  requestId: string;
  opportunityId: string;
  title: string;
  posterName: string;
  wanted: number;
  note: string;
  status: "picking" | "asking";
  asked: number;
  agreed: number;
  declined: number;
  expired: number;
};

export type Suggestion = {
  memberId: string;
  fullName: string;
  headline: string | null;
  skillMatches: number;
  sameSector: boolean;
  sameRegion: boolean;
  verifiedBusiness: boolean;
  finishedPlans: number;
  ratingsTotal: number;
  ratingsAgain: number;
  upheldReports: number;
};

export type PickedPerson = {
  id: string;
  memberId: string;
  fullName: string;
  headline: string | null;
  why: string;
  status: "asked" | "agreed" | "declined" | "expired" | "replaced";
};

export type PickAdminApi = {
  queue: () => Promise<PickQueueItem[]>;
  suggestions: (requestId: string, max: number) => Promise<Suggestion[]>;
  people: (requestId: string) => Promise<PickedPerson[]>;
  findMember: (username: string) => Promise<Suggestion | null>;
  ask: (requestId: string, picks: { memberId: string; why: string }[]) => Promise<boolean>;
  send: (requestId: string) => Promise<"ok" | "nobody_agreed" | "failed">;
};

const emptyRecord = {
  skillMatches: 0,
  sameSector: false,
  sameRegion: false,
  verifiedBusiness: false,
  finishedPlans: 0,
  ratingsTotal: 0,
  ratingsAgain: 0,
  upheldReports: 0,
};

/** D07: A18 Picks for posters, over the O15 staff functions. */
export const pickAdminApi: PickAdminApi = {
  async queue() {
    const { data, error } = await supabase.rpc("pick_queue");
    if (error) throw error;
    return (
      data as {
        request_id: string;
        opportunity_id: string;
        title: string;
        poster_name: string;
        wanted: number;
        note: string;
        status: "picking" | "asking";
        asked: number;
        agreed: number;
        declined: number;
        expired: number;
      }[]
    ).map((r) => ({
      requestId: r.request_id,
      opportunityId: r.opportunity_id,
      title: r.title,
      posterName: r.poster_name,
      wanted: r.wanted,
      note: r.note,
      status: r.status,
      asked: r.asked,
      agreed: r.agreed,
      declined: r.declined,
      expired: r.expired,
    }));
  },

  async suggestions(requestId, max) {
    const { data, error } = await supabase.rpc("pick_suggestions", {
      request: requestId,
      max_rows: max,
    });
    if (error) throw error;
    return (
      data as {
        member_id: string;
        full_name: string;
        headline: string | null;
        skill_matches: number;
        same_sector: boolean;
        same_region: boolean;
        verified_business: boolean;
        finished_plans: number;
        ratings_total: number;
        ratings_again: number;
        upheld_reports: number;
      }[]
    ).map((r) => ({
      memberId: r.member_id,
      fullName: r.full_name,
      headline: r.headline,
      skillMatches: r.skill_matches,
      sameSector: r.same_sector,
      sameRegion: r.same_region,
      verifiedBusiness: r.verified_business,
      finishedPlans: r.finished_plans,
      ratingsTotal: r.ratings_total,
      ratingsAgain: r.ratings_again,
      upheldReports: r.upheld_reports,
    }));
  },

  async people(requestId) {
    const { data, error } = await supabase.rpc("pick_people", { request: requestId });
    if (error) throw error;
    return (
      data as {
        pick_id: string;
        member_id: string;
        full_name: string;
        headline: string | null;
        why: string;
        status: PickedPerson["status"];
      }[]
    ).map((r) => ({
      id: r.pick_id,
      memberId: r.member_id,
      fullName: r.full_name,
      headline: r.headline,
      why: r.why,
      status: r.status,
    }));
  },

  async findMember(username) {
    const { data, error } = await supabase.rpc("pick_member_by_username", { username });
    if (error) throw error;
    const row = (data as { member_id: string; full_name: string; headline: string | null }[])[0];
    return row
      ? { memberId: row.member_id, fullName: row.full_name, headline: row.headline, ...emptyRecord }
      : null;
  },

  async ask(requestId, picks) {
    const { error } = await supabase.rpc("ask_picks", {
      request: requestId,
      members: picks.map((p) => p.memberId),
      whys: picks.map((p) => p.why),
    });
    return !error;
  },

  async send(requestId) {
    const { data, error } = await supabase.rpc("send_pick_list", { request: requestId });
    if (error) return "failed";
    return data === "ok" || data === "nobody_agreed" ? data : "failed";
  },
};
