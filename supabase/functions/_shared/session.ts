import { accountById, sql, type Account } from "./db.ts";
import { json, requireUser } from "./http.ts";
import { passedSecondStep } from "./login-rules.ts";

/** The caller's account when they are signed in and passed the second step; otherwise the error response. */
export async function requireVerifiedAccount(req: Request): Promise<Account | Response> {
  const caller = await requireUser(req);
  if (!caller) return json({ error: "not_signed_in" }, 401);
  const account = await accountById(caller.userId);
  if (!account) return json({ error: "not_signed_in" }, 401);
  const [code] = await sql`
    select 1 from private.mfa_sessions where session_id = ${caller.sessionId}`;
  if (
    !passedSecondStep({
      hasEmailCode: Boolean(code),
      methods: caller.methods,
      status: account.status,
    })
  )
    return json({ error: "not_signed_in" }, 401);
  return account;
}
