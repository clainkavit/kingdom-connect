import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  auditActions,
  createStaff,
  enterCode,
  emailBody,
  logIn,
  nextCode,
  nextEmail,
  sendQueuedEmails,
  signInToAdmin,
  TEST_PASSWORD,
  urlInTextEmail,
  userIdByEmail,
} from "./helpers";

const SUPER = "test.superadmin@example.test";

const login = (email: string, password: string) =>
  fetch(`${LOCAL_SUPABASE.url}/functions/v1/login`, {
    method: "POST",
    headers: { apikey: LOCAL_SUPABASE.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

test("a staff member asks for a reset, a Super Administrator sends the link, and the new password works once (R30)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const name = `Reset Staff ${stamp}`;
  const email = await createStaff(name);
  const staffId = await userIdByEmail(email);

  await page.goto(`${ADMIN_URL}/login`);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  const askedAt = new Date();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Ask for a reset" }).click();
  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await sendQueuedEmails();
  await nextEmail(SUPER, askedAt, new RegExp(`${name} asked to reset`));

  const admin = await browser.newPage();
  await signInToAdmin(admin, SUPER);
  await admin.goto(`${ADMIN_URL}/settings`);
  await admin.getByRole("tab", { name: "Staff accounts" }).click();
  const sentAt = new Date();
  await admin.getByRole("button", { name: `Send reset link: ${name}` }).click();
  await expect(admin.getByText(`Reset link sent to ${name}. It works for 24 hours.`)).toBeVisible();

  const link = await urlInTextEmail(email, sentAt, /Choose a new password/);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("new-pass-22");
  await page.getByLabel("Confirm new password", { exact: true }).fill("new-pass-22");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password is set. Log in to continue.")).toBeVisible();

  await page.goto(link);
  await expect(page.getByText(/expired or was already used/)).toBeVisible();

  expect((await login(email, TEST_PASSWORD)).status).toBe(401);
  await page.goto(`${ADMIN_URL}/login`);
  const codeAfter = new Date();
  await logIn(page, "Email", email, "new-pass-22");
  await enterCode(page, await nextCode(email, codeAfter));
  await expect(
    page.getByRole("heading", { name: /^(Admin dashboard|Good (morning|afternoon|evening), .+)$/ }),
  ).toBeVisible();

  await sendQueuedEmails();
  await nextEmail(email, sentAt, /Your password was changed/);
  expect(await auditActions(staffId)).toEqual(
    expect.arrayContaining(["staff.reset_requested", "staff.reset_sent", "password.reset"]),
  );
});

test("a Super Administrator unlocks a locked staff account (R30)", async ({ page }) => {
  const stamp = Date.now();
  const name = `Locked Staff ${stamp}`;
  const email = await createStaff(name);
  const staffId = await userIdByEmail(email);
  for (let i = 0; i < 5; i++) await login(email, "not-the-password-1");
  expect((await login(email, TEST_PASSWORD)).status).toBe(423);

  await signInToAdmin(page, SUPER);
  await page.goto(`${ADMIN_URL}/settings`);
  await page.getByRole("tab", { name: "Staff accounts" }).click();
  await expect(page.getByText(/Locked after 5 failed sign-ins/).first()).toBeVisible();
  await page.getByRole("button", { name: `Unlock: ${name}` }).click();
  await expect(page.getByText(`${name} can log in again.`)).toBeVisible();

  expect((await login(email, TEST_PASSWORD)).status).toBe(200);
  expect(await auditActions(staffId)).toContain("login.unlocked");
});

test("the recovery email that Supabase Auth sends by itself carries no link or code (R30)", async () => {
  const stamp = Date.now();
  const email = await createStaff(`Recover Staff ${stamp}`);
  const sentAt = new Date();
  const asked = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: LOCAL_SUPABASE.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  expect(asked.ok).toBe(true);
  const body = await emailBody(email, sentAt, /Use Forgot password in the app/);
  expect(body).not.toMatch(/href=|\/verify|token|\d{6}/i);
});
