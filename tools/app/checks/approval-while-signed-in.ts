import { defineCheck, expect } from "../check";

export default defineCheck(async ({ as, step, scenario, note }) => {
  const made = (await scenario("applicant-waiting")) as unknown as Record<string, string>;
  const applicant = await as("applicant-waiting");
  await applicant.goto("/");
  await expect(
    applicant.getByText("Your identity is being checked", { exact: true }),
  ).toBeVisible();
  await step(applicant, "applicant home while waiting");

  const admin = await as("admin");
  await admin.goto(made.adminQueue!);
  await admin.getByRole("link", { name: made.queueLink }).click();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The applicant has been told.")).toBeVisible();
  await step(admin, "admin approved");

  await applicant
    .getByRole("link", { name: /Opportunities/ })
    .first()
    .click();
  await applicant.goto("/");
  await expect(applicant.getByText("Verified member", { exact: true })).toBeVisible();
  await expect(applicant.getByText("Not verified yet", { exact: true })).toHaveCount(0);
  await step(applicant, "applicant home after approval, still signed in");

  await applicant.goto("/people");
  await expect(applicant.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await expect(applicant.getByText("This opens once you are verified")).toHaveCount(0);
  await step(applicant, "people open after approval, still signed in");

  note(`@${made.username} was approved while signed in and never signed out.`);
});
