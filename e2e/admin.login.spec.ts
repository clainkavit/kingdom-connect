import { expect, test } from "@playwright/test";
import { enterCode, logIn, nextCode } from "./helpers";

test("an Administrator logs in with their email and the code", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  const sentAfter = new Date();
  await logIn(page, "Email", "test.admin@example.test");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await enterCode(page, await nextCode("test.admin@example.test", sentAfter));

  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a Member's email cannot sign in to the admin console", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "Email", "test.level1@example.test");
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});
