/**
 * Design tokens: the maroon and cream look of the 8 November designs (PRD section 5).
 * The names are roles, kept from the first canvas so components did not change:
 * `navy` is the menu and header colour, `blue` the main action colour, and
 * `blueSoft` the selected and highlighted background.
 */

export const colors = {
  light: {
    navy: "#4a0e1a",
    navy2: "#5e1626",
    navyInk: "#f3e6d0",
    navyMute: "#d9b8a3",
    gold: "#d9a73e",
    blue: "#4a0e1a",
    blueInk: "#ffffff",
    blueSoft: "#f3e6d0",
    bg: "#f7f1ea",
    surface: "#ffffff",
    surface2: "#fbf7f2",
    line: "#e4d9cc",
    field: "#9a877d",
    ink: "#2a1a1e",
    ink2: "#5a4a4e",
    ink3: "#7a6a6e",
    good: "#1a8a55",
    goodSoft: "#e3f5ec",
    goodText: "#0f5a36",
    warn: "#b26a00",
    warnSoft: "#fdf1dc",
    warnText: "#5e3a00",
    bad: "#c23b3b",
    badSoft: "#fbe7e7",
    badText: "#7d1f1f",
    infoText: "#4a0e1a",
    violet: "#6a42c2",
    violetSoft: "#efe9fb",
    teal: "#0e7d86",
    tealSoft: "#e0f3f4",
    rose: "#b23a73",
    roseSoft: "#fae6f0",
  },
  dark: {
    navy: "#2a0810",
    navy2: "#3a0f1a",
    navyInk: "#f3e6d0",
    navyMute: "#c7a894",
    gold: "#d9a73e",
    blue: "#e59aaa",
    blueInk: "#2a0810",
    blueSoft: "#3a1e26",
    bg: "#160d0f",
    surface: "#211417",
    surface2: "#2a1a1e",
    line: "#3d2a2f",
    field: "#86707a",
    ink: "#f5ede6",
    ink2: "#cdbdb8",
    ink3: "#a08e8a",
    good: "#4cc78a",
    goodSoft: "#123326",
    goodText: "#8fdcb5",
    warn: "#f0a93a",
    warnSoft: "#352612",
    warnText: "#f5c77e",
    bad: "#ef7373",
    badSoft: "#3a1a1d",
    badText: "#f4a7a7",
    infoText: "#f0b8c4",
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
  light: "0 1px 2px rgba(74,14,26,.06), 0 4px 14px rgba(74,14,26,.05)",
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

/**
 * Motion tokens, in milliseconds, shared by both apps so every animation feels the same.
 * Everyday movements stay under 300 ms; only the once-per-device intro is longer.
 */
export const motion = {
  /** Something coming in: a panel, a list row, a message. */
  enter: 200,
  /** Something going away. */
  exit: 140,
  /** A button being pressed. */
  press: 100,
  /** The gap between items that come in one after another. */
  stagger: 60,
  /**
   * The intro on the first open (Phase 3): the logo settles, the tagline comes in word by word,
   * then the maroon panel lifts away to show the landing page. Total under 2.5 s.
   */
  intro: { settle: 450, word: 260, hold: 450, lift: 520, total: 2300 },
} as const;
