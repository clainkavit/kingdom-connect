import { admin, sql } from "../_shared/db.ts";
import { bearer, corsHeaders, json, sessionIdOf } from "../_shared/http.ts";
import { checkCode, CODE_ATTEMPTS, hashCode } from "../_shared/login-rules.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = bearer(req);
  const { data: user } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!token || !user.user) return json({ error: "not_signed_in" }, 401);

  const sessionId = sessionIdOf(token);
  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const [row] = await sql`
    select id, code_hash, expires_at, attempts, consumed_at
    from private.login_otps where session_id = ${sessionId}
    order by created_at desc limit 1`;
  if (!row) return json({ error: "no_code" }, 400);

  const matches = (await hashCode(code, sessionId)) === row.code_hash;
  const result = checkCode(
    { expiresAt: row.expires_at, attempts: row.attempts, consumedAt: row.consumed_at },
    matches,
    new Date(),
  );

  if (result === "ok") {
    await sql.begin(async (tx) => {
      await tx`update private.login_otps set consumed_at = now() where id = ${row.id}`;
      await tx`insert into private.mfa_sessions (session_id, user_id) values (${sessionId}, ${user.user!.id})
               on conflict (session_id) do nothing`;
    });
    return json({ ok: true });
  }

  if (result === "wrong") {
    const [updated] = await sql`
      update private.login_otps set attempts = attempts + 1 where id = ${row.id} returning attempts`;
    const left = CODE_ATTEMPTS - updated!.attempts;
    return json({ error: left > 0 ? "wrong_code" : "too_many", attempts_left: left }, 400);
  }

  return json({ error: result === "used" ? "no_code" : result }, 400);
});
