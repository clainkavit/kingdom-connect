import { type Account, platformName, sql } from "./db.ts";
import {
  CODE_ATTEMPTS,
  CODE_MINUTES,
  CODES_PER_HOUR,
  generateCode,
  hashCode,
  loginCodeEmail,
} from "./login-rules.ts";
import { sendEmail } from "./mail.ts";

const secret = () => Deno.env.get("OTP_SECRET")!;

/** Sends a new code for the session, unless the person has had the hourly limit. */
export async function issueCode(account: Account, sessionId: string): Promise<boolean> {
  const code = generateCode();
  const [row] = await sql`
    select private.issue_login_code(${account.id}, ${sessionId}, ${await hashCode(code, sessionId, secret())},
      ${CODE_MINUTES}, ${CODES_PER_HOUR}) as issued`;
  if (!row?.issued) return false;
  await sendEmail(account.email, loginCodeEmail(account.language, await platformName(), code));
  return true;
}

export type CodeCheck = { result: string; attempts_left: number | null };

export async function checkCode(sessionId: string, code: string): Promise<CodeCheck> {
  const [row] = await sql`
    select result, attempts_left
    from private.check_login_code(${sessionId}, ${await hashCode(code, sessionId, secret())}, ${CODE_ATTEMPTS})`;
  return row as CodeCheck;
}

export async function lastCodeSentAt(sessionId: string): Promise<Date | null> {
  const [row] = await sql`
    select created_at from private.login_otps where session_id = ${sessionId}
    order by created_at desc limit 1`;
  return row?.created_at ?? null;
}
