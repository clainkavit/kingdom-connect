import { describe, expect, it } from "vitest";
import { colors, cssVar, themeCss, type ColorToken } from "./design";

describe("colors", () => {
  it("defines the same tokens for light and dark", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it("matches the dashboard prototype", () => {
    expect(colors.light.navy).toBe("#0e1d3a");
    expect(colors.light.blue).toBe("#1f5fd6");
    expect(colors.light.bg).toBe("#eef2f8");
    expect(colors.dark.bg).toBe("#0b1222");
    expect(colors.dark.blue).toBe("#4d86f0");
  });
});

describe("cssVar", () => {
  it("turns a token name into its custom property", () => {
    expect(cssVar("navy2")).toBe("--kc-navy-2");
    expect(cssVar("blueSoft")).toBe("--kc-blue-soft");
  });
});

describe("themeCss", () => {
  const css = themeCss();

  it("declares every light token on :root", () => {
    const light = css.slice(0, css.indexOf("@media"));
    for (const [name, value] of Object.entries(colors.light)) {
      expect(light).toContain(`${cssVar(name as ColorToken)}: ${value};`);
    }
  });

  it("switches to the dark tokens when the device prefers dark", () => {
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    for (const [name, value] of Object.entries(colors.dark)) {
      expect(dark).toContain(`${cssVar(name as ColorToken)}: ${value};`);
    }
  });
});
