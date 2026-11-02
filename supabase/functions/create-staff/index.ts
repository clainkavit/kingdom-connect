import { serviceClient, sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, json } from "../_shared/http.ts";
import { emailProblem } from "../_shared/registration-rules.ts";
import { requireStaff } from "../_shared/staff.ts";

const roles = ["admin", "super_admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staffId = await requireStaff(req);
  if (staffId instanceof Response) return staffId;
  const [caller] = await sql`
    select 1 from public.staff where id = ${staffId} and active and role = 'super_admin'`;
  if (!caller) return json({ error: "not_super_admin" }, 403);

  const body = await req.json().catch(() => ({}));
  const fullName = String(body.fullName ?? "")
    .trim()
    .slice(0, 100);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const role = String(body.role ?? "");
  if (!fullName || emailProblem(email) || !roles.includes(role))
    return json({ error: "invalid" }, 400);

  const [taken] = await sql`select 1 from auth.users where lower(email) = ${email}`;
  if (taken) return json({ error: "email_taken" }, 409);

  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) return json({ error: "failed" }, 500);

  const ip = clientIp(req);
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: staffId })}, true)`;
      await tx`select set_config('request.headers', ${JSON.stringify(ip ? { "x-forwarded-for": ip } : {})}, true)`;
      await tx`
        insert into public.staff (id, full_name, role) values (${data.user.id}, ${fullName}, ${role})`;
    });
  } catch {
    const { error: cleanup } = await serviceClient.auth.admin.deleteUser(data.user.id);
    if (cleanup)
      console.error("create-staff: could not remove the half-created account", data.user.id);
    return json({ error: "failed" }, 500);
  }
  return json({ ok: true, id: data.user.id });
});
