import { type Email, notificationEmail } from "./emails.ts";
import { notificationCopy } from "./notifications.ts";

export const RESET_LINK_HOURS = 24;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** A one-time secret for the reset link. Only its hash is stored. */
export function newResetToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashResetToken(token: string): Promise<string> {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
  );
}

export function resetLink(adminUrl: string, requestId: string, token: string): string {
  const url = new URL("/set-password", adminUrl);
  url.searchParams.set("reset", requestId);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Y3: staff accounts have no language setting, so the email carries both languages. */
export function resetLinkEmail(platformName: string, link: string): Email {
  const values = { platform_name: platformName, link };
  const en = notificationEmail(notificationCopy.Y3, "en", values);
  const sw = notificationEmail(notificationCopy.Y3, "sw", values);
  return { subject: en.subject, text: `${en.text}\n\n${sw.text}` };
}
