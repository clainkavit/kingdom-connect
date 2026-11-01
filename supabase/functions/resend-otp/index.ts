import { admin, sql } from "../_shared/db.ts";
import { bearer, corsHeaders, json, sessionIdOf } from "../_shared/http.ts";
import { RESEND_SECONDS, resendSecondsLeft, type Language } from "../_shared/login-rules.ts";
import { issueCode } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearer(req);
  const { data: user } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!token || !user.user) return json({ error: "not_signed_in" }, 401);

  const sessionId = sessionIdOf(token);
  const [last] = await sql`
    select created_at from private.login_otps where session_id = ${sessionId}
    order by created_at desc limit 1`;
  const wait = last ? resendSecondsLeft(last.created_at, new Date()) : 0;
  if (wait > 0) return json({ error: "too_soon", retry_after_seconds: wait }, 429);

  const [account] = await sql`
    select coalesce(p.language, 'en') as language
    from auth.users u left join public.member_private p on p.member_id = u.id
    where u.id = ${user.user.id}`;
  await issueCode(
    user.user.id,
    sessionId,
    user.user.email!,
    (account?.language ?? "en") as Language,
  );
  return json({ ok: true, resend_after_seconds: RESEND_SECONDS });
});
