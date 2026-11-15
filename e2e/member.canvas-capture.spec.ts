import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Canvas match: screenshots each combined-canvas board next to the live screen at the same size.
 * Runs only with CANVAS_DIR (the exported canvas project folder) and CAPTURE_OUT set.
 */
const canvasDir = process.env.CANVAS_DIR;
const out = process.env.CAPTURE_OUT;
const only = process.env.CAPTURE_ONLY?.split(",");

type Pair = { board: string; route: string; w: number; h: number; as?: "level3" | "level1" };

const pairs: Pair[] = [
  { board: "Business-Dashboard", route: "/", w: 1440, h: 2100 },
  { board: "Member-Dashboard", route: "/", w: 1440, h: 2300 },
  { board: "Member-People", route: "/people", w: 1440, h: 1700 },
  { board: "Member-Phone-People", route: "/people", w: 430, h: 900 },
  { board: "Opp-List", route: "/opportunities", w: 1440, h: 1700 },
  { board: "Ideas-Pool", route: "/ideas", w: 1440, h: 1500 },
  { board: "Web-Growth", route: "/growth", w: 1440, h: 960 },
  { board: "Web-Messages", route: "/messages", w: 1440, h: 960 },
  { board: "Opp-Responses", route: "/opportunities/responses", w: 1440, h: 1000 },
  { board: "Opp-Saved", route: "/opportunities/saved", w: 1440, h: 1000 },
  { board: "Biz-Verify", route: "/business", w: 1440, h: 1800 },
  { board: "Member-Phone-Dashboard", route: "/", w: 430, h: 900 },
  { board: "Opp-Phone-List", route: "/opportunities", w: 430, h: 900 },
];

test.skip(!canvasDir || !out, "set CANVAS_DIR and CAPTURE_OUT to capture");

const account = process.env.CAPTURE_AS ?? "test_level3";

for (const pair of pairs.filter((p) => !only || only.includes(p.board))) {
  test(`capture ${pair.board}`, async ({ page, browser, baseURL }) => {
    mkdirSync(out!, { recursive: true });
    await page.setViewportSize({ width: pair.w, height: Math.min(pair.h, 1200) });
    await page.goto(pathToFileURL(join(canvasDir!, `${pair.board}.dc.html`)).href);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out!, `${pair.board}.canvas.png`), fullPage: true });

    const state = join(out!, `session-${account}.json`);
    if (!existsSync(state)) {
      await signInAs(page, account, `${account.replace("_", ".")}@example.test`);
      await page.context().storageState({ path: state });
    }
    const context = await browser.newContext({ storageState: state, baseURL });
    const live = await context.newPage();
    await live.setViewportSize({ width: pair.w, height: Math.min(pair.h, 1200) });
    await live.goto(pair.route);
    await expect(live.locator("body")).toBeVisible();
    await live.waitForTimeout(2000);
    await live.screenshot({ path: join(out!, `${pair.board}.live.png`), fullPage: true });
    await context.close();
  });
}
