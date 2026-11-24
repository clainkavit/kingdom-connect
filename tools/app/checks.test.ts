import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Lines with `toHaveCount(0)` whose previous statement is not a `toBeVisible()` that proves the page drew. */
export function unanchoredAbsences(source: string): number[] {
  const lines = source.split(/\r?\n/);
  const found: number[] = [];
  lines.forEach((line, i) => {
    if (!line.includes("toHaveCount(0)")) return;
    const previous = lines
      .slice(0, i)
      .reverse()
      .find((l) => l.trim() !== "");
    if (!previous?.includes("toBeVisible()")) found.push(i + 1);
  });
  return found;
}

const checksDir = join(__dirname, "checks");

describe("check scripts", () => {
  it.each(readdirSync(checksDir).filter((f) => f.endsWith(".ts")))(
    "%s proves the page drew before asserting something is gone",
    (file) => {
      expect(unanchoredAbsences(readFileSync(join(checksDir, file), "utf8"))).toEqual([]);
    },
  );
});

describe("unanchoredAbsences", () => {
  it("flags an absence right after opening a page", () => {
    const source = [
      "await poster.goto(workerProfile);",
      'await expect(poster.getByRole("heading", { name: "Work references" })).toHaveCount(0);',
    ].join("\n");
    expect(unanchoredAbsences(source)).toEqual([2]);
  });

  it("accepts an absence after something visible", () => {
    const source = [
      "await poster.goto(workerProfile);",
      'await expect(poster.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();',
      "",
      'await expect(poster.getByRole("heading", { name: "Work references" })).toHaveCount(0);',
    ].join("\n");
    expect(unanchoredAbsences(source)).toEqual([]);
  });
});
