import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RESERVED_DOMAINS = new Set(["example.test", "test.invalid", "deleted.invalid"]);
const root = new URL("../../../", import.meta.url);

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const path = `${dir}${name}`;
    if (statSync(new URL(path, root)).isDirectory()) return filesUnder(`${path}/`, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const testFiles = [
  ...filesUnder("e2e/", /\.ts$/),
  ...filesUnder("supabase/tests/", /\.sql$/),
  ...filesUnder("supabase/functions/", /\.test\.ts$/),
  ...filesUnder("apps/", /\.test\.tsx?$/),
  ...filesUnder("packages/", /\.test\.tsx?$/),
  "supabase/seed.sql",
];

describe("test data (PRD section 17)", () => {
  it("uses only reserved test email domains, never a real address", () => {
    const real = testFiles.flatMap((file) =>
      [...readFileSync(new URL(file, root), "utf8").matchAll(/@((?:[\w-]+\.)+[a-z]{2,})\b/gi)]
        .filter((m) => !RESERVED_DOMAINS.has(m[1]!.toLowerCase()))
        .map((m) => `${file}: ${m[0]}`),
    );
    expect(real).toEqual([]);
  });
});
