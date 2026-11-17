import { anonClient, sql } from "../_shared/db.ts";
import { corsHeaders, json, sessionIdOf } from "../_shared/http.ts";
import { CODE_ATTEMPTS, hashCode } from "../_shared/login-rules.ts";
import { normalizePhone } from "../_shared/registration-rules.ts";

/**
 * S04b step 2: checks the SMS code with the email code's rules (10 minutes, 3 attempts). Only a right code
 * finishes the Supabase Auth sign-in and marks the session as checked, which the access token reads as
 * otp_verified. A session made by calling Supabase Auth directly is never marked, so it reads nothing.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!phone || !/^\d{6}$/.test(code))
    return json({ error: "wrong_code", attempts_left: null }, 400);

  const [check] = await sql`
    select result, attempts_left from private.check_phone_code(${phone},
      ${await hashCode(code, phone, Deno.env.get("OTP_SECRET")!)}, ${CODE_ATTEMPTS})`;
  if (check?.result !== "ok") {
    return json(
      { error: check?.result ?? "no_code", attempts_left: check?.attempts_left ?? null },
      400,
    );
  }

  const { data, error } = await anonClient().auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error || !data.session || !data.user) return json({ error: "expired" }, 400);

  await sql`
    insert into private.mfa_sessions (session_id, user_id)
    values (${sessionIdOf(data.session.access_token)}, ${data.user.id})
    on conflict on constraint mfa_sessions_pkey do nothing`;
  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});
