import { json } from "./http.ts";
import { requireVerifiedAccount } from "./session.ts";

/** A signed-in, active staff account that passed the email code; otherwise the error response. */
export async function requireStaff(req: Request): Promise<string | Response> {
  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;
  if (account.status !== "staff") return json({ error: "not_staff" }, 403);
  return account.id;
}
