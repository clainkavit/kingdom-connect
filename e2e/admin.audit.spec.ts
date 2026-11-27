import { expect, test } from "@playwright/test";
import { ADMIN_URL, addAuditEntry, signInToAdmin } from "./helpers";

test("a Super Admin reads the audit log in plain words, with routine jobs hidden (SAFE-4, A13)", async ({
  page,
}) => {
  const run = Date.now();
  const setting = `e2e check ${run}`;
  await addAuditEntry(
    "platform_settings.update",
    { key: `e2e_check_${run}`, value: 5, note: "kept" },
    { key: `e2e_check_${run}`, value: 10, note: "kept" },
    "platform_settings",
  );
  await addAuditEntry(
    "platform_settings.update",
    { key: `e2e_${run}_last_run`, value: "2026-11-26" },
    { key: `e2e_${run}_last_run`, value: "2026-11-27" },
    "platform_settings",
  );

  await signInToAdmin(page, "test.superadmin@example.test");
  await page
    .getByRole("navigation", { name: "Admin menu" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await page.getByLabel("Who").selectOption({ label: "The system" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();

  const sentence = `The system changed the setting “${setting}”`;
  await expect(page.getByRole("button", { name: sentence })).toBeVisible();
  await expect(page.getByRole("button", { name: `The e2e ${run} last run ran` })).toHaveCount(0);

  await page.getByRole("button", { name: sentence }).click();
  const panel = page.getByRole("complementary", { name: "What changed" });
  await expect(panel.getByRole("definition").filter({ hasText: "5 → 10" })).toBeVisible();
  await expect(panel.getByText(/note/i)).toHaveCount(0);
  await panel.getByRole("button", { name: "Technical details" }).click();
  await expect(panel.getByText("platform_settings.update")).toBeVisible();
  await expect(panel.getByText(/"note": "kept"/)).toHaveCount(2);

  await page.getByLabel("Show routine system jobs").check();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: `The e2e ${run} last run ran` })).toBeVisible();
});

test("an Administrator cannot open the audit log (SAFE-4)", async ({ page }) => {
  await signInToAdmin(page);
  await expect(
    page.getByRole("navigation", { name: "Admin menu" }).getByRole("link", { name: "Audit log" }),
  ).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/audit-log`);
  await expect(page.getByText("Only Super Admins can open the audit log.")).toBeVisible();
});
