import { describe, expect, it, vi } from "vitest";
import { addSkill, createProfileClient, normalizeSkill } from "./profile";

describe("normalizeSkill (S12)", () => {
  it("lowercases, trims and keeps one space between words", () => {
    expect(normalizeSkill("  Project   Management ")).toBe("project management");
  });
});

describe("addSkill", () => {
  it("adds a new tag once, in its normal form", () => {
    expect(addSkill(["excel"], " Welding ")).toEqual({ skills: ["excel", "welding"] });
    expect(addSkill(["excel"], "EXCEL")).toEqual({ skills: ["excel"] });
    expect(addSkill(["excel"], "   ")).toEqual({ skills: ["excel"] });
  });

  it("refuses a tag that is too long, or a 21st tag", () => {
    expect(addSkill([], "a".repeat(41))).toEqual({ skills: [], problem: "too_long" });
    const twenty = Array.from({ length: 20 }, (_, i) => `skill ${i}`);
    expect(addSkill(twenty, "one more")).toEqual({ skills: twenty, problem: "too_many" });
  });
});

describe("createProfileClient", () => {
  const client = (body: object) =>
    createProfileClient({
      url: "http://x",
      anonKey: "k",
      fetch: vi
        .fn()
        .mockResolvedValue({ json: () => Promise.resolve(body) }) as unknown as typeof fetch,
    });

  it("saves the skill tags and reports why it could not", async () => {
    expect(await client({ ok: true }).setSkills("t", ["excel"])).toBe("done");
    expect(await client({ error: "too_many" }).setSkills("t", [])).toBe("too_many");
    expect(await client({ error: "too_long" }).setSkills("t", [])).toBe("too_long");
    expect(await client({ error: "boom" }).setSkills("t", [])).toBe("failed");
  });
});
