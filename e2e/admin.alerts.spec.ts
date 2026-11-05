import { expect, test } from "@playwright/test";
import {
  createMember,
  nextEmail,
  raiseDuplicateIdAlert,
  sendQueuedEmails,
  signInToAdmin,
} from "./helpers";

const SUPER = "test.superadmin@example.test";

test("a security alert reaches the Super Admin by email and on the dashboard, and is marked seen (R17)", async ({
  page,
}) => {
  const member = await createMember(`e2e_alert_${Date.now()}`);
  const after = new Date();
  await raiseDuplicateIdAlert(member.id);
  await sendQueuedEmails();
  await nextEmail(SUPER, after, /Security alert/);

  await signInToAdmin(page, SUPER);
  const panel = page.getByRole("region", { name: "Security alerts" });
  await expect(panel.getByText(/An ID already registered was used again/).first()).toBeVisible();
  const before = await panel.getByRole("button", { name: "Mark as seen" }).count();
  await panel.getByRole("button", { name: "Mark as seen" }).first().click();
  await expect(panel.getByRole("button", { name: "Mark as seen" })).toHaveCount(before - 1);
});
