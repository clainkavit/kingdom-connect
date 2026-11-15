import { supabase } from "./supabase";

export type Engagement = {
  id: string;
  responseId: string | null;
  role: "poster" | "worker";
  otherName: string;
  title: string;
  markedAt: Date;
  confirmedAt: Date | null;
  deniedAt: Date | null;
  closesAt: Date | null;
  iRated: boolean;
};

export type Scores = { onTime: number; quality: number; communication: number; honesty: number };

export type RateResult =
  "ok" | "not_confirmed" | "closed" | "already_rated" | "contact_details" | "invalid" | "failed";

export type ReplyResult = "ok" | "already_replied" | "contact_details" | "invalid" | "failed";

export type WorkReference = {
  id: string;
  raterName: string;
  title: string;
  ratedAt: Date;
  comment: string;
  reply: string | null;
};

export type WorkReferences = {
  total: number;
  againCount: number;
  averages: Scores;
  items: WorkReference[];
};

export type WorkApi = {
  engagements: () => Promise<Engagement[]>;
  markHired: (responseId: string) => Promise<boolean>;
  confirm: (engagementId: string, yes: boolean) => Promise<boolean>;
  rate: (
    engagementId: string,
    scores: Scores,
    again: boolean,
    comment: string,
    note: string,
  ) => Promise<RateResult>;
  reply: (ratingId: string, text: string) => Promise<ReplyResult>;
  references: (memberId: string) => Promise<WorkReferences | null>;
};

const DAY = 24 * 60 * 60 * 1000;

export type WorkStage = "confirm" | "waiting" | "denied" | "rate" | "sent" | "closed";

/** Where one engagement stands for the person looking at it (S52, S53). */
export function workStage(e: Engagement, now: Date = new Date()): WorkStage {
  if (e.deniedAt) return "denied";
  if (!e.confirmedAt) return e.role === "worker" ? "confirm" : "waiting";
  if (e.iRated) return "sent";
  if (!e.closesAt || e.closesAt.getTime() <= now.getTime()) return "closed";
  return "rate";
}

export function daysLeft(e: Engagement, now: Date = new Date()): number {
  if (!e.closesAt) return 0;
  return Math.max(0, Math.ceil((e.closesAt.getTime() - now.getTime()) / DAY));
}

const date = (v: string | null) => (v ? new Date(v) : null);

/** O18: mark as hired (S21), confirm the work (S52), rate it (S53) and work references (S11). */
export const workApi: WorkApi = {
  async engagements() {
    const { data, error } = await supabase.rpc("my_engagements");
    if (error) throw error;
    return (
      data as {
        engagement_id: string;
        response_id: string | null;
        role: "poster" | "worker";
        other_name: string;
        work_title: string | null;
        marked_at: string;
        confirmed_at: string | null;
        denied_at: string | null;
        rating_closes_at: string | null;
        i_rated: boolean;
      }[]
    ).map((r) => ({
      id: r.engagement_id,
      responseId: r.response_id,
      role: r.role,
      otherName: r.other_name,
      title: r.work_title ?? "",
      markedAt: new Date(r.marked_at),
      confirmedAt: date(r.confirmed_at),
      deniedAt: date(r.denied_at),
      closesAt: date(r.rating_closes_at),
      iRated: r.i_rated,
    }));
  },

  async markHired(responseId) {
    const { data, error } = await supabase.rpc("mark_hired", { response: responseId });
    return !error && data === "ok";
  },

  async confirm(engagementId, yes) {
    const { data, error } = await supabase.rpc("confirm_work", { engagement: engagementId, yes });
    return !error && data === "ok";
  },

  async rate(engagementId, scores, again, comment, note) {
    const { data, error } = await supabase.rpc("rate_work", {
      engagement: engagementId,
      on_time: scores.onTime,
      quality: scores.quality,
      communication: scores.communication,
      honesty: scores.honesty,
      again,
      comment,
      note,
    });
    return error ? "failed" : ((data as RateResult | null) ?? "failed");
  },

  async reply(ratingId, text) {
    const { data, error } = await supabase.rpc("reply_to_rating", {
      rating: ratingId,
      reply: text,
    });
    return error ? "failed" : ((data as ReplyResult | null) ?? "failed");
  },

  async references(memberId) {
    const { data, error } = await supabase.rpc("work_references", { member: memberId });
    if (error) throw error;
    const rows = data as {
      rating_id: string;
      rater_name: string;
      work_title: string | null;
      rated_at: string;
      comment: string;
      reply: string | null;
      total: number;
      again_count: number;
      on_time: number;
      quality: number;
      communication: number;
      honesty: number;
    }[];
    const first = rows[0];
    if (!first) return null;
    return {
      total: first.total,
      againCount: first.again_count,
      averages: {
        onTime: Number(first.on_time),
        quality: Number(first.quality),
        communication: Number(first.communication),
        honesty: Number(first.honesty),
      },
      items: rows.map((r) => ({
        id: r.rating_id,
        raterName: r.rater_name,
        title: r.work_title ?? "",
        ratedAt: new Date(r.rated_at),
        comment: r.comment,
        reply: r.reply,
      })),
    };
  },
};
