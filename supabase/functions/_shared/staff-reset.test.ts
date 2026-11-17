import { describe, expect, it } from "vitest";
import { hashResetToken, newResetToken, resetLink, resetLinkEmail } from "./staff-reset.ts";

describe("staff reset link (R30)", () => {
  it("makes a long random token and stores only a fixed-length hash", async () => {
    const token = newResetToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(newResetToken()).not.toBe(token);
    const hash = await hashResetToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(await hashResetToken(token)).toBe(hash);
  });

  it("links to the admin console's set-password page", () => {
    expect(resetLink("http://localhost:3000", "r1", "t1")).toBe(
      "http://localhost:3000/set-password?reset=r1&token=t1",
    );
  });

  it("puts the link in the email in English and Kiswahili", () => {
    const email = resetLinkEmail("Kingdom Connect", "http://x/set-password?reset=r&token=t");
    expect(email.subject).toBe("Choose a new password for Kingdom Connect");
    expect(email.text.match(/http:\/\/x\/set-password\?reset=r&token=t/g)).toHaveLength(2);
    expect(email.text).toContain("Msimamizi Mkuu");
  });
});
