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
  {
    board: "Web-Verify-What",
    route: "/profile/verify",
    w: 1440,
    h: 1200,
    press: "What you do",
  },
  {
    board: "Web-Verify-Work",
    route: "/profile/verify",
    w: 1440,
    h: 1200,
    press: "Your work",
  },
  {
    board: "Web-Verify-ID",
    route: "/profile/verify",
    w: 1440,
    h: 1200,
    press: "ID and photos",
  },
  {
    board: "Web-Verify-Check",
    route: "/profile/verify",
    w: 1440,
    h: 1200,
    press: "Check and send",
  },
  { board: "Web-Verify-Status", route: "/profile/verify", w: 1440, h: 1000 },

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
  {
    board: "Opp-Picking",
    route: "/opportunities/0663cf0d-8e3b-43d9-a9dc-fe085500047f/pick",
    w: 1440,
    h: 1100,
  },
  {
    board: "Opp-Shortlist",
    route: "/opportunities/a3948acf-a6fb-436e-9e72-446c6e01b010/pick",
    w: 1440,
    h: 1300,
  },
  { board: "Opp-Post-Mode", route: "/opportunities/new", w: 1440, h: 1200 },
  { board: "Opp-Picked-Invite", route: "/picked", w: 1440, h: 1100 },
  {
    board: "Opp-MarkHired",
    route: "/opportunities/a3948acf-a6fb-436e-9e72-446c6e01b010/responses",
    w: 1440,
    h: 1100,
  },
  {
    board: "Ideas-Details",
    route: "/ideas/368eca10-991c-4df2-80a0-dcc59d3d8b8a/details",
    w: 1440,
    h: 1300,
  },
  { board: "Investor-Pool", route: "/ideas", w: 1440, h: 1300 },
  {
    board: "Investor-Interest",
    route: "/ideas/5004d0fd-8e7b-4367-a306-7b763e78d77b",
    w: 1440,
    h: 1200,
  },
  { board: "Member-Phone-Dashboard", route: "/", w: 430, h: 900 },
  { board: "Opp-Phone-List", route: "/opportunities", w: 430, h: 900 },
  {
    board: "Opp-Phone-Apply",
    route: "/opportunities/cd5a587a-5b96-4599-9fe7-1c139d33ae6a",
    w: 430,
    h: 900,
    press: "Apply",
  },
  { board: "Opp-Phone-Saved", route: "/opportunities/saved", w: 430, h: 900 },
  { board: "Opp-Phone-Alerts", route: "/settings/alerts", w: 430, h: 900 },
  { board: "Opp-Phone-Post", route: "/opportunities/new", w: 430, h: 900 },
  { board: "Opp-Phone-Post-Mode", route: "/opportunities/new", w: 430, h: 900 },
  {
    board: "Opp-Phone-ConfirmWork",
    route: "/work/942207ec-deea-4852-95d2-16572f2c345f",
    w: 430,
    h: 900,
  },
  { board: "Phone-Rate-Work", route: "/work/df7d7842-f25c-4671-b7ac-42339791fe1a", w: 430, h: 900 },
  {
    board: "Phone-Profile-References",
    route: "/profile/5eed0000-0000-4000-8000-000000000002",
    w: 430,
    h: 900,
  },
  { board: "Opp-Phone-Picked-Invite", route: "/picked", w: 430, h: 900 },
  {
    board: "Opp-Phone-Picking",
    route: "/opportunities/0663cf0d-8e3b-43d9-a9dc-fe085500047f/pick",
    w: 430,
    h: 900,
  },
  {
    board: "Opp-Phone-Shortlist",
    route: "/opportunities/a3948acf-a6fb-436e-9e72-446c6e01b010/pick",
    w: 430,
    h: 900,
  },
  {
    board: "Opp-Phone-MarkHired",
    route: "/opportunities/a3948acf-a6fb-436e-9e72-446c6e01b010/responses",
    w: 430,
    h: 900,
  },
  {
    board: "Phone-Verify-About",
    route: "/profile/verify",
    w: 430,
    h: 900,
    press: "Continue: About you",
  },
  { board: "Phone-Verify-What", route: "/profile/verify", w: 430, h: 900, press: "What you do" },
  { board: "Phone-Verify-Work", route: "/profile/verify", w: 430, h: 900, press: "Your work" },
  { board: "Phone-Verify-ID", route: "/profile/verify", w: 430, h: 900, press: "ID and photos" },
  {
    board: "Phone-Verify-Check",
    route: "/profile/verify",
    w: 430,
    h: 900,
    press: "Check and send",
  },
  { board: "Phone-Verify-Status", route: "/profile/verify", w: 430, h: 900 },
  { board: "Phone-Home-Unverified", route: "/", w: 430, h: 900 },
  {
    board: "Phone-Conversation",
    route: "/messages/c313cb40-3489-408b-b02d-a340b4550c18",
    w: 430,
    h: 900,
  },
  {
    board: "Ideas-Phone-Details",
    route: "/ideas/368eca10-991c-4df2-80a0-dcc59d3d8b8a/details",
    w: 430,
    h: 900,
  },
  {
    board: "Ideas-Phone-Manage",
    route: "/ideas/9860f9cd-c663-4040-b80c-db7722be2600",
    w: 430,
    h: 900,
  },
  { board: "Ideas-Phone-Share", route: "/ideas/new", w: 430, h: 900 },
  { board: "Investor-Phone-Pool", route: "/ideas", w: 430, h: 900 },
  {
    board: "Investor-Phone-Interest",
    route: "/ideas/5004d0fd-8e7b-4367-a306-7b763e78d77b",
    w: 430,
    h: 900,
  },
  { board: "Business-Phone-Dashboard", route: "/", w: 430, h: 900 },
  { board: "Biz-Phone-Verify", route: "/business", w: 430, h: 900 },
  { board: "Phone-Forgot", route: "/forgot-password", w: 430, h: 900, signedOut: true },
  { board: "Phone-Recover", route: "/recover", w: 430, h: 900, signedOut: true },
  {
    board: "Web-Locked-Action",
    route: "/opportunities/cd5a587a-5b96-4599-9fe7-1c139d33ae6a",
    w: 1440,
    h: 1000,
    press: "Apply",
  },
  {
    board: "Phone-Locked-Action",
    route: "/opportunities/cd5a587a-5b96-4599-9fe7-1c139d33ae6a",
    w: 430,
    h: 900,
    press: "Apply",
  },
  { board: "Web-Landing", route: "/welcome", w: 1440, h: 900, signedOut: true },
  { board: "Phone-Landing", route: "/welcome", w: 430, h: 900, signedOut: true },
  { board: "Web-Terms", route: "/terms", w: 1440, h: 900, signedOut: true },
  { board: "Phone-Terms", route: "/terms", w: 430, h: 900, signedOut: true },
  { board: "Web-Privacy", route: "/privacy", w: 1440, h: 900, signedOut: true },
  { board: "Phone-Privacy", route: "/privacy", w: 430, h: 900, signedOut: true },
  { board: "Phone-Social", route: "/sign-up", w: 430, h: 900, signedOut: true },
  { board: "Web-PhoneSignin", route: "/phone-sign-in", w: 1440, h: 900, signedOut: true },
  { board: "Phone-PhoneSignin", route: "/phone-sign-in", w: 430, h: 900, signedOut: true },
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
      if (pair.press) {
        await out1.getByRole("button", { name: pair.press }).click();
        await out1.waitForTimeout(500);
      }
      await out1.screenshot({ path: join(out!, `${pair.board}.live.png`), fullPage: true });
      await fresh.close();
      return;
    }
    const state = join(out!, `session-${account}.json`);
    if (!existsSync(state)) {
      await signInAs(page, account, `${account.replaceAll("_", ".")}@example.test`);
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
