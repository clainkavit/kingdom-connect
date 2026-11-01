import { admin, anonClient, sql } from "../_shared/db.ts";
import { corsHeaders, json, sessionIdOf } from "../_shared/http.ts";
import {
  afterFailedPassword,
  afterPasswordAccepted,
  lockedEmail,
  lockSecondsLeft,
  LOCK_MINUTES,
  RESEND_SECONDS,
  type Attempts,
  type Language,
} from "../_shared/login-rules.ts";
import { sendEmail } from "../_shared/mail.ts";
import { issueCode } from "../_shared/otp.ts";

type Account = { id: string; email: string; status: string; language: Language };

const invalid = () => json({ error: "invalid_credentials" }, 401);

async function findAccount(body: { username?: string; email?: string }): Promise<Account | null> {
  if (body.username) {
    const [row] = await sql`
      select m.id, u.email, m.status, coalesce(p.language, 'en') as language
      from public.members m
      join auth.users u on u.id = m.id
      left join public.member_private p on p.member_id = m.id
      where m.username = ${body.username.trim()}::extensions.citext`;
    return (row as Account | undefined) ?? null;
  }
  if (body.email) {
    const [row] = await sql`
      select s.id, u.email, case when s.active then 'staff' else 'inactive_staff' end as status, 'en' as language
      from public.staff s
      join auth.users u on u.id = s.id
      where lower(u.email) = lower(${body.email.trim()})`;
    return (row as Account | undefined) ?? null;
  }
  return null;
}

async function loadAttempts(userId: string): Promise<Attempts | null> {
  const [row] =
    await sql`select failed_count, locked_until from private.login_attempts where user_id = ${userId}`;
  return row ? { failedCount: row.failed_count, lockedUntil: row.locked_until } : null;
}

async function recordFailure(
  account: Account,
  attempts: Attempts | null,
  now: Date,
): Promise<Response> {
  const next = afterFailedPassword(attempts, now);
  await sql`
    insert into private.login_attempts (user_id, failed_count, first_failed_at, locked_until, updated_at)
    values (${account.id}, ${next.failedCount}, ${now}, ${next.lockedUntil}, ${now})
    on conflict (user_id) do update
      set failed_count = excluded.failed_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at,
          first_failed_at = case when excluded.failed_count = 1 then excluded.first_failed_at else private.login_attempts.first_failed_at end`;
  if (!next.justLocked) return invalid();

  await admin.auth.admin.updateUserById(account.id, { ban_duration: `${LOCK_MINUTES}m` });
  await sql`
    insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
    values (null, 'login.locked', 'auth.users', ${account.id}, ${sql.json({ failed_count: next.failedCount })})`;
  await sendEmail(account.email, lockedEmail(account.language));
  return json({ error: "locked", retry_after_seconds: lockSecondsLeft(next, now) }, 423);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  if (typeof body.password !== "string" || !(body.username || body.email)) return invalid();

  const account = await findAccount(body);
  if (!account) return invalid();

  const now = new Date();
  const attempts = await loadAttempts(account.id);
  const locked = lockSecondsLeft(attempts, now);
  if (locked > 0) return json({ error: "locked", retry_after_seconds: locked }, 423);

  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: body.password,
  });
  if (error || !data.session) return recordFailure(account, attempts, now);

  await sql`delete from private.login_attempts where user_id = ${account.id}`;
  if (attempts?.lockedUntil)
    await admin.auth.admin.updateUserById(account.id, { ban_duration: "none" });

  const outcome = afterPasswordAccepted(account.status);
  if (outcome !== "send_code") {
    await admin.auth.admin.signOut(data.session.access_token, "local");
    return outcome === "suspended" ? json({ error: "suspended" }, 403) : invalid();
  }

  await issueCode(
    account.id,
    sessionIdOf(data.session.access_token),
    account.email,
    account.language,
  );
  return json({
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    user_status: account.status,
    resend_after_seconds: RESEND_SECONDS,
  });
});
