import { addDays, tanzaniaDate } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import { addProfile, createMember, ideaPartners, signInAs } from "./helpers";

test("a milestone plan goes from proposal to a signed upload (D03, P01 to P03)", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const owner = await createMember(`e2e_plan_owner_${stamp}`);
  const partner = await createMember(`e2e_plan_partner_${stamp}`);
  await addProfile(owner.id, `Plan Owner ${stamp}`);
  await addProfile(partner.id, `Plan Partner ${stamp}`);
  const ideaId = await ideaPartners(owner.id, partner.id, `Fish drying racks ${stamp}`);

  await signInAs(page, `e2e_plan_owner_${stamp}`, owner.email);
  await page.goto(`/plans/new?idea=${ideaId}&with=${partner.id}`);
  await page.getByLabel("What will be done").fill("Build the first drying rack");
  await page.getByLabel("Target date (YYYY-MM-DD)").fill(addDays(tanzaniaDate(), 14));
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Accept and send the plan" }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  const planUrl = new URL(page.url()).pathname;

  const other = await browser.newPage();
  await signInAs(other, `e2e_plan_partner_${stamp}`, partner.email);
  await other.goto(planUrl);
  await other.getByRole("checkbox").first().click();
  await other.getByRole("button", { name: "Accept the plan" }).click();
  await expect(other.getByRole("button", { name: "Accept the plan" })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Mark as done" }).first().click();
  await other.reload();
  await other.getByRole("button", { name: "Confirm it is done" }).first().click();
  await expect(other.getByRole("button", { name: "Confirm it is done" })).toHaveCount(0);

  await page.reload();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload my signed agreement" }).click();
  await (
    await chooser
  ).setFiles({
    name: "signed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"),
  });
  await expect(page.getByText(/You uploaded yours on/)).toBeVisible();
  await other.close();
});
