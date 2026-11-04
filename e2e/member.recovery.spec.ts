import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  applyDueRecoveries,
  createMember,
  nextEmail,
  sendQueuedEmails,
  signInEmail,
  signInToAdmin,
} from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test("a Member who lost their email asks for a new one, an Administrator approves, and it applies after 48 hours (R08c)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const member = await createMember(`e2e_lost_${stamp}`);
  await addProfile(member.id, `Lost Email ${stamp}`);
  const newEmail = `e2e.found.${stamp}@example.test`;
  const sentAfter = new Date();

  await page.goto("/login");
  await page.goto("/recover");
  await page.getByLabel("Username").fill(`e2e_lost_${stamp}`);
  await page.getByLabel("New email").fill(newEmail);
  await page.getByLabel("Last 4 digits of your ID number").fill("1234");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Take or choose a new photo of your face" }).click();
  await (await chooser).setFiles({ name: "face.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Photo added.")).toBeVisible();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/We received your request/)).toBeVisible();

  await sendQueuedEmails();
  await nextEmail(member.email, sentAfter, /A request to change your email/);
  await nextEmail(newEmail, sentAfter, /A request to change your email/);

  const admin = await (await browser.newContext()).newPage();
  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/recoveries`);
  await expect(admin.getByText(newEmail)).toBeVisible();
  await expect(admin.getByRole("img", { name: "New face photo" })).toBeVisible();
  await admin.getByRole("button", { name: "Approve the new email" }).click();
  await expect(admin.getByText("Decision saved. Both emails are told.")).toBeVisible();

  expect(await signInEmail(member.id)).toBe(member.email);
  expect(await applyDueRecoveries()).toBe(1);
  expect(await signInEmail(member.id)).toBe(newEmail);
});
