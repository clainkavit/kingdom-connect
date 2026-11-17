import { serviceClient, sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, isUuid, json } from "../_shared/http.ts";
import { passwordProblem } from "../_shared/registration-rules.ts";
import { hashResetToken } from "../_shared/staff-reset.ts";

type Check = { result: string; staff_id: string | null; email: string | null };

/**
 * Admin-NewPassword (R30). With only the link's id and token, it says whose account the link is for. With a new
 * password too, it saves it once: every session ends, a lockout ends, and the staff member is told (E7).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : null;
  if (!isUuid(body.id) || !/^[0-9a-f]{64}$/.test(token)) return json({ error: "expired" }, 400);
  if (password !== null && passwordProblem(password)) return json({ error: "weak_password" }, 400);

  const [check] = (await sql`
    select result, staff_id, email
    from private.check_staff_reset(${body.id}, ${await hashResetToken(token)})`) as unknown as Check[];
  if (check?.result !== "ok" || !check.staff_id) return json({ error: "expired" }, 400);
  if (password === null) return json({ email: check.email });

  const { error } = await serviceClient.auth.admin.updateUserById(check.staff_id, {
    password,
    ban_duration: "none",
  });
  if (error) return json({ error: "failed" }, 500);
  await sql`select private.finish_staff_reset(${body.id}, ${clientIp(req)}::inet)`;
  return json({ ok: true });
});
