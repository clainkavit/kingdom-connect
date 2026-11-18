---
name: member-web-speed
description: Measured page speed of the member web app (18 Nov 2026), what was done about it, and how to measure again
metadata:
  type: project
---

# Member web speed (measured 18 Nov 2026)

- **How to measure.** `npx expo export -p web` in `apps/member`, serve `dist` with gzip on port 8090 (any static server with an SPA fallback), then `PERF_OUT=<file>.json pnpm exec playwright test e2e/member.perf-audit.spec.ts --project=member`. It throttles to 1.6 Mbps, 150 ms and a 4x slower CPU, and signs in as `test_level3`. The spec counts bytes only until each page is usable, so a full byte breakdown needs a plain unthrottled load.
- **First visit** downloads about 800 KB (was about 1,070 KB): 554 KB of app code, then fonts and images. The code is mostly the framework (Expo Router, react-native-web, react-dom) plus every screen in one shared chunk, and both languages' strings. Splitting screens per route is the next step if first-visit time matters more.
- **Branded boot screen** sits inside `#root` in `apps/member/public/index.html`, so something shows at about 0.5 s instead of a white page until the app mounts (about 5.5 s on that phone).
- **Fonts** are cut-down copies in `apps/member/assets/fonts` (Latin, Latin Extended-A, general punctuation; made with `python -m fontTools.subset ... --no-hinting --desubroutinize`), not `@expo-google-fonts`. A new character outside those ranges falls back to the system font; re-run the subset from the Google Fonts originals if Kiswahili or names ever need more.
- **The Opportunities list** scores only its page of 20 for Scan's reasons: 0.12 s at 2,000 posts, against 0.4 s when it scored every post.

Related: [[staff-reset-setup]].
