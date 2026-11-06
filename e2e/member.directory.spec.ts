import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  hideProfile,
  pendingBusiness,
  setSkills,
  signInAs,
  verifyBusiness,
} from "./helpers";

test("a Member finds people by skill, and hidden profiles are not listed (PRO-3, S10)", async ({
  page,
}) => {
  const stamp = Date.now();
  const tag = `e2e tag ${stamp}`;
  const searcher = await createMember(`e2e_seek_${stamp}`);
  const first = await createMember(`e2e_found_a_${stamp}`);
  const second = await createMember(`e2e_found_b_${stamp}`);
  const hidden = await createMember(`e2e_hidden_${stamp}`);
  await addProfile(searcher.id, "Directory Searcher");
  await addProfile(first.id, `Found First ${stamp}`);
  await addProfile(second.id, `Found Second ${stamp}`);
  await addProfile(hidden.id, `Hidden Person ${stamp}`);
  for (const m of [first, second, hidden]) await setSkills(m.id, [tag]);
  await hideProfile(hidden.id);

  await signInAs(page, `e2e_seek_${stamp}`, searcher.email);
  await page.goto("/people");
  await page.getByLabel("Search by name, profession or skill").fill(tag);
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText(`Found First ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Found Second ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Hidden Person ${stamp}`)).toHaveCount(0);
  await expect(page.getByText(searcher.email)).toHaveCount(0);

  await page.getByText(`Found First ${stamp}`).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${first.id}$`));

  await page.goto("/people");
  await page.getByLabel("Search by name, profession or skill").fill(`no one has this ${stamp}`);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No one matches")).toBeVisible();
});

test("a Member finds a verified business on the Businesses tab, and a business still waiting is not listed (PRO-3, B03, S10)", async ({
  page,
}) => {
  const stamp = Date.now();
  const searcher = await createMember(`e2e_bizseek_${stamp}`);
  const owner = await createMember(`e2e_bizown_${stamp}`);
  const waiting = await createMember(`e2e_bizwait_${stamp}`);
  await addProfile(owner.id, `Business Owner ${stamp}`);
  await addProfile(waiting.id, `Waiting Owner ${stamp}`);
  await verifyBusiness(owner.id, `Listed Traders ${stamp}`);
  await pendingBusiness(waiting.id, `Waiting Traders ${stamp}`);

  await signInAs(page, `e2e_bizseek_${stamp}`, searcher.email);
  await page.goto("/people");
  await page.getByRole("tab", { name: "Businesses" }).click();
  await page
    .getByRole("textbox", { name: "Search by business name or what it does" })
    .fill(`${stamp}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(`Listed Traders ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Owner: Business Owner ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Waiting Traders ${stamp}`)).toHaveCount(0);
  await page.getByRole("link", { name: new RegExp(`Listed Traders ${stamp}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${owner.id}`));
});
