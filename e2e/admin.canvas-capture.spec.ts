import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@playwright/test";
import { signInToAdmin } from "./helpers";

/**
 * Canvas match for the admin console: screenshots each combined-canvas board next to the live screen.
 * Runs only with CANVAS_DIR (the exported canvas project folder) and CAPTURE_OUT set.
 */
const canvasDir = process.env.CANVAS_DIR;
const out = process.env.CAPTURE_OUT;
const only = process.env.CAPTURE_ONLY?.split(",");

type Pair = {
  board: string;
  route: string;
  w: number;
  h: number;
  signedOut?: boolean;
  tab?: string;
};

const pairs: Pair[] = [
  { board: "Admin-Login", route: "/login", w: 1440, h: 900, signedOut: true },
  { board: "Admin-Phone-Login", route: "/login", w: 430, h: 900, signedOut: true },
  { board: "Admin-Dashboard", route: "/", w: 1440, h: 1400 },
  { board: "Admin-Phone-Dashboard", route: "/", w: 430, h: 900 },
  { board: "Admin-Verify", route: "/verification", w: 1440, h: 1100 },
  { board: "Admin-Ideas", route: "/ideas", w: 1440, h: 1300 },
  {
    board: "Admin-VerifyDetail",
    route: "/verification/5eed0000-0000-4000-8000-00000000f101",
    w: 1440,
    h: 1600,
  },
  { board: "Admin-Shortlist", route: "/picks", w: 1440, h: 1200 },
  { board: "Admin-Staff", route: "/settings", w: 1440, h: 1300, tab: "Staff accounts" },
  { board: "Admin-Phone-Verify", route: "/verification", w: 430, h: 900 },
  {
    board: "Admin-Phone-VerifyDetail",
    route: "/verification/5eed0000-0000-4000-8000-00000000f101",
    w: 430,
    h: 900,
  },
  { board: "Admin-Phone-Ideas", route: "/ideas", w: 430, h: 900 },
  { board: "Admin-Phone-Shortlist", route: "/picks", w: 430, h: 900 },
  { board: "Admin-Phone-Staff", route: "/settings", w: 430, h: 900, tab: "Staff accounts" },
];

test.skip(!canvasDir || !out, "set CANVAS_DIR and CAPTURE_OUT to capture");

for (const pair of pairs.filter((p) => !only || only.includes(p.board))) {
  test(`capture ${pair.board}`, async ({ page, browser, baseURL }) => {
    mkdirSync(out!, { recursive: true });
    await page.setViewportSize({ width: pair.w, height: Math.min(pair.h, 1200) });
    await page.goto(pathToFileURL(join(canvasDir!, `${pair.board}.dc.html`)).href);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out!, `${pair.board}.canvas.png`), fullPage: true });

    const state = join(out!, "session-admin.json");
    if (!pair.signedOut && !existsSync(state)) {
      await signInToAdmin(page, "test.superadmin@example.test");
      await page.context().storageState({ path: state });
    }
    const context = await browser.newContext(
      pair.signedOut ? { baseURL } : { storageState: state, baseURL },
    );
    const live = await context.newPage();
    await live.setViewportSize({ width: pair.w, height: Math.min(pair.h, 1200) });
    await live.goto(pair.route);
    await live.waitForTimeout(2500);
    if (pair.tab) {
      await live.getByRole("tab", { name: pair.tab }).click();
      await live.waitForTimeout(800);
    }
    await live.screenshot({ path: join(out!, `${pair.board}.live.png`), fullPage: true });
    await context.close();
  });
}
