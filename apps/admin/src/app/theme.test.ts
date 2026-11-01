import { readFileSync } from "node:fs";
import { themeCss } from "@kingdom-connect/shared";
import { expect, it } from "vitest";

it("theme.css matches the shared design tokens (run pnpm theme to update)", () => {
  const file = readFileSync("apps/admin/src/app/theme.css", "utf8");
  expect(file.replace(/\r\n/g, "\n")).toBe(themeCss());
});
