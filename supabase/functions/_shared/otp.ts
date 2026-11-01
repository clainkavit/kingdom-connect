import { sql } from "./db.ts";
import {
  CODE_MINUTES,
  generateCode,
  hashCode,
  loginCodeEmail,
  type Language,
} from "./login-rules.ts";
import { platformName } from "./db.ts";
import { sendEmail } from "./mail.ts";

export async function issueCode(
  userId: string,
  sessionId: string,
  email: string,
  language: Language,
) {
  const code = generateCode();
  const codeHash = await hashCode(code, sessionId);
  await sql.begin(async (tx) => {
    await tx`delete from private.login_otps where session_id = ${sessionId}`;
    await tx`insert into private.login_otps (user_id, session_id, code_hash, expires_at)
             values (${userId}, ${sessionId}, ${codeHash}, now() + make_interval(mins => ${CODE_MINUTES}))`;
  });
  await sendEmail(email, loginCodeEmail(language, await platformName(), code));
}
