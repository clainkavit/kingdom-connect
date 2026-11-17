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

type Pair = {
  board: string;
  route: string;
  w: number;
  h: number;
  signedOut?: boolean;
  press?: string;
};

const pairs: Pair[] = [
  { board: "Web-Login", route: "/login", w: 1440, h: 900, signedOut: true },
  { board: "Web-Social", route: "/sign-up", w: 1440, h: 900, signedOut: true },
  { board: "Web-Forgot", route: "/forgot-password", w: 1440, h: 900, signedOut: true },
  { board: "Phone-Login", route: "/login", w: 430, h: 900, signedOut: true },
  { board: "Phone-Signup", route: "/sign-up", w: 430, h: 900, signedOut: true },
  { board: "Web-Recover", route: "/recover", w: 1440, h: 900, signedOut: true },
  { board: "Business-Dashboard", route: "/", w: 1440, h: 2100 },
  { board: "Member-Dashboard", route: "/", w: 1440, h: 2300 },
  { board: "Member-People", route: "/people", w: 1440, h: 1700 },
  { board: "Member-Phone-People", route: "/people", w: 430, h: 900 },
  {
    board: "Member-Profile",
    route: "/profile/5eed0000-0000-4000-8000-000000000002",
    w: 1440,
    h: 1500,
  },
  {
    board: "Member-Phone-Profile",
    route: "/profile/5eed0000-0000-4000-8000-000000000002",
    w: 430,
    h: 900,
  },
  { board: "Opp-List", route: "/opportunities", w: 1440, h: 1700 },
  { board: "Ideas-Pool", route: "/ideas", w: 1440, h: 1500 },
  { board: "Ideas-Phone-Pool", route: "/ideas", w: 430, h: 900 },
  { board: "Web-Growth", route: "/growth", w: 1440, h: 960 },
  { board: "Web-Messages", route: "/messages", w: 1440, h: 960 },
  { board: "Opp-Responses", route: "/opportunities/responses", w: 1440, h: 1000 },
  { board: "Opp-Saved", route: "/opportunities/saved", w: 1440, h: 1000 },
  {
    board: "Opp-Detail",
    route: "/opportunities/cd5a587a-5b96-4599-9fe7-1c139d33ae6a",
    w: 1440,
    h: 1300,
  },
  {
    board: "Opp-Apply",
    route: "/opportunities/cd5a587a-5b96-4599-9fe7-1c139d33ae6a",
    w: 1440,
    h: 1100,
  },
  {
    board: "Ideas-Summary",
    route: "/ideas/5004d0fd-8e7b-4367-a306-7b763e78d77b",
    w: 1440,
    h: 1200,
  },
  { board: "Biz-Verify", route: "/business", w: 1440, h: 1800 },
  { board: "Web-Verify-Start", route: "/profile/verify", w: 1440, h: 1000 },
  {
    board: "Web-Verify-About",
    route: "/profile/verify",
    w: 1440,
    h: 1000,
    press: "Continue: About you",
  },
  { board: "Phone-Verify-Start", route: "/profile/verify", w: 430, h: 900 },
  { board: "Opp-Post", route: "/opportunities/new", w: 1440, h: 1400 },
  { board: "Ideas-Share", route: "/ideas/new", w: 1440, h: 1400 },
  { board: "Ideas-Manage", route: "/ideas/9860f9cd-c663-4040-b80c-db7722be2600", w: 1440, h: 1200 },
  { board: "Opp-Alerts", route: "/settings/alerts", w: 1440, h: 900 },
  { board: "Home-Unverified", route: "/", w: 1440, h: 1200 },
  {
    board: "Opp-ConfirmWork",
    route: "/work/942207ec-deea-4852-95d2-16572f2c345f",
    w: 1440,
    h: 900,
  },
  { board: "Rate-Work", route: "/work/df7d7842-f25c-4671-b7ac-42339791fe1a", w: 1440, h: 1200 },
  { board: "Phone-Growth", route: "/growth", w: 430, h: 900 },
  { board: "Phone-Messages", route: "/messages", w: 430, h: 900 },
  {
    board: "Opp-Phone-Detail",
    route: "/opportunities/42042068-2779-4806-9181-d0c456fba9c3",
    w: 430,
    h: 900,
  },
  {
    board: "Ideas-Phone-Summary",
    route: "/ideas/5004d0fd-8e7b-4367-a306-7b763e78d77b",
    w: 430,
    h: 900,
  },
  {
    board: "Profile-References",
    route: "/profile/5eed0000-0000-4000-8000-000000000002",
    w: 1440,
    h: 1600,
  },
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

    if (pair.signedOut) {
      const fresh = await browser.newContext({ baseURL });
      const out1 = await fresh.newPage();
      await out1.setViewportSize({ width: pair.w, height: Math.min(pair.h, 1200) });
      await out1.goto(pair.route);
      await out1.waitForTimeout(2000);
      await out1.screenshot({ path: join(out!, `${pair.board}.live.png`), fullPage: true });
      await fresh.close();
      return;
    }
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
    if (pair.press) {
      await live.getByRole("button", { name: pair.press }).click();
      await live.waitForTimeout(500);
    }
    await live.screenshot({ path: join(out!, `${pair.board}.live.png`), fullPage: true });
    await context.close();
  });
}
