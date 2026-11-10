import { accountByUsername, platformName, sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  afterPasswordAccepted,
  CODE_MINUTES,
  CODES_PER_HOUR,
  generateCode,
  hashCode,
  RESEND_SECONDS,
  resetCodeEmail,
} from "../_shared/login-rules.ts";
import { sendEmail } from "../_shared/mail.ts";

const secret = () => Deno.env.get("OTP_SECRET")!;

/**
 * S04a, step 1 (REG-6): the member types their username. Every request gets a reset id and the same answer,
 * whether or not the username exists, so the screen never tells who has an account. Only a real member whose
 * account can sign in gets the code by email.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const name = String(body.username ?? "")
    .trim()
    .toLowerCase();
  const resetId = crypto.randomUUID();
  const code = generateCode();
  const codeHash = await hashCode(code, resetId, secret());

  const account = name ? await accountByUsername(name) : null;
  const canReset =
    account !== null &&
    account.status !== "staff" &&
    afterPasswordAccepted(account.status) === "send_code";
  const [row] = await sql`
    select private.start_password_reset(${canReset ? account.id : null}, ${resetId}, ${codeHash},
      ${CODE_MINUTES}, ${CODES_PER_HOUR}, ${RESEND_SECONDS}) as result`;
  if (canReset && row?.result === "ok") {
    await sendEmail(account.email, resetCodeEmail(account.language, await platformName(), code));
  }
  return json({ reset_id: resetId, resend_after_seconds: RESEND_SECONDS });
});
