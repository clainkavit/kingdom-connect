import { describe, expect, it } from "vitest";
import {
  afterPasswordAccepted,
  CODE_MINUTES,
  skipsCode,
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  generateCode,
  hashCode,
  lockedEmail,
  loginCodeEmail,
  resendSecondsLeft,
  secondsUntil,
} from "./login-rules.ts";

const now = new Date("2026-11-02T10:00:00Z");

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

describe("timers", () => {
  it("reports the seconds left until a time, and zero after it", () => {
    expect(secondsUntil(new Date(now.getTime() + 900_000), now)).toBe(900);
    expect(secondsUntil(new Date(now.getTime() - 1_000), now)).toBe(0);
    expect(secondsUntil(null, now)).toBe(0);
  });

  it("allows a resend 60 seconds after the last code (PRD section 6, criterion 7)", () => {
    expect(resendSecondsLeft(new Date(now.getTime() - 20_000), now)).toBe(40);
    expect(resendSecondsLeft(new Date(now.getTime() - 61_000), now)).toBe(0);
  });
});

describe("codes", () => {
  it("generates six digits", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("hashes a code with its session and a server secret", async () => {
    const a = await hashCode("123456", "session-a", "secret-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCode("123456", "session-a", "secret-1")).toBe(a);
    expect(await hashCode("123456", "session-b", "secret-1")).not.toBe(a);
    expect(await hashCode("123456", "session-a", "secret-2")).not.toBe(a);
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

  it("say the same numbers the rules use", () => {
    expect(loginCodeEmail("en", "P", "1").text).toContain(`${CODE_MINUTES} minutes`);
    expect(lockedEmail("en").subject).toContain(`${LOCK_MINUTES} minutes`);
    expect(lockedEmail("en").text).toContain(`${LOCK_AFTER_FAILURES} failed`);
  });

  it("tells the person their account is locked", () => {
    expect(lockedEmail("en")).toEqual({
      subject: "Your account is locked for 15 minutes",
      text: "There were 5 failed sign-in attempts. Try again after 15 minutes. If this was not you, change your password afterwards.",
    });
    expect(lockedEmail("sw").subject).toBe("Akaunti yako imefungwa kwa dakika 15");
  });
});

describe("skipsCode", () => {
  it("skips the email code only for fake test accounts on a project with demo accounts on", () => {
    expect(skipsCode("test.level2@example.test", true)).toBe(true);
    expect(skipsCode("test.admin@example.test", true)).toBe(true);
    expect(skipsCode("test.level2@example.test", false)).toBe(false);
    expect(skipsCode("asha@test.invalid", true)).toBe(false);
    expect(skipsCode("nottest.level2@example.test", true)).toBe(false);
  });
});
