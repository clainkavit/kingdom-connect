import { accountById, sql, type Account } from "./db.ts";
import { json, requireUser } from "./http.ts";

/** The caller's account when they are signed in and passed the email code; otherwise the error response. */
export async function requireVerifiedAccount(req: Request): Promise<Account | Response> {
  const caller = await requireUser(req);
  if (!caller) return json({ error: "not_signed_in" }, 401);
  const [verified] = await sql`
    select 1 from private.mfa_sessions where session_id = ${caller.sessionId}`;
  if (!verified) return json({ error: "not_signed_in" }, 401);
  return (await accountById(caller.userId)) ?? json({ error: "not_signed_in" }, 401);
}
