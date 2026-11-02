import { type Email, notificationEmail } from "./emails.ts";
import { notificationCopy } from "./notifications.ts";

/** Login rules from PRD section 6 (criteria 7 and 8) and docs/screens.md S03 and S04. */

export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 3;
export const RESEND_SECONDS = 60;
export const CODES_PER_HOUR = 10;

export function secondsUntil(time: Date | null, now: Date): number {
  if (!time) return 0;
  return Math.max(0, Math.ceil((time.getTime() - now.getTime()) / 1000));
}

export function resendSecondsLeft(lastSentAt: Date, now: Date): number {
  return secondsUntil(new Date(lastSentAt.getTime() + RESEND_SECONDS * 1000), now);
}

/** A Member status, "staff", "inactive_staff" or "none". */
export type AccountStatus = string;
export type PasswordOutcome = "send_code" | "suspended" | "refused";

export function afterPasswordAccepted(status: AccountStatus): PasswordOutcome {
  if (["approved", "pending", "rejected", "staff"].includes(status)) return "send_code";
  if (status === "suspended") return "suspended";
  return "refused";
}

export function generateCode(): string {
  const limit = 4_294_000_000;
  for (;;) {
    const [n] = crypto.getRandomValues(new Uint32Array(1));
    if (n! < limit) return String(n! % 1_000_000).padStart(6, "0");
  }
}

export async function hashCode(code: string, sessionId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${sessionId}:${code}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Language = "en" | "sw";

export function loginCodeEmail(language: Language, platformName: string, code: string): Email {
  return notificationEmail(notificationCopy.A5, language, { platform_name: platformName, code });
}

export function lockedEmail(language: Language): Email {
  return notificationEmail(notificationCopy.L1, language, {});
}
