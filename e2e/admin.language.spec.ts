import { expect, test } from "@playwright/test";

test("the admin console switches to Kiswahili (F07)", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Kingdom Connect Admin");
  await page.getByRole("button", { name: "Kiswahili" }).click();
  await expect(
    page.getByRole("heading", { name: "Ingia kwenye mfumo wa wasimamizi" }),
  ).toBeVisible();
  await expect(page.getByLabel("Barua pepe", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Wasimamizi wa Kingdom Connect");
});
