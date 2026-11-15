import { expect, test } from "@playwright/test";
import {
  addProfile,
  approveOpportunity,
  askPick,
  createMember,
  draftOpportunity,
  makePoster,
  sendPickList,
  signInAs,
} from "./helpers";

test("a poster asks Kingdom Connect to pick 5, a picked member says yes, and the poster sees them on the list (O16, S20, S50, S51)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_pick_poster_${stamp}`);
  await addProfile(poster.id, `Pick Poster ${stamp}`);
  await makePoster(poster.id, `Pick Traders ${stamp}`);
  const id = await draftOpportunity(poster.id, `Accountant picked ${stamp}`);
  const member = await createMember(`e2e_pick_member_${stamp}`);
  await addProfile(member.id, `Picked Member ${stamp}`);

  await signInAs(page, `e2e_pick_poster_${stamp}`, poster.email);
  await page.goto(`/opportunities/${id}/edit`);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Skills wanted").fill("bookkeeping");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Let Kingdom Connect pick" }).click();
  await page
    .getByRole("radiogroup", { name: "How many people should we send you?" })
    .getByLabel("5", { exact: true })
    .click();
  await page.getByLabel("Anything staff should know? (optional)").fill("Must speak Kiswahili.");
  await page.getByRole("checkbox", { name: /No fee will be charged/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/^Sent\./)).toBeVisible();

  await approveOpportunity(id);
  await page.goto("/opportunities/mine");
  await page.getByRole("link", { name: "Kingdom Connect pick" }).click();
  await expect(page.getByRole("heading", { name: "Kingdom Connect is picking" })).toBeVisible();
  await expect(page.getByText("Must speak Kiswahili.")).toBeVisible();

  await askPick(id, member.id, "Kept the books for two traders.");
  const memberPage = await browser.newPage();
  await signInAs(memberPage, `e2e_pick_member_${stamp}`, member.email);
  await memberPage.goto("/picked");
  await expect(memberPage.getByText(`Accountant picked ${stamp}`)).toBeVisible();
  await memberPage.getByRole("button", { name: "Yes, share my profile" }).click();
  await expect(memberPage.getByText(/You said yes/)).toBeVisible();
  await memberPage.close();

  await sendPickList(id);
  await page.goto(`/opportunities/${id}/pick`);
  await expect(page.getByRole("heading", { name: "Your list" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Picked Member ${stamp}` })).toBeVisible();
  await expect(page.getByText("Kept the books for two traders.")).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o16-list.png`, fullPage: true });
});
