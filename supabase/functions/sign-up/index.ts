import { serviceClient, sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  normalizePhone,
  normalizeUsername,
  signUpProblems,
} from "../_shared/registration-rules.ts";

async function registrationsOpen(): Promise<boolean> {
  const [row] = await sql`
    select bool_or(value = 'true'::jsonb) as open from public.platform_settings
    where key in ('real_registrations_open', 'test_data_only')`;
  return Boolean(row?.open);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const input = {
    username: String(body.username ?? ""),
    email: String(body.email ?? "")
      .trim()
      .toLowerCase(),
    phone: String(body.phone ?? ""),
    password: String(body.password ?? ""),
    language: body.language === "sw" ? "sw" : "en",
  };
  const problems = signUpProblems(input);
  if (Object.keys(problems).length) return json({ error: "invalid", problems }, 400);
  if (!(await registrationsOpen())) return json({ error: "closed" }, 403);
  const [cap] = await sql`select private.application_cap_reached() as reached`;
  if (cap?.reached) return json({ error: "cap_reached" }, 429);

  const username = normalizeUsername(input.username);
  const [taken] =
    await sql`select 1 from public.members where username = ${username}::extensions.citext`;
  if (taken) return json({ error: "username_taken" }, 409);

  const { data, error } = await serviceClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    return json({ error: exists ? "email_taken" : "failed" }, exists ? 409 : 500);
  }

  try {
    await sql.begin(async (tx) => {
      await tx`insert into public.members (id, username) values (${data.user.id}, ${username})`;
      await tx`
        insert into public.member_private (member_id, email, phone, language)
        values (${data.user.id}, ${input.email}, ${normalizePhone(input.phone)},
                ${input.language})`;
    });
  } catch (cause) {
    const { error: cleanup } = await serviceClient.auth.admin.deleteUser(data.user.id);
    if (cleanup) console.error("sign-up: could not remove the half-created account", data.user.id);
    const failure = cause as { code?: string; constraint_name?: string };
    const clash = failure.code === "23505" && failure.constraint_name === "members_username_key";
    return json({ error: clash ? "username_taken" : "failed" }, clash ? 409 : 500);
  }
  return json({ ok: true }, 201);
});
