import { trainingStart, type TrainingDraft, type TrainingFormat } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type PendingTraining = {
  id: string;
  title: string;
  provider: string;
  format: TrainingFormat;
  details: string | null;
  venue: string | null;
  startsAt: string | null;
  seats: number;
  posterUsername: string | null;
  submittedAt: string;
};

export type TrainingModerationApi = {
  queue: () => Promise<PendingTraining[]>;
  decide: (id: string, approve: boolean, reason: string) => Promise<string>;
  post: (draft: TrainingDraft) => Promise<string>;
};

/** A04 training waiting for review, and posting training as admin (T01). */
export const trainingModerationApi: TrainingModerationApi = {
  async queue() {
    const { data, error } = await supabase.rpc("training_review_queue");
    if (error) throw error;
    return (
      data as {
        training_id: string;
        title: string;
        provider: string;
        format: TrainingFormat;
        details: string | null;
        venue: string | null;
        starts_at: string | null;
        seats: number;
        poster_username: string | null;
        submitted_at: string;
      }[]
    ).map((r) => ({
      id: r.training_id,
      title: r.title,
      provider: r.provider,
      format: r.format,
      details: r.details,
      venue: r.venue,
      startsAt: r.starts_at,
      seats: r.seats,
      posterUsername: r.poster_username,
      submittedAt: r.submitted_at,
    }));
  },

  async decide(id, approve, reason) {
    const { data, error } = await supabase.rpc("decide_training", {
      training: id,
      approve,
      reason: approve ? null : reason,
    });
    if (error) throw error;
    return data as string;
  },

  async post(draft) {
    const start = trainingStart(draft);
    const { data, error } = await supabase.rpc("save_training", {
      training: null,
      title: draft.title,
      provider: draft.provider,
      format: draft.format,
      details: draft.details,
      venue: draft.venue,
      starts_at: start ? start.toISOString() : null,
      seats: Number(draft.seats),
      downloads_allowed: draft.downloadsAllowed,
      submit: true,
    });
    if (error) throw error;
    return (data as { result: string }[])[0]?.result ?? "error";
  },
};
