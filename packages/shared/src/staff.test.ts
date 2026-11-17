import { describe, expect, it, vi } from "vitest";
import { createStaffClient } from "./staff";

const client = (body: object) =>
  createStaffClient({
    url: "http://x",
    anonKey: "k",
    fetch: vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve(body) }) as unknown as typeof fetch,
  });

const staff = { fullName: "Test Admin", email: "a@example.test", role: "admin" as const };

describe("createStaffClient", () => {
  it("invites a staff member and reports why it could not", async () => {
    expect(await client({ ok: true }).invite("t", staff)).toBe("done");
    expect(await client({ error: "email_taken" }).invite("t", staff)).toBe("email_taken");
    expect(await client({ error: "invalid" }).invite("t", staff)).toBe("invalid");
    expect(await client({ error: "not_super_admin" }).invite("t", staff)).toBe("failed");
  });

  it("asks for a staff reset and reads each answer of the reset flow (R30)", async () => {
    expect(await client({ ok: true }).requestReset("a@example.test")).toBe(true);
    expect(await client({ ok: true }).decide("t", "send_link", "r")).toBe("done");
    expect(await client({ error: "own_request" }).decide("t", "send_link", "r")).toBe(
      "own_request",
    );
    expect(await client({ error: "not_found" }).decide("t", "refuse", "r")).toBe("gone");
    expect(await client({ error: "not_super_admin" }).decide("t", "unlock", "r")).toBe("failed");
    expect(await client({ email: "a@example.test" }).checkResetLink("r", "t")).toEqual({
      kind: "ok",
      email: "a@example.test",
    });
    expect(await client({ error: "expired" }).checkResetLink("r", "t")).toEqual({
      kind: "expired",
    });
    expect(await client({ ok: true }).finishReset("r", "t", "p")).toBe("done");
    expect(await client({ error: "weak_password" }).finishReset("r", "t", "p")).toBe(
      "weak_password",
    );
    expect(await client({ error: "boom" }).finishReset("r", "t", "p")).toBe("failed");
  });
});
