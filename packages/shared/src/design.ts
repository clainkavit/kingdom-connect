/** Design tokens from the Kingdom Connect Screens canvas (PRD section 5, Visual direction). */

export const colors = {
  light: {
    navy: "#0e1d3a",
    navy2: "#162a50",
    navyInk: "#c9d6ee",
    navyMute: "#8496b8",
    blue: "#1f5fd6",
    blueInk: "#ffffff",
    blueSoft: "#e8effc",
    bg: "#eef2f8",
    surface: "#ffffff",
    surface2: "#f6f8fc",
    line: "#dfe5ef",
    field: "#b9c3d6",
    ink: "#152039",
    ink2: "#4a5672",
    ink3: "#7a849b",
    good: "#1a8a55",
    goodSoft: "#e3f5ec",
    goodText: "#0f5a36",
    warn: "#b26a00",
    warnSoft: "#fdf1dc",
    warnText: "#5e3a00",
    bad: "#c23b3b",
    badSoft: "#fbe7e7",
    badText: "#7d1f1f",
    infoText: "#13367a",
    violet: "#6a42c2",
    violetSoft: "#efe9fb",
    teal: "#0e7d86",
    tealSoft: "#e0f3f4",
    rose: "#b23a73",
    roseSoft: "#fae6f0",
  },
  dark: {
    navy: "#081227",
    navy2: "#13213f",
    navyInk: "#c9d6ee",
    navyMute: "#7b8db0",
    blue: "#4d86f0",
    blueInk: "#ffffff",
    blueSoft: "#1a2b4f",
    bg: "#0b1222",
    surface: "#121c31",
    surface2: "#18243d",
    line: "#24324f",
    field: "#3a4a6b",
    ink: "#e6ecf7",
    ink2: "#aab6cd",
    ink3: "#7d8aa4",
    good: "#4cc78a",
    goodSoft: "#123326",
    goodText: "#8fdcb5",
    warn: "#f0a93a",
    warnSoft: "#352612",
    warnText: "#f5c77e",
    bad: "#ef7373",
    badSoft: "#3a1a1d",
    badText: "#f4a7a7",
    infoText: "#a9c4f5",
    violet: "#a98af0",
    violetSoft: "#261d42",
    teal: "#4cc3cc",
    tealSoft: "#0f2f33",
    rose: "#ee8ab9",
    roseSoft: "#3a1a2b",
  },
} as const;

export type ColorToken = keyof typeof colors.light;

export const radius = 12;
export const shadow = {
  light: "0 1px 2px rgba(14,29,58,.06), 0 4px 14px rgba(14,29,58,.05)",
  dark: "0 1px 2px rgba(0,0,0,.3)",
} as const;

/** The CSS custom property that holds a colour token, for example `--kc-navy-2`. */
export const cssVar = (token: ColorToken): string =>
  `--kc-${token.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)}`;

function declarations(theme: keyof typeof colors): string {
  const lines = (Object.entries(colors[theme]) as [ColorToken, string][]).map(
    ([name, value]) => `  ${cssVar(name)}: ${value};`,
  );
  lines.push(`  --kc-shadow: ${shadow[theme]};`);
  return lines.join("\n");
}

/** The CSS custom properties both apps load: light on :root, dark only on an element marked data-theme="dark". */
export function themeCss(): string {
  return [
    ":root {",
    "  color-scheme: light;",
    `  --kc-radius: ${radius}px;`,
    declarations("light"),
    "}",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    declarations("dark"),
    "}",
    "",
  ].join("\n");
}
