import { describe, expect, it } from "vitest";
import { isTestAccount, parseTestLogins } from "./test-logins";

describe("parseTestLogins", () => {
  it("keeps fake accounts only", () => {
    const raw = JSON.stringify([
      { label: "Member", login: "test_level1", password: "pw-1" },
      { label: "Admin", login: "test.admin@example.test", password: "pw-2" },
      { label: "Real", login: "asha@test.invalid", password: "pw-3" },
      { label: "Real user", login: "asha", password: "pw-4" },
      { label: "No password", login: "test_level2", password: "" },
    ]);
    expect(parseTestLogins(raw).map((l) => l.login)).toEqual([
      "test_level1",
      "test.admin@example.test",
    ]);
  });

  it("is empty when unset or not a list", () => {
    expect(parseTestLogins(undefined)).toEqual([]);
    expect(parseTestLogins("")).toEqual([]);
    expect(parseTestLogins("not json")).toEqual([]);
    expect(parseTestLogins('{"a":1}')).toEqual([]);
  });

  it("knows a fake account by its name", () => {
    expect(isTestAccount("test_level3")).toBe(true);
    expect(isTestAccount("x@example.test")).toBe(true);
    expect(isTestAccount("x@test.invalid")).toBe(false);
    expect(isTestAccount("tester")).toBe(false);
  });
});
