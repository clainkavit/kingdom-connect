import { eventStart, type EventDraft } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type EventItem = {
  id: string;
  title: string;
  details: string | null;
  startsAt: string;
  venue: string | null;
  link: string | null;
  capacity: number;
  registered: number;
  status: "draft" | "pending_review" | "published" | "closed" | "hidden" | "removed";
  reviewReason: string | null;
  isMine: boolean;
  myStatus: "registered" | "waitlisted" | null;
  myWaitlistPosition: number | null;
};

export type Registrant = {
  memberId: string;
  fullName: string | null;
  headline: string | null;
  status: "registered" | "waitlisted" | "attended";
  waitlistPosition: number | null;
};

export type SaveResult = { result: string; eventId: string | null };
export type RegisterResult = { result: string; waitlistPosition: number | null };

export type EventsApi = {
  feed: () => Promise<EventItem[]>;
  canPost: () => Promise<boolean>;
  save: (id: string | null, draft: EventDraft, submit: boolean) => Promise<SaveResult>;
  register: (id: string) => Promise<RegisterResult>;
  cancel: (id: string) => Promise<string>;
  registrants: (id: string) => Promise<Registrant[]>;
};

type FeedRow = {
  event_id: string;
  title: string;
  details: string | null;
  starts_at: string;
  venue: string | null;
  link: string | null;
  capacity: number;
  registered: number;
  status: EventItem["status"];
  review_reason: string | null;
  is_mine: boolean;
  my_status: EventItem["myStatus"];
  my_waitlist_position: number | null;
};

/** S38: events, registration and the waitlist (T03). */
export const eventsApi: EventsApi = {
  async feed() {
    const { data, error } = await supabase.rpc("events_feed");
    if (error) throw error;
    return (data as FeedRow[]).map((r) => ({
      id: r.event_id,
      title: r.title,
      details: r.details,
      startsAt: r.starts_at,
      venue: r.venue,
      link: r.link,
      capacity: r.capacity,
      registered: r.registered,
      status: r.status,
      reviewReason: r.review_reason,
      isMine: r.is_mine,
      myStatus: r.my_status,
      myWaitlistPosition: r.my_waitlist_position,
    }));
  },

  async canPost() {
    const { data, error } = await supabase.rpc("can_post_event");
    if (error) throw error;
    return data === true;
  },

  async save(id, draft, submit) {
    const start = eventStart(draft.date, draft.time);
    const { data, error } = await supabase.rpc("save_event", {
      event: id,
      title: draft.title,
      details: draft.details,
      starts_at: start ? start.toISOString() : null,
      venue: draft.venue,
      link: draft.link,
      capacity: Number(draft.capacity),
      submit,
    });
    if (error) throw error;
    const row = (data as { result: string; event_id: string | null }[])[0];
    return { result: row?.result ?? "error", eventId: row?.event_id ?? null };
  },

  async register(id) {
    const { data, error } = await supabase.rpc("register_for_event", { event: id });
    if (error) throw error;
    const row = (data as { result: string; waitlist_position: number | null }[])[0];
    return { result: row?.result ?? "error", waitlistPosition: row?.waitlist_position ?? null };
  },

  async cancel(id) {
    const { data, error } = await supabase.rpc("cancel_event_registration", { event: id });
    if (error) throw error;
    return data as string;
  },

  async registrants(id) {
    const { data, error } = await supabase.rpc("event_registrants", { event: id });
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
