import {
  type Account,
  accountByUsername,
  anonClient,
  serviceClient,
  sql,
  staffAccountByEmail,
} from "../_shared/db.ts";
import { corsHeaders, json, sessionIdOf } from "../_shared/http.ts";
import {
  afterPasswordAccepted,
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  lockedEmail,
  RESEND_SECONDS,
  secondsUntil,
  skipsCode,
} from "../_shared/login-rules.ts";
import { sendEmail } from "../_shared/mail.ts";
import { issueCode } from "../_shared/otp.ts";

const invalid = () => json({ error: "invalid_credentials" }, 401);
const locked = (until: Date) =>
  json({ error: "locked", retry_after_seconds: secondsUntil(until, new Date()) }, 423);

type Attempt = { allowed: boolean; attempt: number; locked_until: Date | null };

async function startAttempt(identifier: string, account: Account | null): Promise<Attempt> {
  const [row] = await sql`
    select allowed, attempt, locked_until
    from private.start_login_attempt(${identifier}, ${account?.id ?? null}, ${LOCK_AFTER_FAILURES})`;
  return row as Attempt;
}

async function recordFailure(
  identifier: string,
  attempt: number,
  account: Account | null,
): Promise<Response> {
  const [row] = await sql`
    select just_locked, locked_until
    from private.finish_failed_login(${identifier}, ${attempt}, ${LOCK_AFTER_FAILURES}, ${LOCK_MINUTES})`;
  if (!row?.just_locked) return invalid();

  if (account) {
    await serviceClient.auth.admin.updateUserById(account.id, { ban_duration: `${LOCK_MINUTES}m` });
    await sql`
      insert into private.audit_log (action, target_type, target_id, after)
      values ('login.locked', 'auth.users', ${account.id}, ${sql.json({ failed_count: attempt })})`;
    await sendEmail(account.email, lockedEmail(account.language));
  }
  return locked(row.locked_until);
}

async function spendPasswordTime(password: string): Promise<void> {
  await sql`select extensions.crypt(${password}, extensions.gen_salt('bf', 10))`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const name: string = (body.username ?? body.email ?? "").toString().trim().toLowerCase();
  if (typeof body.password !== "string" || !name) return invalid();
  const identifier = `${body.username ? "username" : "email"}:${name}`;

  const account = body.username ? await accountByUsername(name) : await staffAccountByEmail(name);
  const attempt = await startAttempt(identifier, account);
  if (!attempt.allowed) {
    return attempt.locked_until
      ? locked(attempt.locked_until)
      : json({ error: "locked", retry_after_seconds: LOCK_MINUTES * 60 }, 423);
  }

  if (!account) {
    await spendPasswordTime(body.password);
    return recordFailure(identifier, attempt.attempt, null);
  }

  const { data, error } = await anonClient().auth.signInWithPassword({
    email: account.email,
    password: body.password,
  });
  if (error || !data.session) return recordFailure(identifier, attempt.attempt, account);

  await sql`delete from private.login_attempts where identifier = ${identifier}`;

  const outcome = afterPasswordAccepted(account.status);
  if (outcome !== "send_code") {
    await serviceClient.auth.admin.signOut(data.session.access_token, "local");
    return outcome === "suspended" ? json({ error: "suspended" }, 403) : invalid();
  }

  const demoAccount = skipsCode(account.email, Deno.env.get("DEMO_ACCOUNTS") === "1");
  if (!demoAccount && !(await issueCode(account, sessionIdOf(data.session.access_token)))) {
    await serviceClient.auth.admin.signOut(data.session.access_token, "local");
    return json({ error: "too_many_codes" }, 429);
  }
  return json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    resend_after_seconds: RESEND_SECONDS,
  });
});
