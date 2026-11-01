/** Login rules from PRD section 6 (criteria 7 and 8) and docs/screens.md S03 and S04. */

export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 3;
export const RESEND_SECONDS = 60;

export type Attempts = { failedCount: number; lockedUntil: Date | null };

export function lockSecondsLeft(attempts: Attempts | null, now: Date): number {
  if (!attempts?.lockedUntil) return 0;
  return Math.max(0, Math.ceil((attempts.lockedUntil.getTime() - now.getTime()) / 1000));
}

export function afterFailedPassword(
  attempts: Attempts | null,
  now: Date,
): Attempts & { justLocked: boolean } {
  const lockOver = attempts?.lockedUntil != null && attempts.lockedUntil <= now;
  const failedCount = (lockOver ? 0 : (attempts?.failedCount ?? 0)) + 1;
  if (failedCount >= LOCK_AFTER_FAILURES) {
    return {
      failedCount,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
      justLocked: true,
    };
  }
  return { failedCount, lockedUntil: null, justLocked: false };
}

export type PasswordOutcome = "send_code" | "suspended" | "refused";

/** status is the Member status, "staff", "inactive_staff" or "none". */
export function afterPasswordAccepted(status: string): PasswordOutcome {
  if (["approved", "pending", "rejected", "staff"].includes(status)) return "send_code";
  if (status === "suspended") return "suspended";
  return "refused";
}

export type CodeRow = { expiresAt: Date; attempts: number; consumedAt: Date | null };
export type CodeResult = "ok" | "wrong" | "too_many" | "expired" | "used";

export function checkCode(row: CodeRow, matches: boolean, now: Date): CodeResult {
  if (row.consumedAt) return "used";
  if (row.attempts >= CODE_ATTEMPTS) return "too_many";
  if (row.expiresAt <= now) return "expired";
  return matches ? "ok" : "wrong";
}

export function resendSecondsLeft(lastSentAt: Date, now: Date): number {
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_SECONDS - elapsed));
}

export function generateCode(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n! % 1_000_000).padStart(6, "0");
}

export async function hashCode(code: string, sessionId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${sessionId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Language = "en" | "sw";
export type Email = { subject: string; text: string };

export function loginCodeEmail(language: Language, platformName: string, code: string): Email {
  return language === "sw"
    ? {
        subject: `Msimbo wako wa ${platformName}`,
        text: `Msimbo wako ni ${code}. Unatumika kwa dakika 10. Usimpe mtu yeyote. Kama hukujaribu kuingia, puuza barua pepe hii.`,
      }
    : {
        subject: `Your ${platformName} code`,
        text: `Your code is ${code}. It works for 10 minutes. Do not share it with anyone. If you did not try to sign in, ignore this email.`,
      };
}

export function lockedEmail(language: Language): Email {
  return language === "sw"
    ? {
        subject: "Akaunti yako imefungwa kwa dakika 15",
        text: "Kumekuwa na majaribio 5 ya kuingia yaliyoshindwa. Jaribu tena baada ya dakika 15. Kama si wewe, badilisha nenosiri lako baadaye.",
      }
    : {
        subject: "Your account is locked for 15 minutes",
        text: "There were 5 failed sign-in attempts. Try again after 15 minutes. If this was not you, change your password afterwards.",
      };
}
