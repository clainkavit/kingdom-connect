import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  createStaff,
  makePoster,
  publishOpportunity,
  signInToAdmin,
} from "./helpers";

test("an Administrator features an open post and removes it again (O05, A12)", async ({ page }) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_feat_poster_${stamp}`);
  await addProfile(poster.id, "Featured Poster");
  await makePoster(poster.id, `Featured Traders ${stamp}`);
  const title = `Featured job ${stamp}`;
  await publishOpportunity(poster.id, title);

  await signInToAdmin(page, await createStaff(`Feature Admin ${stamp}`));
  await page.goto(`${ADMIN_URL}/news`);
  await expect(page.getByRole("heading", { name: "Featured opportunities" })).toBeVisible();
  await page.getByLabel("Find an open post by title").fill(String(stamp));
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByRole("button", { name: `Feature ${title}` }).click();
  await expect(page.getByText("Featured.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Stop featuring ${title}` })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/o05-featured.png`,
      fullPage: true,
    });

  await page.getByRole("button", { name: `Stop featuring ${title}` }).click();
  await expect(page.getByText("No longer featured.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Stop featuring ${title}` })).toHaveCount(0);
});
