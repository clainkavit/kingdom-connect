import { accountById, serviceClient, sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { afterPasswordAccepted, CODE_ATTEMPTS, hashCode } from "../_shared/login-rules.ts";
import { passwordProblem } from "../_shared/registration-rules.ts";

const secret = () => Deno.env.get("OTP_SECRET")!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Check = { result: string; attempts_left: number | null; user_id: string | null };

/**
 * S04a, steps 2 and 3 (REG-6). With only the code, it confirms the code. With the code and a new password, it
 * saves the password; every other device is signed out, a running lockout ends and the member is told (E7). The
 * member then logs in again with the email code.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const resetId = String(body.reset_id ?? "");
  const code = String(body.code ?? "").trim();
  const password = typeof body.password === "string" ? body.password : null;
  if (!UUID.test(resetId))
    return json({ error: "wrong_code", attempts_left: CODE_ATTEMPTS - 1 }, 400);
  if (password !== null && passwordProblem(password)) return json({ error: "weak_password" }, 400);

  const [check] = (await sql`
    select result, attempts_left, user_id
    from private.check_password_reset(${resetId}, ${await hashCode(code, resetId, secret())},
      ${CODE_ATTEMPTS}, ${password !== null})`) as unknown as Check[];
  if (check.result === "wrong_code") {
    return json({ error: "wrong_code", attempts_left: check.attempts_left }, 400);
  }
  if (check.result !== "ok" || !check.user_id) return json({ error: check.result }, 400);
  if (password === null) return json({ ok: true });

  const account = await accountById(check.user_id);
  if (!account || afterPasswordAccepted(account.status) !== "send_code") {
    return json({ error: "expired" }, 400);
  }
  const { error } = await serviceClient.auth.admin.updateUserById(account.id, {
    password,
    ban_duration: "none",
  });
  if (error) return json({ error: "failed" }, 500);
  await sql`select private.finish_password_reset(${account.id})`;
  return json({ ok: true });
});
