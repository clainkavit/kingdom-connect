import { expect, test } from "@playwright/test";
import { auditActions, createApplication, notificationKinds, openApplication } from "./helpers";

const passportFor = (seed: number) => `QA${String(seed).slice(-8)}`;

test("an Administrator reveals the ID number and rejects with a reason (REG-3, A02, A03)", async ({
  page,
}) => {
  const username = `e2e_queue_${Date.now()}`;
  const passport = passportFor(Date.now());
  const applicant = await createApplication(username, passport);

  await openApplication(page, username);
  await expect(page.getByText(passport)).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal ID number" }).click();
  await expect(page.getByText(passport)).toBeVisible();
  expect(await auditActions(applicant.id)).toContain("id.revealed");

  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("radio", { name: "Another reason, explained in the note" }).check();
  await page.getByRole("button", { name: "Reject and send the reason" }).click();
  await expect(page.getByText("Choose a reason. For another reason, write a note.")).toBeVisible();
  await page.getByLabel("Note for the applicant").fill("The ID photo shows a different document");
  await page.getByRole("button", { name: "Reject and send the reason" }).click();
  await expect(page.getByText("Rejected. The applicant has been told the reason.")).toBeVisible();
  expect(await notificationKinds(applicant.id)).toContain("A3");

  await page.getByRole("link", { name: "Back to the queue" }).click();
  await expect(page.getByRole("link", { name: `@${username} ·` })).toHaveCount(0);
});

test("an Administrator marks a suspected duplicate and compares face photos (PRD section 6, criterion 12)", async ({
  page,
}) => {
  const username = `e2e_dup_${Date.now()}`;
  await createApplication(username, passportFor(Date.now() + 7));

  await openApplication(page, username);
  await page.getByLabel("Suspected duplicate of (username)").fill("nobody_has_this_name");
  await page.getByRole("button", { name: "Mark as duplicate" }).click();
  await expect(page.getByText("No other member has that username.")).toBeVisible();

  await page.getByLabel("Suspected duplicate of (username)").fill("test_level1");
  await page.getByRole("button", { name: "Mark as duplicate" }).click();
  await expect(
    page.getByText("Suspected duplicate of @test_level1. Compare the face photos."),
  ).toBeVisible();
  await expect(page.getByText("Face photo of @test_level1")).toBeVisible();

  await page.getByRole("link", { name: "Back to the queue" }).click();
  await expect(
    page.getByRole("link", { name: `@${username} ·` }).getByText("Suspected duplicate"),
  ).toBeVisible();
});
