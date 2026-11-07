import { eventStart } from "./event-rules";

/** Checks for the training form that need no database (T01). */

export type TrainingFormat = "in_person" | "online";

export type TrainingDraft = {
  title: string;
  provider: string;
  format: TrainingFormat;
  details: string;
  venue: string;
  selfPaced: boolean;
  /** YYYY-MM-DD, Tanzania time. Ignored when self-paced. */
  date: string;
  /** HH:MM, 24-hour, Tanzania time. Ignored when self-paced. */
  time: string;
  seats: string;
  downloadsAllowed: boolean;
};

export type TrainingProblem = "title" | "provider" | "venue" | "start" | "seats" | "details";

/** The start as an instant, or null for self-paced training. */
export function trainingStart(draft: TrainingDraft): Date | null {
  return draft.selfPaced ? null : eventStart(draft.date, draft.time);
}

export function checkTraining(
  draft: TrainingDraft,
  now: Date = new Date(),
): TrainingProblem | null {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 120) return "title";
  const provider = draft.provider.trim();
  if (provider.length < 2 || provider.length > 120) return "provider";
  if (draft.details.trim().length > 2000) return "details";
  const venue = draft.venue.trim();
  if (draft.format === "in_person" && (venue.length < 3 || venue.length > 200)) return "venue";
  if (!draft.selfPaced) {
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
  }
  const seats = Number(draft.seats.trim());
  if (!/^\d+$/.test(draft.seats.trim()) || seats < 1 || seats > 5000) return "seats";
  return null;
}
