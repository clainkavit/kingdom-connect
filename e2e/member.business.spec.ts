import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  notificationKinds,
  signInAs,
  signInToAdmin,
} from "./helpers";

const PDF = Buffer.from("%PDF-1.4 test document");

test("a Member sends their business for Level 2, an Administrator approves it, and the Member sees it approved (B01, S40, A02)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const owner = await createMember(`e2e_biz_${stamp}`);
  await addProfile(owner.id, `Business Owner ${stamp}`);
  const businessName = `E2E Traders ${stamp}`;
  const nextYear = `${new Date().getFullYear() + 1}-06-30`;

  await signInAs(page, `e2e_biz_${stamp}`, owner.email);
  await page.goto("/business");
  await expect(page.getByText("Available once your business is verified.")).toBeVisible();
  await page.getByRole("textbox", { name: "Business name" }).fill(businessName);
  await page.getByRole("button", { name: "Sector: Choose" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Size: Choose" }).click();
  await page.getByRole("option", { name: /Small/ }).click();
  await page.getByRole("textbox", { name: "BRELA registration number" }).fill("BRELA-2026-001");
  await page.getByRole("textbox", { name: "TRA TIN" }).fill("123 456 789");
  await page.getByRole("textbox", { name: "Business licence number" }).fill("LIC-2026-77");
  await page.getByRole("textbox", { name: "Licence expires on" }).fill(nextYear);
  for (const label of ["BRELA certificate", "TRA TIN certificate", "Business licence"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: `${label}: Choose file` }).click();
    await (await chooser).setFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByRole("button", { name: `${label}: scan.pdf` })).toBeVisible();
  }
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Sent. We will tell you when it is decided.")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/verification`);
  await admin.getByRole("link", { name: new RegExp(`${businessName}.*Business, Level 2`) }).click();
  await expect(admin.getByText("123-456-789")).toBeVisible();
  await expect(admin.getByRole("link", { name: "Open BRELA certificate" })).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The Member has been told.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Your licence is valid until/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for review" })).toHaveCount(0);
  await expect.poll(() => notificationKinds(owner.id)).toContain("B1");
});
