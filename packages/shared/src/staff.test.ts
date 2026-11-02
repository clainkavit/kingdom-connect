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
});
