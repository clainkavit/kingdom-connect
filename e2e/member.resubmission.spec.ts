import { expect, type Page, test } from "@playwright/test";
import {
  createApplication,
  enterCode,
  logIn,
  nextCode,
  notificationKinds,
  openApplication,
  signInToAdmin,
} from "./helpers";

async function signInAsApplicant(page: Page, username: string, email: string) {
  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, "Username", username);
  await enterCode(page, await nextCode(email, sentAfter));
  await expect(page.getByRole("heading", { name: "Registration status" })).toBeVisible();
}

async function reject(admin: Page, username: string, reason: string) {
  await openApplication(admin, username);
  await admin.getByRole("button", { name: "Reject" }).click();
  await admin.getByRole("radio", { name: reason }).check();
  await admin.getByRole("button", { name: "Reject and send the reason" }).click();
  await expect(admin.getByText("Rejected. The applicant has been told the reason.")).toBeVisible();
}

async function resubmitFromReview(page: Page) {
  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Under review")).toBeVisible();
}

test("a rejected Applicant fixes and resubmits once, an Administrator reopens the final rejection, then approves (REG-2, S06)", async ({
  page,
  browser,
}) => {
  const username = `e2e_resub_${Date.now()}`;
  const { id, email } = await createApplication(username, `QR${String(Date.now()).slice(-8)}`);
  const admin = await browser.newPage();
  await signInToAdmin(admin);

  await signInAsApplicant(page, username, email);
  await expect(page.getByText("Under review")).toBeVisible();
  await expect(page.getByText(/notification when the review is done\.$/)).toBeVisible();
  await expect(page.getByText(/working days?/)).toHaveCount(0);

  await reject(admin, username, "The ID has expired");
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await signInAsApplicant(page, username, email);
  await expect(page.getByText("Reason: The ID has expired")).toBeVisible();
  await page.getByRole("button", { name: "Fix and resubmit" }).click();
  await resubmitFromReview(page);

  await reject(admin, username, "The face photo does not match the ID photo");
  expect(await notificationKinds(id)).toEqual(["A1", "A3", "A1", "A4"]);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await signInAsApplicant(page, username, email);
  await expect(
    page.getByText("This decision is final unless an administrator reopens it."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix and resubmit" })).toHaveCount(0);

  await admin.goto(admin.url());
  await admin.getByLabel("Why it is being reopened (for the audit log)").fill("New photo sent");
  await admin.getByRole("button", { name: "Reopen application" }).click();
  await expect(
    admin.getByText("Reopened. The applicant has been told they can send it again."),
  ).toBeVisible();
  await page.reload();
  await resubmitFromReview(page);

  await openApplication(admin, username);
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The applicant has been told.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
