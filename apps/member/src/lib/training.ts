import { trainingStart, type TrainingDraft, type TrainingFormat } from "@kingdom-connect/shared";
import type { Registrant } from "./events";
import { supabase } from "./supabase";

export type TrainingItem = {
  id: string;
  title: string;
  provider: string;
  format: TrainingFormat;
  details: string | null;
  venue: string | null;
  startsAt: string | null;
  seats: number;
  registered: number;
  downloadsAllowed: boolean;
  status: "draft" | "pending_review" | "published" | "closed" | "hidden" | "removed";
  reviewReason: string | null;
  isMine: boolean;
  myStatus: "registered" | "waitlisted" | null;
  myWaitlistPosition: number | null;
};

export type TrainingApi = {
  feed: () => Promise<TrainingItem[]>;
  canPost: () => Promise<boolean>;
  save: (
    id: string | null,
    draft: TrainingDraft,
    submit: boolean,
  ) => Promise<{ result: string; trainingId: string | null }>;
  register: (id: string) => Promise<{ result: string; waitlistPosition: number | null }>;
  cancel: (id: string) => Promise<string>;
  registrants: (id: string) => Promise<Registrant[]>;
};

type FeedRow = {
  training_id: string;
  title: string;
  provider: string;
  format: TrainingFormat;
  details: string | null;
  venue: string | null;
  starts_at: string | null;
  seats: number;
  registered: number;
  downloads_allowed: boolean;
  status: TrainingItem["status"];
  review_reason: string | null;
  is_mine: boolean;
  my_status: TrainingItem["myStatus"];
  my_waitlist_position: number | null;
};

/** S35 and S37: training, registration and the waitlist (T01). */
export const trainingApi: TrainingApi = {
  async feed() {
    const { data, error } = await supabase.rpc("trainings_feed");
    if (error) throw error;
    return (data as FeedRow[]).map((r) => ({
      id: r.training_id,
      title: r.title,
      provider: r.provider,
      format: r.format,
      details: r.details,
      venue: r.venue,
      startsAt: r.starts_at,
      seats: r.seats,
      registered: r.registered,
      downloadsAllowed: r.downloads_allowed,
      status: r.status,
      reviewReason: r.review_reason,
      isMine: r.is_mine,
      myStatus: r.my_status,
      myWaitlistPosition: r.my_waitlist_position,
    }));
  },

  async canPost() {
    const { data, error } = await supabase.rpc("can_post_training");
    if (error) throw error;
    return data === true;
  },

  async save(id, draft, submit) {
    const start = trainingStart(draft);
    const { data, error } = await supabase.rpc("save_training", {
      training: id,
      title: draft.title,
      provider: draft.provider,
      format: draft.format,
      details: draft.details,
      venue: draft.venue,
      starts_at: start ? start.toISOString() : null,
      seats: Number(draft.seats),
      downloads_allowed: draft.downloadsAllowed,
      submit,
    });
    if (error) throw error;
    const row = (data as { result: string; training_id: string | null }[])[0];
    return { result: row?.result ?? "error", trainingId: row?.training_id ?? null };
  },

  async register(id) {
    const { data, error } = await supabase.rpc("register_for_training", { training: id });
    if (error) throw error;
    const row = (data as { result: string; waitlist_position: number | null }[])[0];
    return { result: row?.result ?? "error", waitlistPosition: row?.waitlist_position ?? null };
  },

  async cancel(id) {
    const { data, error } = await supabase.rpc("cancel_training_registration", { training: id });
    if (error) throw error;
    return data as string;
  },

  async registrants(id) {
    const { data, error } = await supabase.rpc("training_registrants", { training: id });
    if (error) throw error;
    return (
      data as {
        member_id: string;
        full_name: string | null;
        headline: string | null;
        status: Registrant["status"];
        waitlist_position: number | null;
      }[]
    ).map((r) => ({
      memberId: r.member_id,
      fullName: r.full_name,
      headline: r.headline,
      status: r.status,
      waitlistPosition: r.waitlist_position,
    }));
  },
};
