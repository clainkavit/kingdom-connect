import { describe, expect, it } from "vitest";
import {
  afterFailedPassword,
  afterPasswordAccepted,
  checkCode,
  generateCode,
  hashCode,
  lockedEmail,
  lockSecondsLeft,
  loginCodeEmail,
  resendSecondsLeft,
} from "./login-rules.ts";

const now = new Date("2026-11-02T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe("lockout (PRD section 6, criterion 8)", () => {
  it("counts a first failure", () => {
    expect(afterFailedPassword(null, now)).toEqual({
      failedCount: 1,
      lockedUntil: null,
      justLocked: false,
    });
  });

  it("locks for 15 minutes on the fifth failure", () => {
    expect(afterFailedPassword({ failedCount: 4, lockedUntil: null }, now)).toEqual({
      failedCount: 5,
      lockedUntil: minutes(15),
      justLocked: true,
    });
  });

  it("starts counting again once a lock has run out", () => {
    expect(afterFailedPassword({ failedCount: 5, lockedUntil: minutes(-1) }, now)).toEqual({
      failedCount: 1,
      lockedUntil: null,
      justLocked: false,
    });
  });

  it("reports the seconds left while locked, and zero after", () => {
    expect(lockSecondsLeft({ failedCount: 5, lockedUntil: minutes(15) }, now)).toBe(900);
    expect(lockSecondsLeft({ failedCount: 5, lockedUntil: minutes(-1) }, now)).toBe(0);
    expect(lockSecondsLeft(null, now)).toBe(0);
  });
});

describe("after a correct password (docs/screens.md S03)", () => {
  it("lets approved Members, Applicants and active Administrators continue to the code", () => {
    for (const status of ["approved", "pending", "rejected", "staff"]) {
      expect(afterPasswordAccepted(status)).toBe("send_code");
    }
  });

  it("shows a suspended Member their own message", () => {
    expect(afterPasswordAccepted("suspended")).toBe("suspended");
  });

  it("refuses everyone else with the generic message", () => {
    for (const status of ["deactivated", "deleted", "inactive_staff", "none"]) {
      expect(afterPasswordAccepted(status)).toBe("refused");
    }
  });
});

describe("email code (PRD section 6, criterion 7)", () => {
  const code = { expiresAt: minutes(10), attempts: 0, consumedAt: null };

  it("accepts the right code in time", () => {
    expect(checkCode(code, true, now)).toBe("ok");
  });

  it("counts a wrong code and says how many tries are left", () => {
    expect(checkCode(code, false, now)).toBe("wrong");
  });

  it("stops after 3 wrong tries, even with the right code", () => {
    expect(checkCode({ ...code, attempts: 3 }, true, now)).toBe("too_many");
  });

  it("refuses an expired code", () => {
    expect(checkCode({ ...code, expiresAt: minutes(-1) }, true, now)).toBe("expired");
  });

  it("refuses a code that was already used", () => {
    expect(checkCode({ ...code, consumedAt: minutes(-1) }, true, now)).toBe("used");
  });

  it("allows a resend 60 seconds after the last code", () => {
    expect(resendSecondsLeft(new Date(now.getTime() - 20_000), now)).toBe(40);
    expect(resendSecondsLeft(new Date(now.getTime() - 61_000), now)).toBe(0);
  });

  it("generates six digits", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("hashes a code with its session, so the same code differs per session", async () => {
    const a = await hashCode("123456", "session-a");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCode("123456", "session-a")).toBe(a);
    expect(await hashCode("123456", "session-b")).not.toBe(a);
  });
});

describe("emails (docs/notifications.md A5 and L1)", () => {
  it("sends the login code in English", () => {
    expect(loginCodeEmail("en", "Kingdom Connect", "123456")).toEqual({
      subject: "Your Kingdom Connect code",
      text: "Your code is 123456. It works for 10 minutes. Do not share it with anyone. If you did not try to sign in, ignore this email.",
    });
  });

  it("sends the login code in Kiswahili", () => {
    expect(loginCodeEmail("sw", "Kingdom Connect", "123456").subject).toBe(
      "Msimbo wako wa Kingdom Connect",
    );
  });

  it("tells the person their account is locked", () => {
    expect(lockedEmail("en").subject).toBe("Your account is locked for 15 minutes");
    expect(lockedEmail("sw").subject).toBe("Akaunti yako imefungwa kwa dakika 15");
  });
});
