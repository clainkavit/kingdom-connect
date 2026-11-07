/** Checks and helpers for events that need no database (T03). */

export type EventDraft = {
  title: string;
  details: string;
  /** YYYY-MM-DD, Tanzania time. */
  date: string;
  /** HH:MM, 24-hour, Tanzania time. */
  time: string;
  venue: string;
  link: string;
  capacity: string;
};

export type EventProblem = "title" | "start" | "venue_or_link" | "link" | "capacity" | "details";

/** The start as an instant, reading the date and time as Tanzania time (UTC+3, no daylight saving). */
export function eventStart(date: string, time: string): Date | null {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !clock) return null;
  const h = Number(clock[1]);
  const m = Number(clock[2]);
  if (h > 23 || m > 59) return null;
  const start = new Date(
    `${date.trim()}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+03:00`,
  );
  if (Number.isNaN(start.getTime())) return null;
  // A day that does not exist, such as 31 April, would roll over into the next month.
  const tanzaniaDay = new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return tanzaniaDay === date.trim() ? start : null;
}

export function checkEvent(draft: EventDraft, now: Date = new Date()): EventProblem | null {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 120) return "title";
  if (draft.details.trim().length > 2000) return "details";
  const start = eventStart(draft.date, draft.time);
  const twoHours = 2 * 60 * 60 * 1000;
  const year = 365 * 24 * 60 * 60 * 1000;
  if (
    !start ||
    start.getTime() < now.getTime() + twoHours ||
    start.getTime() > now.getTime() + year
  ) {
    return "start";
  }
  const venue = draft.venue.trim();
  const link = draft.link.trim();
  if (!venue && !link) return "venue_or_link";
  if (venue && (venue.length < 3 || venue.length > 200)) return "venue_or_link";
  if (link && !/^https:\/\/\S+$/.test(link)) return "link";
  const capacity = Number(draft.capacity.trim());
  if (!/^\d+$/.test(draft.capacity.trim()) || capacity < 1 || capacity > 5000) return "capacity";
  return null;
}

/** A Google Calendar link that opens a new entry filled in, on the web and on phones. */
export function calendarLink(event: {
  title: string;
  startsAt: string;
  venue: string | null;
  link: string | null;
  details: string | null;
}): string {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [event.details, event.link].filter(Boolean).join("\n\n"),
    location: event.venue ?? event.link ?? "",
    ctz: "Africa/Dar_es_Salaam",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
