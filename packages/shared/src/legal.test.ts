import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compareVersions,
  fillLegalText,
  isDraftVersion,
  legalBlocks,
  legalKinds,
  parseLegalFile,
} from "./legal";

const file = (kind: string, language: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../legal/${kind}.${language}.md`, import.meta.url)),
    "utf8",
  );

describe("parseLegalFile", () => {
  it("reads the version header and the text", () => {
    expect(
      parseLegalFile(
        "---\nversion: 1.2\neffective: 2026-12-01\napproved: 2026-11-20\n---\n# Terms\n",
      ),
    ).toEqual({
      version: "1.2",
      effective: "2026-12-01",
      approved: "2026-11-20",
      body: "# Terms",
    });
  });

  it("treats an empty approved line as not approved", () => {
    expect(
      parseLegalFile("---\nversion: 0.1\neffective: 2026-11-02\napproved:\n---\nx").approved,
    ).toBeNull();
  });

  it("refuses a bad version or date", () => {
    expect(() => parseLegalFile("---\nversion: v1\neffective: 2026-11-02\n---\nx")).toThrow(
      /major.minor/,
    );
    expect(() => parseLegalFile("---\nversion: 1.0\neffective: 2 Nov\n---\nx")).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => parseLegalFile("# no header")).toThrow(/header/);
  });
});

describe("compareVersions", () => {
  it("orders by number, not by text", () => {
    expect(["0.9", "1.10", "1.2", "0.10"].sort(compareVersions)).toEqual([
      "1.10",
      "1.2",
      "0.10",
      "0.9",
    ]);
  });
});

describe("drafts", () => {
  it("are anything below 1.0 or not yet approved", () => {
    expect(isDraftVersion("0.1", null)).toBe(true);
    expect(isDraftVersion("1.0", null)).toBe(true);
    expect(isDraftVersion("1.0", "2026-11-20")).toBe(false);
  });
});

describe("fillLegalText", () => {
  it("names the entity and the platform from settings", () => {
    expect(
      fillLegalText("{entity_name} runs {platform_name}.", {
        entity_name: "Test Entity Ltd",
        platform_name: "Test Platform",
      }),
    ).toBe("Test Entity Ltd runs Test Platform.");
  });
});

describe("legalBlocks", () => {
  it("splits headings, bullets and paragraphs, joining wrapped lines", () => {
    expect(
      legalBlocks("# Title\n\nOne line\nwrapped.\n\n- First\n- Second\n\n## Next\nText."),
    ).toEqual([
      { kind: "heading", text: "Title" },
      { kind: "paragraph", text: "One line wrapped." },
      { kind: "bullet", text: "First" },
      { kind: "bullet", text: "Second" },
      { kind: "heading", text: "Next" },
      { kind: "paragraph", text: "Text." },
    ]);
  });
});

describe("the five texts in legal/", () => {
  for (const kind of legalKinds) {
    it(`${kind}: English and Kiswahili match in version and shape`, () => {
      const en = parseLegalFile(file(kind, "en"));
      const sw = parseLegalFile(file(kind, "sw"));
      expect({ ...sw, body: "" }).toEqual({ ...en, body: "" });
      const shape = (body: string) => legalBlocks(body).map((b) => b.kind);
      expect(shape(sw.body)).toEqual(shape(en.body));
    });

    it(`${kind}: uses only the entity and platform placeholders, and no em-dash`, () => {
      for (const language of ["en", "sw"]) {
        const body = parseLegalFile(file(kind, language)).body;
        expect(body).not.toContain("—");
        for (const [, key] of body.matchAll(/\{(\w+)\}/g)) {
          expect(["entity_name", "platform_name"]).toContain(key);
        }
      }
    });
  }
});
