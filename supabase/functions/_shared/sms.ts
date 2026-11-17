import { platformName, sql } from "./db.ts";
import { notificationCopy, notificationText } from "./notifications.ts";
import type { Language } from "./login-rules.ts";
import { smsRequest } from "./sms-request.ts";

/** Sends the A9 phone sign-in code. Without a provider key the test sender keeps it in private.test_sms. */
export async function sendPhoneCode(
  phone: string,
  language: Language,
  code: string,
): Promise<void> {
  const { message } = notificationText(notificationCopy.A9, language, {
    platform_name: await platformName(),
    code,
  });
  const request = smsRequest(phone, message, {
    apiKey: Deno.env.get("AFRICASTALKING_API_KEY"),
    username: Deno.env.get("AFRICASTALKING_USERNAME"),
    senderId: Deno.env.get("SMS_SENDER_ID"),
  });
  if (!request) {
    if (Deno.env.get("SMS_SENDER") !== "test") throw new Error("no SMS provider is set up");
    await sql`insert into private.test_sms (phone, body) values (${phone}, ${message})`;
    return;
  }
  const res = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  if (!res.ok) throw new Error(`sms failed: ${res.status}`);
}
