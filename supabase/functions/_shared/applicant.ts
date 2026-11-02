import { accountById, sql } from "./db.ts";
import { json, requireUser } from "./http.ts";
import type { RegistrationDraft } from "./registration-rules.ts";

export type Applicant = {
  userId: string;
  draft: RegistrationDraft;
  submitted: boolean;
};

/** A signed-in Applicant who passed the email code, with their saved draft; otherwise the error response. */
export async function requireApplicant(req: Request): Promise<Applicant | Response> {
  const caller = await requireUser(req);
  if (!caller) return json({ error: "not_signed_in" }, 401);
  const [verified] = await sql`
    select 1 from private.mfa_sessions where session_id = ${caller.sessionId}`;
  if (!verified) return json({ error: "not_signed_in" }, 401);
  const account = await accountById(caller.userId);
  if (account?.status !== "pending") return json({ error: "not_an_applicant" }, 403);
  const [row] = await sql`
    select data, submitted_at from public.registration_drafts where member_id = ${caller.userId}`;
  return {
    userId: caller.userId,
    draft: (row?.data ?? {}) as RegistrationDraft,
    submitted: Boolean(row?.submitted_at),
  };
}
