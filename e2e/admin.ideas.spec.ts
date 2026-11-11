import { expect, test } from "@playwright/test";
import { signInToAdmin } from "./helpers";

test("staff see ideas in brief on the Ideas page, with no export (A17, D05)", async ({ page }) => {
  await signInToAdmin(page);
  await page.getByRole("link", { name: "Ideas", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Published/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From interest to NDA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All ideas" })).toBeVisible();
  await expect(page.getByText(/export/i)).toHaveCount(0);
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/d05-ideas.png`, fullPage: true });
});
