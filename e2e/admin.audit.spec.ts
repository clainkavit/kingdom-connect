import { expect, test } from "@playwright/test";
import { ADMIN_URL, addAuditEntry, signInToAdmin } from "./helpers";

test("a Super Admin filters the audit log and reads the changed fields (SAFE-4, A13)", async ({
  page,
}) => {
  const action = `e2e.check_${Date.now()}`;
  await addAuditEntry(action, { status: "open", note: "kept" }, { status: "closed", note: "kept" });

  await signInToAdmin(page, "test.superadmin@example.test");
  await page
    .getByRole("navigation", { name: "Admin menu" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await page.getByLabel("Action").selectOption(action);
  await page.getByRole("button", { name: "Apply filters" }).click();
  const log = page.getByRole("list", { name: "Audit log" });
  await expect(log.getByText(action)).toBeVisible();
  await expect(log.getByText("status: open → closed")).toBeVisible();
  await expect(log.getByText(/note/)).toHaveCount(0);
  await log.getByRole("button", { name: "Show full record" }).click();
  await expect(log.getByText(/"note": "kept"/)).toHaveCount(2);
});

test("an Administrator cannot open the audit log (SAFE-4)", async ({ page }) => {
  await signInToAdmin(page);
  await expect(
    page.getByRole("navigation", { name: "Admin menu" }).getByRole("link", { name: "Audit log" }),
  ).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/audit-log`);
  await expect(page.getByText("Only Super Admins can open the audit log.")).toBeVisible();
});
