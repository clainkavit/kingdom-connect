import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  enterCode,
  linkInEmail,
  logIn,
  nextCode,
  setApplicationCap,
  signInToAdmin,
  signUpsToday,
} from "./helpers";

const SUPER = "test.superadmin@example.test";

async function signUp(username: string) {
  const res = await fetch(`${LOCAL_SUPABASE.url}/functions/v1/sign-up`, {
    method: "POST",
    headers: { apikey: LOCAL_SUPABASE.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username.replace(/_/g, ".")}@example.test`,
      phone: "0712 345 678",
      password: "kingdom-test-1",
      language: "en",
    }),
  });
  return (await res.json()) as { ok?: boolean; error?: string };
}

test.afterEach(() => setApplicationCap(null));

test("a Super Administrator turns on the daily application cap and sign-up stops at it (PRD section 6, criterion 15)", async ({
  page,
}) => {
  await signInToAdmin(page, SUPER);
  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.getByRole("checkbox", { name: "Limit sign-ups each day" }).check();
  await page.getByLabel("Sign-ups a day").fill(String(await signUpsToday()));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  expect(await signUp(`e2e_cap_${Date.now()}`)).toEqual({ error: "cap_reached" });

  await page.getByRole("checkbox", { name: "Limit sign-ups each day" }).uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect(await signUp(`e2e_cap_${Date.now()}`)).toEqual({ ok: true });
});

test("an Administrator cannot change the cap or create staff", async ({ page }) => {
  await signInToAdmin(page);
  await page.goto(`${ADMIN_URL}/settings`);
  await expect(page.getByRole("checkbox", { name: "Limit sign-ups each day" })).toHaveCount(0);
  await expect(
    page.getByText("Only Super Administrators can change these settings."),
  ).toBeVisible();

  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"))!;
    return JSON.parse(localStorage.getItem(key)!).access_token as string;
  });
  const res = await fetch(`${LOCAL_SUPABASE.url}/functions/v1/create-staff`, {
    method: "POST",
    headers: {
      apikey: LOCAL_SUPABASE.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName: "X",
      email: `e2e.x.${Date.now()}@example.test`,
      role: "admin",
    }),
  });
  expect(res.status).toBe(403);
});

test("a Super Administrator invites an Administrator, who sets a password and logs in, then is deactivated (A16)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const email = `e2e.staff.${stamp}@example.test`;
  const name = `Invited Administrator ${stamp}`;
  await signInToAdmin(page, SUPER);
  await page.goto(`${ADMIN_URL}/settings`);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  const sentAfter = new Date();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(
    page.getByText(`Invite sent to ${email}. The link works for 24 hours.`),
  ).toBeVisible();

  const invited = await browser.newPage();
  await invited.goto(await linkInEmail(email, sentAfter, /staff account/i));
  await invited.getByLabel("New password").fill("staff-pass-1");
  await invited.getByRole("button", { name: "Set password" }).click();
  await expect(invited.getByText("Your password is set. Log in to continue.")).toBeVisible();
  await invited.getByRole("link", { name: "Go to log in" }).click();
  const codeAfter = new Date();
  await logIn(invited, "Email", email, "staff-pass-1");
  await enterCode(invited, await nextCode(email, codeAfter));
  await expect(invited.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: `Deactivate ${name}` }).click();
  await expect(page.getByText(name).locator("..")).toContainText("Deactivated");

  const again = await browser.newPage();
  await again.goto(`${ADMIN_URL}/login`);
  await logIn(again, "Email", email, "staff-pass-1");
  await expect(again.getByText("Wrong email or password.")).toBeVisible();
});

test("an Administrator adds and removes a skill synonym (R06)", async ({ page }) => {
  const stamp = Date.now();
  await signInToAdmin(page);
  await page.goto(`${ADMIN_URL}/settings`);
  await page.getByLabel("Variant").fill(`e2e variant ${stamp}`);
  await page.getByLabel("Skill it means").fill(`e2e skill ${stamp}`);
  await page.getByRole("button", { name: "Add synonym" }).click();
  await expect(page.getByText("Synonym added.")).toBeVisible();
  await expect(page.getByText(`e2e variant ${stamp} → e2e skill ${stamp}`)).toBeVisible();
  await page.getByRole("button", { name: `Remove e2e variant ${stamp}` }).click();
  await expect(page.getByText(`e2e variant ${stamp} → e2e skill ${stamp}`)).toHaveCount(0);
});
