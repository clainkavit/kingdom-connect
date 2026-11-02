import { accountById } from "../_shared/db.ts";
import { corsHeaders, json, requireUser } from "../_shared/http.ts";
import { afterPasswordAccepted } from "../_shared/login-rules.ts";
import { checkCode } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await requireUser(req);
  if (!caller) return json({ error: "not_signed_in" }, 401);

  const account = await accountById(caller.userId);
  if (!account || afterPasswordAccepted(account.status) !== "send_code") {
    return json({ error: "not_signed_in" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const { result, attempts_left } = await checkCode(caller.sessionId, code);

  if (result === "ok") return json({ ok: true });
  if (result === "wrong_code") return json({ error: "wrong_code", attempts_left }, 400);
  return json({ error: result }, 400);
});
