import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  nextEmail,
  sendQueuedEmails,
  signInAs,
  signInEmail,
  TEST_PASSWORD,
} from "./helpers";

test("a Member changes their phone, then their email with the password and a code to the new address (R08b, S45)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const member = await createMember(`e2e_mover_${stamp}`);
  await addProfile(member.id, `Moving Member ${stamp}`);
  const newEmail = `e2e.moved.${stamp}@example.test`;

  await signInAs(page, `e2e_mover_${stamp}`, member.email);
  await page.goto("/settings/privacy");
  await page.getByRole("button", { name: "Change phone number" }).click();
  await page.getByRole("textbox", { name: "Phone number" }).fill("+255 754 000 999");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("+255754000999").first()).toBeVisible();

  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("textbox", { name: "New email" }).fill(newEmail);
  const sentAfter = new Date();
  await page.getByRole("button", { name: "Send a code to the new email" }).click();
  await expect(
    page.getByText(`We sent a code to ${newEmail}. It works for 10 minutes.`),
  ).toBeVisible();
  const codeEmail = await nextEmail(newEmail, sentAfter, /Confirm your new/);
  await page
    .getByRole("textbox", { name: "Code", exact: true })
    .fill(codeEmail.Snippet.match(/(\d{6})/)![1]!);
  await page.getByRole("button", { name: "Confirm new email" }).click();
  await expect(
    page.getByText("Your email is changed. Use it to sign in from now on."),
  ).toBeVisible();

  expect(await signInEmail(member.id)).toBe(newEmail);
  await nextEmail(member.email, sentAfter, /Your email was changed/);
  await sendQueuedEmails();
  await nextEmail(newEmail, sentAfter, /Your email was changed/);
});
