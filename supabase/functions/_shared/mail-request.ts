import type { Email } from "./emails.ts";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export type MailRequest = { url: string; headers: Record<string, string>; body: string };

/** The request for one email: Brevo's transactional API when a key is set, the local mail catcher otherwise. */
export function mailRequest(
  to: string,
  email: Email,
  sender: { email: string; name: string },
  config: { brevoKey?: string; catcherUrl?: string },
): MailRequest {
  if (config.brevoKey) {
    return {
      url: BREVO_URL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": config.brevoKey,
      },
      body: JSON.stringify({
        sender: { email: sender.email, name: sender.name },
        to: [{ email: to }],
        subject: email.subject,
        textContent: email.text,
      }),
    };
  }
  if (!config.catcherUrl) throw new Error("no email service is set: BREVO_API_KEY or MAIL_API_URL");
  return {
    url: config.catcherUrl,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: sender.email, Name: sender.name },
      To: [{ Email: to }],
      Subject: email.subject,
      Text: email.text,
    }),
  };
}
