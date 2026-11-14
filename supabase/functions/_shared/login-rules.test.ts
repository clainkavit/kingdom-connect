import { describe, expect, it } from "vitest";
import {
  afterPasswordAccepted,
  lockKey,
  loginName,
  CODE_MINUTES,
  skipsCode,
  LOCK_AFTER_FAILURES,
  LOCK_MINUTES,
  generateCode,
  hashCode,
  lockedEmail,
  loginCodeEmail,
  resetCodeEmail,
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

describe("password reset code (docs/notifications.md A7, REG-6)", () => {
  it("sends the code in the member's language, and says it is for a password reset", () => {
    const en = resetCodeEmail("en", "Kingdom Connect", "123456");
    expect(en.subject).toBe("Reset your Kingdom Connect password");
    expect(en.text).toContain("123456");
    expect(en.text).toContain("reset your password");
    const sw = resetCodeEmail("sw", "Kingdom Connect", "123456");
    expect(sw.subject).toBe("Badilisha nenosiri lako la Kingdom Connect");
    expect(sw.text).toContain("123456");
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
  const on = { demoAccounts: true, testDataOnly: true };
  it("skips the email code only for fake test accounts on a project with demo accounts on", () => {
    expect(skipsCode("test.level2@example.test", on)).toBe(true);
    expect(skipsCode("test.admin@example.test", on)).toBe(true);
    expect(skipsCode("asha@test.invalid", on)).toBe(false);
    expect(skipsCode("nottest.level2@example.test", on)).toBe(false);
  });

  it("never skips the code unless both the secret and test_data_only are on (audit M1)", () => {
    const email = "test.level2@example.test";
    expect(skipsCode(email, { demoAccounts: false, testDataOnly: true })).toBe(false);
    expect(skipsCode(email, { demoAccounts: true, testDataOnly: false })).toBe(false);
    expect(skipsCode(email, { demoAccounts: false, testDataOnly: false })).toBe(false);
  });
});

describe("loginName (12 Nov 2026)", () => {
  it("reads an email, a Tanzanian phone number or a username", () => {
    expect(loginName(" Neema@Example.test ")).toEqual({
      kind: "email",
      value: "neema@example.test",
    });
    expect(loginName("0712 345 678")).toEqual({ kind: "phone", value: "+255712345678" });
    expect(loginName("+255712345678")).toEqual({ kind: "phone", value: "+255712345678" });
    expect(loginName("Neema_K")).toEqual({ kind: "username", value: "neema_k" });
    expect(loginName("12345")).toEqual({ kind: "username", value: "12345" });
  });

  it("locks per account, so the three ways share the 5 tries", () => {
    const phone = loginName("0712345678");
    expect(lockKey(phone, "u1")).toBe("member:u1");
    expect(lockKey(loginName("neema"), "u1")).toBe("member:u1");
    expect(lockKey(phone, null)).toBe("phone:+255712345678");
  });
});
