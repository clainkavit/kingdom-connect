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

test("a verified business sends Level 3, an Administrator approves it, and the Member is an Opportunity Poster (B02, S40, A02, A03)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const owner = await createMember(`e2e_poster_${stamp}`);
  await addProfile(owner.id, `Poster Owner ${stamp}`);
  const businessName = `E2E Posters ${stamp}`;
  await verifyBusiness(owner.id, businessName);

  await signInAs(page, `e2e_poster_${stamp}`, owner.email);
  await page.goto("/business");
  await page
    .getByRole("button", { name: "Proof that you can act for the business: Choose" })
    .click();
  await page.getByRole("option", { name: "Authorisation letter signed by a director" }).click();
  await page
    .getByRole("textbox", { name: "Business address (street, area or plot)" })
    .fill("Plot 9, Nyerere Road");
  await page.getByRole("button", { name: "Region: Choose" }).click();
  await page.getByLabel("Search: Region").fill("Mwanza");
  await page.getByRole("option", { name: "Mwanza", exact: true }).click();
  await page.getByRole("button", { name: "District: Choose" }).click();
  await page.getByLabel("Search: District").fill("Nyamagana");
  await page.getByRole("option", { name: "Nyamagana", exact: true }).click();
  for (const label of ["Proof document", "Address proof"]) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: `${label}: Choose file` }).click();
    await (await chooser).setFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByRole("button", { name: `${label}: scan.pdf` })).toBeVisible();
  }
  await page.getByRole("button", { name: "Send for Level 3 review" }).click();
  await expect(page.getByText("Sent. We will tell you when Level 3 is decided.")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/verification`);
  await admin.getByRole("link", { name: new RegExp(`${businessName}.*Business, Level 3`) }).click();
  await expect(admin.getByText("Plot 9, Nyerere Road")).toBeVisible();
  await expect(admin.getByRole("link", { name: "Open Authorisation letter" })).toBeVisible();
  await expect(admin.getByRole("link", { name: "Open Address proof" })).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The Member has been told.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Your business is an Opportunity Poster.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for Level 3 review" })).toHaveCount(0);
  await expect.poll(() => notificationKinds(owner.id)).toContain("B1");
});
