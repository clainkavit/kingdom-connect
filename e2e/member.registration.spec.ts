import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { expect, type Page, test } from "@playwright/test";
import { enterCode, LOCAL_SERVICE_ROLE_KEY, nextCode } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const service = {
  apikey: LOCAL_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function signUp(page: Page, username: string) {
  const email = `${username.replace(/_/g, ".")}@example.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("0712 345 678");
  await page.getByLabel("Password", { exact: true }).fill("kingdom-test-1");
  const sentAfter = new Date();
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await enterCode(page, await nextCode(email, sentAfter));
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  return email;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: `${label}: Choose` }).click();
  await page.getByLabel(`Search: ${label}`).fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function upload(page: Page, which: number) {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Choose photo|Replace photo/ })
    .nth(which)
    .click();
  await (await chooser).setFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
}

async function saveNida(page: Page, nida: string) {
  await page.getByRole("radio", { name: "NIDA" }).click();
  await page.getByLabel("ID number", { exact: true }).fill(nida);
  await page.getByRole("button", { name: "Save ID" }).click();
}

const nidaFor = (seed: number) => String(seed).padStart(20, "7").slice(-20);

test("a person signs up, completes the six steps and is approved (REG-1, S02, S05, S06)", async ({
  page,
}) => {
  const username = `e2e_reg_${Date.now()}`;
  await signUp(page, username);

  await page.getByLabel("Full name, as on your ID").fill("Test Applicant");
  await choose(page, "Region", "Mwanza");
  await choose(page, "District", "Nyamagana");
  await page.getByLabel("Address (street, area or plot)").fill("Plot 1, Test Street");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.getByRole("radio", { name: "Businessperson" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  await page.getByLabel("Business name", { exact: true }).fill("Test Traders");
  await choose(page, "Sector", "Trade");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await saveNida(page, nidaFor(Date.now()));
  await expect(page.getByText("Your ID is saved. Enter it again only to change it.")).toBeVisible();
  await upload(page, 0);
  await expect(page.getByText("Added")).toHaveCount(1);
  await upload(page, 1);
  await expect(page.getByText("Added")).toHaveCount(2);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 5 of 6")).toBeVisible();
  await page.getByRole("checkbox", { name: "I accept the terms of use" }).click();
  await page.getByRole("checkbox", { name: /I consent to how my data is used/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await expect(page.getByText("Test Applicant")).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Registration status" })).toBeVisible();
  await expect(page.getByText("Under review")).toBeVisible();

  const [member] = await fetch(
    `${LOCAL_SUPABASE.url}/rest/v1/members?username=eq.${username}&select=id`,
    { headers: service },
  ).then((r) => r.json());
  await fetch(`${LOCAL_SUPABASE.url}/rest/v1/verification_requests?member_id=eq.${member.id}`, {
    method: "PATCH",
    headers: service,
    body: JSON.stringify({ status: "approved", decided_at: new Date().toISOString() }),
  });
  await fetch(`${LOCAL_SUPABASE.url}/rest/v1/members?id=eq.${member.id}`, {
    method: "PATCH",
    headers: service,
    body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString() }),
  });

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const email = `${username.replace(/_/g, ".")}@example.test`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("kingdom-test-1");
  const sentAfter = new Date();
  await page.getByRole("button", { name: "Log in" }).click();
  await enterCode(page, await nextCode(email, sentAfter));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("an ID that is already registered is refused (PRD section 6, criterion 3)", async ({
  browser,
}) => {
  const nida = nidaFor(Date.now() + 1);
  const first = await browser.newPage();
  await signUp(first, `e2e_id_a_${Date.now()}`);
  await first.getByLabel("Full name, as on your ID").fill("First Applicant");
  await choose(first, "Region", "Arusha");
  await choose(first, "District", "Arusha");
  await first.getByLabel("Address (street, area or plot)").fill("Plot 2");
  await first.getByRole("button", { name: "Next" }).click();
  await first.getByRole("radio", { name: "Other" }).click();
  await first.getByRole("button", { name: "Next" }).click();
  await first.getByLabel("Describe what you do").fill("Farmer");
  await first.getByRole("button", { name: "Next" }).click();
  await saveNida(first, nida);
  await expect(
    first.getByText("Your ID is saved. Enter it again only to change it."),
  ).toBeVisible();
  await first.close();

  const second = await browser.newPage();
  await signUp(second, `e2e_id_b_${Date.now()}`);
  await second.getByLabel("Full name, as on your ID").fill("Second Applicant");
  await choose(second, "Region", "Arusha");
  await choose(second, "District", "Arusha");
  await second.getByLabel("Address (street, area or plot)").fill("Plot 3");
  await second.getByRole("button", { name: "Next" }).click();
  await second.getByRole("radio", { name: "Other" }).click();
  await second.getByRole("button", { name: "Next" }).click();
  await second.getByLabel("Describe what you do").fill("Teacher");
  await second.getByRole("button", { name: "Next" }).click();
  await saveNida(second, nida);
  await expect(second.getByRole("alert")).toHaveText("This ID is already registered.");
  await second.close();
});
