import { platformName, sql } from "./db.ts";
import type { Email } from "./emails.ts";
import { mailRequest } from "./mail-request.ts";

export async function sendEmail(to: string, email: Email): Promise<void> {
  const request = mailRequest(
    to,
    email,
    { email: Deno.env.get("MAIL_FROM") ?? "noreply@example.test", name: await platformName() },
    { brevoKey: Deno.env.get("BREVO_API_KEY"), catcherUrl: Deno.env.get("MAIL_API_URL") },
  );
  const res = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  if (!res.ok) throw new Error(`email failed: ${res.status}`);
  try {
    await sql`select private.count_email_sent()`;
  } catch (error) {
    console.error("could not count the email", error);
  }
}
