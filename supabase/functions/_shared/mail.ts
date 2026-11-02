import { platformName } from "./db.ts";
import type { Email } from "./emails.ts";

export async function sendEmail(to: string, email: Email): Promise<void> {
  const res = await fetch(Deno.env.get("MAIL_API_URL")!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: {
        Email: Deno.env.get("MAIL_FROM") ?? "noreply@example.test",
        Name: await platformName(),
      },
      To: [{ Email: to }],
      Subject: email.subject,
      Text: email.text,
    }),
  });
  if (!res.ok) throw new Error(`email failed: ${res.status}`);
}
