import { describe, expect, it } from "vitest";
import { en } from "./en";
import { formatDate, formatNumber, languages, stringsFor } from "./index";
import { sw } from "./sw";

describe("string files", () => {
  it("have the same keys in English and Kiswahili", () => {
    expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
  });

  it("give every key a value of the same kind in both languages", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof sw[key], key).toBe(typeof en[key]);
      if (typeof en[key] === "string") expect((sw[key] as string).length, key).toBeGreaterThan(0);
    }
  });

  it("never use an em-dash", () => {
    for (const dictionary of [en, sw]) {
      for (const value of Object.values(dictionary)) {
        const text = typeof value === "function" ? (value as (...a: never[]) => string)() : value;
        expect(String(text)).not.toContain("—");
      }
    }
  });

  it("put the platform name into the sign-in title", () => {
    expect(en.loginTitle("Test Platform")).toBe("Log in to Test Platform");
    expect(sw.loginTitle("Test Platform")).toContain("Test Platform");
  });

  it("count tries in both languages", () => {
    expect(en.wrongCode(1)).toBe("That code is not right. 1 try left.");
    expect(en.wrongCode(2)).toBe("That code is not right. 2 tries left.");
    expect(sw.wrongCode(1)).toContain("jaribio 1");
    expect(sw.wrongCode(2)).toContain("majaribio 2");
  });
});

describe("stringsFor", () => {
  it("returns the dictionary for each language", () => {
    expect(stringsFor("en")).toBe(en);
    expect(stringsFor("sw")).toBe(sw);
  });

  it("lists English and Kiswahili by their own names", () => {
    expect(languages.map((l) => [l.code, l.name])).toEqual([
      ["en", "English"],
      ["sw", "Kiswahili"],
    ]);
  });
});

describe("formatting", () => {
  const date = new Date(Date.UTC(2026, 10, 2, 9, 0));

  it("writes dates in each language, in Tanzanian time", () => {
    expect(formatDate(date, "en")).toBe("2 November 2026");
    expect(formatDate(date, "sw")).toBe("2 Novemba 2026");
  });

  it("groups numbers", () => {
    expect(formatNumber(1284, "en")).toBe("1,284");
    expect(formatNumber(1284, "sw")).toBe("1,284");
  });
});
