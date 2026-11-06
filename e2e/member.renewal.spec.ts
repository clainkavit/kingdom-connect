import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  notificationKinds,
  signInAs,
  signInToAdmin,
  verifyBusiness,
} from "./helpers";

const PDF = Buffer.from("%PDF-1.4 test document");

test("a licence ending soon is renewed: the Member sends the new licence, an Administrator finds it on Re-verification and approves it (B04, S41, A08)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const owner = await createMember(`e2e_renew_${stamp}`);
  await addProfile(owner.id, `Renewing Owner ${stamp}`);
  const businessName = `E2E Renewals ${stamp}`;
  await verifyBusiness(owner.id, businessName, 10);
  const newDate = `${new Date().getFullYear() + 2}-06-30`;

  await signInAs(page, `e2e_renew_${stamp}`, owner.email);
  await page.goto("/business");
  await expect(page.getByText(/Your licence ends on/)).toBeVisible();
  await page.getByRole("textbox", { name: "New licence number" }).fill(`LIC-NEW-${stamp}`);
  await page.getByRole("textbox", { name: "New licence expires on" }).fill(newDate);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New business licence: Choose file" }).click();
  await (await chooser).setFiles({ name: "licence.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Send the new licence" }).click();
  await expect(
    page.getByText("Sent. We will tell you when the new licence is checked."),
  ).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/re-verification`);
  const row = admin.getByRole("listitem").filter({ hasText: businessName });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Renewal waiting" }).click();
  await expect(admin.getByRole("heading", { level: 1, name: "Licence renewal" })).toBeVisible();
  await expect(admin.getByText(`LIC-NEW-${stamp}`)).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The Member has been told.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Your licence is valid until ${newDate}.`)).toBeVisible();
  await expect(page.getByText("Renew your licence")).toHaveCount(0);
  await expect.poll(() => notificationKinds(owner.id)).toContain("B1");
});
