import { addDays, tanzaniaDate } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import { addProfile, createMember, makePoster, signInAs, tenderOf } from "./helpers";

test("a verified poster sends a tender with its own fields (O04, S20)", async ({ page }) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_tender_${stamp}`);
  await addProfile(poster.id, `Tender Poster ${stamp}`);
  await makePoster(poster.id, `Tender Traders ${stamp}`);
  const title = `Supply of chairs ${stamp}`;

  await signInAs(page, `e2e_tender_${stamp}`, poster.email);
  await page.goto("/opportunities/new");
  await page.getByRole("radio", { name: "Tender" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("switch", { name: "The work is remote" }).click();
  await page.getByRole("button", { name: "Sector: Choose" }).click();
  await page.getByRole("option", { name: "Agriculture", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description and requirements" })
    .fill(
      "We invite verified businesses to supply two hundred plastic chairs for our hall. ".repeat(2),
    );
  await page.getByRole("textbox", { name: "Closing date" }).fill(addDays(tanzaniaDate(), 30));
  await page.getByRole("textbox", { name: "Reference number" }).fill(`TT/${stamp}`);
  await page
    .getByRole("textbox", { name: "Scope of the work" })
    .fill("Supply and deliver 200 plastic chairs to the hall in Mwanza.");
  await page
    .getByRole("textbox", { name: "Documents a bidder must hold (optional)" })
    .fill("BRELA certificate\nTRA TIN certificate");
  await page.getByRole("textbox", { name: "Closing time" }).fill("16:00");
  await page.getByRole("checkbox", { name: /No fee will be charged/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Sent\. Our team reviews it|Your post is live/)).toBeVisible();

  expect(await tenderOf(title)).toEqual({
    issuing_org: `Tender Traders ${stamp}`,
    reference_no: `TT/${stamp}`,
    closing_time: "16:00:00",
    required_documents: ["BRELA certificate", "TRA TIN certificate"],
  });
});
