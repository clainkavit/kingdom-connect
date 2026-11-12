import { expect, test } from "@playwright/test";
import { addProfile, createMember, publishIdea, signInAs } from "./helpers";

test("a member asks for an idea, the owner approves, and the NDA opens the details (D03, I02 to I05)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const owner = await createMember(`e2e_idea_owner_${stamp}`);
  const asker = await createMember(`e2e_idea_asker_${stamp}`);
  await addProfile(owner.id, `Idea Owner ${stamp}`);
  await addProfile(asker.id, `Idea Asker ${stamp}`);
  const title = `Solar cold rooms ${stamp}`;
  const details = `Confidential plan ${stamp}: twelve cold rooms run on solar panels, financed by a fee per crate.`;
  const id = await publishIdea(owner.id, title, details);

  await signInAs(page, `e2e_idea_asker_${stamp}`, asker.email);
  await page.goto(`/ideas/${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(details)).toHaveCount(0);
  await page.getByRole("radio", { name: "Partner" }).click();
  await page.getByRole("button", { name: "I'm interested" }).click();
  await expect(
    page.getByText("Your request was sent. The owner decides who sees the details."),
  ).toBeVisible();

  const ownerPage = await browser.newPage();
  await signInAs(ownerPage, `e2e_idea_owner_${stamp}`, owner.email);
  await ownerPage.goto(`/ideas/${id}`);
  await ownerPage.getByRole("button", { name: "Approve" }).first().click();
  await expect(ownerPage.getByText(/Approved, waiting for the NDA/)).toBeVisible();
  await ownerPage.close();

  await page.reload();
  for (const name of [
    "I accept the intellectual property terms",
    "I accept the non-disclosure agreement",
  ]) {
    const box = page.getByRole("checkbox", { name });
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
  }
  await page.getByRole("button", { name: "Accept and open the details" }).click();
  await expect(page.getByText("You have access to the details.")).toBeVisible();
  await page.goto(`/ideas/${id}/details`);
  await expect(page.getByText(details)).toBeVisible();
});
