/** The verification queue (A02, A03): waiting times and the staff actions, PRD section 6. */
import { functionCaller, type FunctionOptions } from "./auth";

const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const tanzaniaDay = (at: Date) => Math.floor((at.getTime() + TANZANIA_OFFSET_MS) / DAY_MS);

/** Monday to Friday days after the submission day, up to and including today, in Tanzania time. */
export function workingDaysSince(submittedAt: Date, now: Date): number {
  let count = 0;
  for (let day = tanzaniaDay(submittedAt) + 1; day <= tanzaniaDay(now); day++) {
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export const OVERDUE_WORKING_DAYS = 2;

export const isOverdue = (submittedAt: Date, now: Date) =>
  workingDaysSince(submittedAt, now) >= OVERDUE_WORKING_DAYS;

export type WaitingAge = { unit: "hours" | "days"; value: number };

export function waitingAge(submittedAt: Date, now: Date): WaitingAge {
  const hours = Math.floor((now.getTime() - submittedAt.getTime()) / (60 * 60 * 1000));
  return hours < 24
    ? { unit: "hours", value: hours }
    : { unit: "days", value: Math.floor(hours / 24) };
}

export type Decision =
  | { requestId: string; decision: "approved" }
  | { requestId: string; decision: "rejected"; reasonCode: string; note: string };

export type DecideResult =
  | { kind: "done" }
  | { kind: "already_decided" }
  | { kind: "reason_required" }
  | { kind: "note_has_contact_details" }
  | { kind: "member_not_pending" }
  | { kind: "failed" };

export type MarkDuplicateResult =
  { kind: "done" } | { kind: "unknown_member" } | { kind: "already_decided" } | { kind: "failed" };

const decideErrors = [
  "already_decided",
  "reason_required",
  "note_has_contact_details",
  "member_not_pending",
] as const;

/** Staff actions on an application, each through its audited Edge Function. */
export function createVerificationClient(options: FunctionOptions) {
  const call = functionCaller(options);
  return {
    async decide(accessToken: string, decision: Decision): Promise<DecideResult> {
      const r = await call("decide-application", decision, accessToken);
      if (r?.ok) return { kind: "done" };
      const known = decideErrors.find((e) => e === r?.error);
      return known ? { kind: known } : { kind: "failed" };
    },

    async markDuplicate(
      accessToken: string,
      requestId: string,
      username: string,
    ): Promise<MarkDuplicateResult> {
      const r = await call("mark-duplicate", { requestId, username }, accessToken);
      if (r?.ok) return { kind: "done" };
      if (r?.error === "unknown_member") return { kind: "unknown_member" };
      if (r?.error === "already_decided") return { kind: "already_decided" };
      return { kind: "failed" };
    },

    async revealIdNumber(accessToken: string, memberId: string): Promise<string | null> {
      const r = await call("reveal-id-number", { memberId }, accessToken);
      return typeof r?.idNumber === "string" ? r.idNumber : null;
    },
  };
}

export type VerificationClient = ReturnType<typeof createVerificationClient>;
