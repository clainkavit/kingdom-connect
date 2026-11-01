const tokens = [
  "navy",
  "navy-2",
  "navy-ink",
  "navy-mute",
  "blue",
  "blue-ink",
  "blue-soft",
  "bg",
  "surface",
  "surface-2",
  "line",
  "ink",
  "ink-2",
  "ink-3",
  "good",
  "good-soft",
  "warn",
  "warn-soft",
  "bad",
  "bad-soft",
  "violet",
  "violet-soft",
  "teal",
  "teal-soft",
  "rose",
  "rose-soft",
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: Object.fromEntries(tokens.map((name) => [name, `var(--kc-${name})`])),
      fontFamily: {
        figtree: ["Figtree_400Regular"],
        "figtree-medium": ["Figtree_500Medium"],
        "figtree-semibold": ["Figtree_600SemiBold"],
        "figtree-bold": ["Figtree_700Bold"],
        "figtree-extrabold": ["Figtree_800ExtraBold"],
      },
      borderRadius: { card: "12px" },
    },
  },
  plugins: [],
};
