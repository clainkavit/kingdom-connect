import { readFileSync } from "node:fs";
import { colors, themeCss } from "@kingdom-connect/shared";
import { expect, it } from "vitest";
import tailwindConfig from "./tailwind.config.js";

it("global.css carries the shared design tokens (run pnpm theme to update)", () => {
  const file = readFileSync("apps/member/global.css", "utf8").replace(/\r\n/g, "\n");
  expect(file.endsWith(themeCss())).toBe(true);
});

it("tailwind.config.js offers a class for every colour token", () => {
  const kebab = (name: string) => name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
  const { theme } = tailwindConfig as { theme: { extend: { colors: Record<string, string> } } };
  expect(Object.keys(theme.extend.colors).sort()).toEqual(
    Object.keys(colors.light).map(kebab).sort(),
  );
});
