import { sql } from "./db.ts";
import { json } from "./http.ts";
import { requireVerifiedAccount } from "./session.ts";
import type { RegistrationDraft } from "./registration-rules.ts";

export type Applicant = {
  userId: string;
  draft: RegistrationDraft;
  submitted: boolean;
};

/** A signed-in Applicant who passed the email code, with their saved draft; otherwise the error response. */
export async function requireApplicant(req: Request): Promise<Applicant | Response> {
  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;
  if (account.status !== "pending") return json({ error: "not_an_applicant" }, 403);
  const [row] = await sql`
    select data, submitted_at from public.registration_drafts where member_id = ${account.id}`;
  return {
    userId: account.id,
    draft: (row?.data ?? {}) as RegistrationDraft,
    submitted: Boolean(row?.submitted_at),
  };
}
