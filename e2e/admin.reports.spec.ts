import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  auditActions,
  connect,
  createMember,
  fileThreadReport,
  giveSession,
  memberState,
  notificationKinds,
  reportStatus,
  signInToAdmin,
  startThread,
} from "./helpers";

test("an Administrator reads a reported conversation and suspends the account (SAFE-2, SAFE-3, A06, A07)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const reporter = await createMember(`e2e_rq_reporter_${stamp}`);
  const scammer = await createMember(`e2e_rq_scammer_${stamp}`);
  await addProfile(reporter.id, "Queue Reporter");
  await addProfile(scammer.id, `Fee Asker ${stamp}`);
  await connect(reporter.id, scammer.id);
  const thread = await startThread(reporter.id, scammer.id, scammer.id, "Pay 50,000 to start");
  const report = await fileThreadReport(reporter.id, thread, scammer.id);
  await giveSession(scammer.id);

  await signInToAdmin(page);
  await page.goto(`${ADMIN_URL}/reports`);
  await page.getByRole("link", { name: new RegExp(report.reference) }).click();
  await expect(page.getByText("Pay 50,000 to start")).toBeVisible();
  await expect(page.getByText("Wants a fee first")).toBeVisible();

  await page.getByRole("button", { name: "Suspend account" }).click();
  await page.getByLabel("Note for staff (required)").fill("Asked for a fee in chat");
  await page
    .getByLabel("Message to the member (required)")
    .fill("Asking members for money is not allowed.");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.getByText("Decision saved. Each reporter was told the outcome.")).toBeVisible();

  expect(await memberState(scammer.id)).toEqual({ status: "suspended", sessions: 0 });
  expect(await reportStatus(report.id)).toBe("action_taken");
  expect(await notificationKinds(reporter.id)).toContain("R1");
  expect(await notificationKinds(scammer.id)).toContain("X1");
  expect(await auditActions(report.id)).toContain("reports.update");

  await page.goto(`${ADMIN_URL}/reports`);
  await expect(page.getByRole("link", { name: new RegExp(report.reference) })).toHaveCount(0);
});
