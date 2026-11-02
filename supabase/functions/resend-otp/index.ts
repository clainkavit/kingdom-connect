import { accountById } from "../_shared/db.ts";
import { corsHeaders, json, requireUser } from "../_shared/http.ts";
import {
  afterPasswordAccepted,
  RESEND_SECONDS,
  resendSecondsLeft,
} from "../_shared/login-rules.ts";
import { issueCode, lastCodeSentAt } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = await requireUser(req);
  if (!caller) return json({ error: "not_signed_in" }, 401);

  const account = await accountById(caller.userId);
  if (!account || afterPasswordAccepted(account.status) !== "send_code") {
    return json({ error: "not_signed_in" }, 401);
  }

  const lastSent = await lastCodeSentAt(caller.sessionId);
  if (!lastSent) return json({ error: "no_code" }, 400);

  const wait = resendSecondsLeft(lastSent, new Date());
  if (wait > 0) return json({ error: "too_soon", retry_after_seconds: wait }, 429);

  if (!(await issueCode(account, caller.sessionId))) {
    return json({ error: "too_many_codes" }, 429);
  }
  return json({ ok: true, resend_after_seconds: RESEND_SECONDS });
});
