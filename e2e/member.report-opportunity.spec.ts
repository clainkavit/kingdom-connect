import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  createStaff,
  makePoster,
  publishOpportunity,
  signInAs,
  signInToAdmin,
} from "./helpers";

test("a reported post leaves the list at once and staff review it as an opportunity (O06)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const poster = await createMember(`e2e_rep_poster_${stamp}`);
  await addProfile(poster.id, "Report Poster");
  await makePoster(poster.id, `Report Traders ${stamp}`);
  const title = `Sales job with a joining fee ${stamp}`;
  const id = await publishOpportunity(poster.id, title);

  const reader = await createMember(`e2e_rep_reader_${stamp}`);
  await signInAs(page, `e2e_rep_reader_${stamp}`, reader.email);
  await page.goto(`/opportunities/${id}`);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: /Why are you reporting\?/ }).click();
  await page.getByRole("option", { name: "Asked for money" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText(/Your report reference is|reference/i).first()).toBeVisible();

  await page.goto("/opportunities");
  await page.getByLabel("Search opportunities").fill(String(stamp));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Opportunities, newest first")).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  const admin = await browser.newPage();
  await signInToAdmin(admin, await createStaff(`Report Admin ${stamp}`));
  await admin.goto(`${ADMIN_URL}/reports`);
  await admin
    .getByRole("link", { name: /Opportunity/ })
    .first()
    .click();
  await expect(admin.getByText(title)).toBeVisible();
  await expect(admin.getByText("Hidden from members while this report is open.")).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await admin.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/o06-report.png`,
      fullPage: true,
    });
  await admin.close();
});
