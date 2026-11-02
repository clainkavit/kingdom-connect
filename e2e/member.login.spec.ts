import { expect, test } from "@playwright/test";
import { createMember, enterCode, logIn, nextCode, nextEmail } from "./helpers";

test("a Member logs in with the email code and logs out again (REG-4)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  const sentAfter = new Date();
  await logIn(page, "Username", "test_level1");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await enterCode(page, await nextCode("test.level1@example.test", sentAfter));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Report a Scam / Bad User")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong code says how many tries are left", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "Username", "test_level3");
  await enterCode(page, "000000");
  await expect(page.getByText("That code is not right. 2 tries left.")).toBeVisible();
});

test("a wrong password and an unknown username get the same message (S03)", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "Username", "test_level2", "not-the-password");
  await expect(page.getByText("Wrong username or password.")).toBeVisible();

  await page.reload();
  await logIn(page, "Username", "no_such_member", "not-the-password");
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
});

test("five failed passwords lock the account for 15 minutes (PRD section 6, criterion 8)", async ({
  page,
}) => {
  const username = `e2e_lock_${Date.now()}`;
  const { email } = await createMember(username);
  const startedAt = new Date();

  await page.goto("/login");
  for (let i = 0; i < 4; i++) {
    await logIn(page, "Username", username, "not-the-password");
    await expect(page.getByText("Wrong username or password.")).toBeVisible();
  }
  await logIn(page, "Username", username, "not-the-password");
  await expect(
    page.getByText(/Too many failed attempts\. Try again in 1[45]:\d\d\./),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeDisabled();

  await nextEmail(email, startedAt, /locked for 15 minutes/);
});

test("a suspended Member is told why after the right password (S03)", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "Username", "test_suspended");
  await expect(page.getByText("Your account is suspended. An admin will review it.")).toBeVisible();
});

test("an Applicant reaches Registration status only", async ({ page }) => {
  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, "Username", "test_applicant");
  await enterCode(page, await nextCode("test.applicant@example.test", sentAfter));
  await expect(page.getByRole("heading", { name: "Registration status" })).toBeVisible();
  await expect(
    page.getByText("Your application is being reviewed.", { exact: false }),
  ).toBeVisible();

  await page.goto("/messages");
  await expect(page).toHaveURL(/\/status$/);
});
