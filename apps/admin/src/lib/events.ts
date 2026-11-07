import { eventStart, type EventDraft } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type PendingEvent = {
  id: string;
  title: string;
  details: string | null;
  startsAt: string;
  venue: string | null;
  link: string | null;
  capacity: number;
  posterUsername: string | null;
  submittedAt: string;
};

export type EventModerationApi = {
  queue: () => Promise<PendingEvent[]>;
  decide: (id: string, approve: boolean, reason: string) => Promise<string>;
  post: (draft: EventDraft) => Promise<string>;
};

/** A04 events waiting for review, and posting an event as admin (T03). */
export const eventModerationApi: EventModerationApi = {
  async queue() {
    const { data, error } = await supabase.rpc("event_review_queue");
    if (error) throw error;
    return (
      data as {
        event_id: string;
        title: string;
        details: string | null;
        starts_at: string;
        venue: string | null;
        link: string | null;
        capacity: number;
        poster_username: string | null;
        submitted_at: string;
      }[]
    ).map((r) => ({
      id: r.event_id,
      title: r.title,
      details: r.details,
      startsAt: r.starts_at,
      venue: r.venue,
      link: r.link,
      capacity: r.capacity,
      posterUsername: r.poster_username,
      submittedAt: r.submitted_at,
    }));
  },

  async decide(id, approve, reason) {
    const { data, error } = await supabase.rpc("decide_event", {
      event: id,
      approve,
      reason: approve ? null : reason,
    });
    if (error) throw error;
    return data as string;
  },

  async post(draft) {
    const start = eventStart(draft.date, draft.time);
    const { data, error } = await supabase.rpc("save_event", {
      event: null,
      title: draft.title,
      details: draft.details,
      starts_at: start ? start.toISOString() : null,
      venue: draft.venue,
      link: draft.link,
      capacity: Number(draft.capacity),
      submit: true,
    });
    if (error) throw error;
    return (data as { result: string }[])[0]?.result ?? "error";
  },
};
