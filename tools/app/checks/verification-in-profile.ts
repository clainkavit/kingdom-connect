import type { Page } from "@playwright/test";
import { expect } from "../check";
import { enterCode } from "../../../e2e/helpers";
import { defineCheck } from "../check";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

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

export default defineCheck(async ({ guest, as, step, emailCode, note }) => {
  const stamp = Date.now();
  const username = `vp_${stamp}`;
  const email = `vp.${stamp}@example.test`;

  const page = await guest("member");
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByRole("button", { name: "Continue with email" }).click();
  const fields = [
    ["Username", username],
    ["Email", email],
    ["Phone", "0712 345 678"],
    ["Password", "kingdom-test-1"],
  ] as const;
  await expect(async () => {
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
    for (const [label, value] of fields)
      await expect(page.getByLabel(label, { exact: true })).toHaveValue(value, { timeout: 500 });
  }).toPass();
  await step(page, "sign up with email", { full: true });
  const sentAfter = new Date();
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await step(page, "check your email");
  await enterCode(page, await emailCode(email, sentAfter));
  await expect(
    page.getByRole("heading", { name: "Please accept the updated texts" }),
  ).toBeVisible();
  await step(page, "accept the texts");
  await page.getByRole("checkbox", { name: "I accept the terms of use" }).click();
  await page.getByRole("checkbox", { name: "I accept the privacy notice" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Verify your identity" })).toBeVisible();
  await step(page, "verify your identity, 0 of 5", { full: true });

  await page.goto("/");
  await step(page, "home before verifying", { full: true });
  await page.goto("/people");
  await step(page, "people locked before verifying");
  await page.goto("/profile/verify");
  await step(page, "profile verify page", { full: true });

  await page.getByRole("button", { name: "Continue: About you" }).click();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await page.getByLabel("Full name, as on your ID").fill("Neema Test");
  await choose(page, "Region", "Mwanza");
  await choose(page, "District", "Nyamagana");
  await page.getByLabel("Address (street, area or plot)").fill("Plot 1, Test Street");
  await step(page, "step 1 about you", { full: true });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await page.getByRole("checkbox", { name: "Businessperson" }).click();
  await page.getByRole("checkbox", { name: "Professional" }).click();
  await step(page, "step 2 what you do", { full: true });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.getByLabel("Profession", { exact: true }).fill("Accountant");
  await page.getByLabel("Business name", { exact: true }).fill("Neema Traders");
  await choose(page, "Sector", "Trade");
  await step(page, "step 3 details", { full: true });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await page.getByRole("radio", { name: "NIDA" }).click();
  await page
    .getByLabel("ID number", { exact: true })
    .fill(String(stamp).padStart(20, "7").slice(-20));
  await page.getByRole("button", { name: "Save ID" }).click();
  await expect(page.getByText("Your ID is saved. Enter it again only to change it.")).toBeVisible();
  await upload(page, 0);
  await expect(page.getByText("Added")).toHaveCount(1);
  await upload(page, 1);
  await expect(page.getByText("Added")).toHaveCount(2);
  await step(page, "step 4 ID and photos", { full: true });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  await step(page, "step 5 check and send", { full: true });
  await page.getByRole("button", { name: "Send to staff" }).click();
  await expect(page.getByText("Under review").first()).toBeVisible();
  await step(page, "under review", { full: true });
  await page.getByRole("link", { name: "Look around while you wait" }).click();
  await step(page, "look around while you wait", { full: true });
  await page.goto("/opportunities");
  await step(page, "opportunities while waiting", { full: true });

  const admin = await as("admin");
  await admin.goto("/verification");
  await step(admin, "admin verification queue", { full: true });
  await admin.getByRole("link", { name: `@${username} ·` }).click();
  await expect(admin.getByRole("button", { name: "Approve" })).toBeVisible();
  await step(admin, "admin application", { full: true });
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The applicant has been told.")).toBeVisible();
  await step(admin, "admin approved");

  await page.goto("/");
  await page.reload();
  await step(page, "home after approval", { full: true });
  await page.goto("/people");
  await step(page, "people after approval");

  note(
    `New person @${username} signed up by email, did the five steps, and an Administrator approved them.`,
  );
});
