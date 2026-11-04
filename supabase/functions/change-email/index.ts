import { anonClient, platformName, serviceClient, sql } from "../_shared/db.ts";
import { notificationEmail } from "../_shared/emails.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  CODE_ATTEMPTS,
  CODE_MINUTES,
  CODES_PER_HOUR,
  generateCode,
  hashCode,
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
} from "../_shared/login-rules.ts";
import { sendEmail } from "../_shared/mail.ts";
import { notificationCopy } from "../_shared/notifications.ts";
import { requireVerifiedAccount } from "../_shared/session.ts";

const secret = () => Deno.env.get("OTP_SECRET")!;
const codeHash = async (code: string, memberId: string) =>
  hashCode(code, `email-change:${memberId}`, secret());

const tooMany = new Set(["too_many_codes", "too_many_attempts", "locked"]);
const refuse = (error: string) => json({ error }, tooMany.has(error) ? 429 : 400);

async function passwordMatches(memberId: string, email: string, password: string) {
  const [member] = await sql`select username from public.members where id = ${memberId}`;
  const identifier = `username:${String(member?.username ?? "").toLowerCase()}`;
  const [attempt] = await sql`
    select allowed, attempt from private.start_login_attempt(${identifier}, ${memberId}, ${LOCK_AFTER_FAILURES})`;
  if (!attempt?.allowed) return "locked";
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    await sql`
      select * from private.finish_failed_login(${identifier}, ${attempt.attempt}, ${LOCK_AFTER_FAILURES},
        ${LOCK_MINUTES})`;
    return "wrong_password";
  }
  await serviceClient.auth.admin.signOut(data.session.access_token, "local");
  await sql`delete from private.login_attempts where identifier = ${identifier}`;
  return "ok";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;
  const [allowed] = await sql`select private.may_change_contact(${account.id}) as ok`;
  if (!allowed?.ok) return json({ error: "not_allowed" }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.step === "start") {
    if (typeof body.password !== "string" || typeof body.newEmail !== "string")
      return json({ error: "invalid" }, 400);
    const password = await passwordMatches(account.id, account.email, body.password);
    if (password !== "ok") return refuse(password);

    const code = generateCode();
    const [row] = await sql`
      select private.start_email_change(${account.id}, ${body.newEmail}, ${await codeHash(code, account.id)},
        ${CODE_MINUTES}, ${CODES_PER_HOUR}) as result`;
    if (row?.result === "taken") return json({ ok: true });
    if (row?.result !== "ok") return refuse(row?.result ?? "failed");
    await sendEmail(
      body.newEmail.trim().toLowerCase(),
      notificationEmail(notificationCopy.E3, account.language, {
        platform_name: await platformName(),
        code,
      }),
    );
    return json({ ok: true });
  }

  if (body.step === "confirm") {
    if (typeof body.code !== "string") return json({ error: "invalid" }, 400);
    const [checked] = await sql`
      select result, new_email from private.check_email_change_code(${account.id},
        ${await codeHash(body.code.trim(), account.id)}, ${CODE_ATTEMPTS})`;
    if (checked?.result !== "ok") return refuse(checked?.result ?? "failed");

    const { error } = await serviceClient.auth.admin.updateUserById(account.id, {
      email: checked.new_email,
      email_confirm: true,
    });
    if (error) return json({ error: "failed" }, 500);
    await sql`select private.finish_email_change(${account.id})`;
    await sendEmail(
      account.email,
      notificationEmail(notificationCopy.E1, account.language, {
        platform_name: await platformName(),
      }),
    );
    return json({ ok: true });
  }

  return json({ error: "invalid" }, 400);
});
