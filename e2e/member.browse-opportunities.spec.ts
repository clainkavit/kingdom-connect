import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  hideOpportunity,
  makePoster,
  publishOpportunity,
  signInAs,
} from "./helpers";

test("a Member finds a job by its filters, reads it, and a hidden post disappears at once (O02, S16, S17)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_browse_poster_${stamp}`);
  await addProfile(poster.id, "Browse Poster");
  await makePoster(poster.id, `Browse Traders ${stamp}`);
  const title = `Accountant wanted ${stamp}`;
  const id = await publishOpportunity(poster.id, title);

  const reader = await createMember(`e2e_browse_reader_${stamp}`);
  await signInAs(page, `e2e_browse_reader_${stamp}`, reader.email);
  await page.getByRole("link", { name: "Opportunities" }).first().click();
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Type: Any", exact: true }).click();
  await page.getByRole("option", { name: "Job", exact: true }).click();
  await page.getByLabel("Search opportunities").fill(String(stamp));
  await page.keyboard.press("Enter");
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o02-list.png`, fullPage: true });
  await page.getByRole("link", { name: title }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Keep the books for a growing trading business")).toBeVisible();
  await expect(page.getByRole("link", { name: "Report", exact: true })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o02-detail.png`, fullPage: true });

  await hideOpportunity(id);
  await page.reload();
  await expect(page.getByText("This post is not available")).toBeVisible();
  await page.getByRole("link", { name: "Back to Opportunities" }).click();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});
