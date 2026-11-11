import { expect, test } from "@playwright/test";
import {
  createMember,
  enterCode,
  logIn,
  nextCode,
  nextEmail,
  sendQueuedEmails,
  TEST_PASSWORD,
} from "./helpers";

test("a Member who forgot the password sets a new one with the email code (REG-6, S04a)", async ({
  page,
}) => {
  const username = `e2e_forgot_${Date.now()}`;
  const { email } = await createMember(username);

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

  const sentAfter = new Date();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/If the username is right, we sent a 6-digit code/)).toBeVisible();
  const resetEmail = await nextEmail(email, sentAfter, /^Reset your .* password$/);
  await enterCode(page, resetEmail.Snippet.match(/\b(\d{6})\b/)![1]!);

  const newPassword = "new-pass-2026";
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Type the new password again").fill(newPassword);
  const savedAfter = new Date();
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText(/Your password was changed\./)).toBeVisible();
  await sendQueuedEmails();
  await nextEmail(email, savedAfter, /^Your password was changed$/);

  await page.getByRole("button", { name: "Log in" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page, "Username", username, TEST_PASSWORD);
  await expect(page.getByText("Wrong username or password.")).toBeVisible();

  await page.reload();
  const loginAfter = new Date();
  await logIn(page, "Username", username, newPassword);
  await enterCode(page, await nextCode(email, loginAfter));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("an unknown username gets the same answer as a real one (S04a)", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Username", { exact: true }).fill("no_such_member");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/If the username is right, we sent a 6-digit code/)).toBeVisible();
  await expect(page.getByLabel("Email code")).toBeVisible();
});
