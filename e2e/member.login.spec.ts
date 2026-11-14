import { expect, test } from "@playwright/test";
import { createMember, enterCode, logIn, nextCode, nextEmail, setPhone } from "./helpers";

test("a Member logs in with the email code and logs out again (REG-4)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByTestId("intro")).toBeHidden({ timeout: 5_000 });
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const sentAfter = new Date();
  await logIn(page, "Username", "test_level1");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await enterCode(page, await nextCode("test.level1@example.test", sentAfter));
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Member menu" });
  for (const section of ["Home", "People", "Opportunities", "Growth", "Messages"])
    await expect(menu.getByText(section, { exact: true })).toBeVisible();
  await menu.getByText("Growth", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Ideas" }).first()).toBeVisible();

  await page.getByRole("link", { name: "My account" }).click();
  await expect(page.getByRole("link", { name: "Reports & Safety" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a Member logs in with their phone number or their email instead of the username (12 Nov 2026)", async ({
  page,
}) => {
  const stamp = Date.now();
  const member = await createMember(`e2e_phone_login_${stamp}`);
  const phone = `+2557${String(stamp).slice(-8)}`;
  await setPhone(member.id, phone);

  await page.goto("/login");
  let sentAfter = new Date();
  await logIn(page, "Username", `0${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`);
  await enterCode(page, await nextCode(member.email, sentAfter));
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My account" }).click();
  await page.getByRole("button", { name: "Log out" }).click();

  sentAfter = new Date();
  await logIn(page, "Username", member.email.toUpperCase());
  await enterCode(page, await nextCode(member.email, sentAfter));
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
});

test("a phone number two members share does not log either in", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "Username", "+255700000000");
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
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
  await expect(page).toHaveURL(/\/registration$/);
});
