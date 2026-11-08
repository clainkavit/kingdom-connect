import { describe, expect, it } from "vitest";
import { colors, cssVar, themeCss, type ColorToken } from "./design";

describe("colors", () => {
  it("defines the same tokens for light and dark", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it("uses the maroon and cream look of the 8 November designs", () => {
    expect(colors.light.navy).toBe("#4a0e1a");
    expect(colors.light.blue).toBe("#4a0e1a");
    expect(colors.light.blueSoft).toBe("#f3e6d0");
    expect(colors.light.bg).toBe("#f7f1ea");
    expect(colors.dark.bg).toBe("#160d0f");
    expect(colors.dark.blue).toBe("#e59aaa");
  });

  it("keeps text readable: 4.5:1 for text, 3:1 for input borders", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const theme of [colors.light, colors.dark]) {
      const text: [ColorToken, ColorToken][] = [
        ["navyInk", "navy"],
        ["navyMute", "navy"],
        ["blueInk", "blue"],
        ["blue", "surface"],
        ["blue", "blueSoft"],
        ["ink", "bg"],
        ["ink2", "surface"],
        ["ink3", "bg"],
        ["infoText", "surface"],
      ];
      for (const [fg, bg] of text) expect(ratio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(theme.field, theme.surface)).toBeGreaterThanOrEqual(3);
    }
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

  it("uses the dark tokens only when an element is marked data-theme=dark", () => {
    expect(css).not.toContain("prefers-color-scheme");
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    for (const [name, value] of Object.entries(colors.dark)) {
      expect(dark).toContain(`${cssVar(name as ColorToken)}: ${value};`);
    }
  });
});
