import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  publishOpportunity,
  setSkills,
  signInAs,
} from "./helpers";

test("a Member searches from the top bar and finds a person and an opportunity (R22)", async ({
  page,
}) => {
  const stamp = Date.now();
  const word = `zebrawood${stamp}`;
  const poster = await createMember(`e2e_search_poster_${stamp}`);
  await addProfile(poster.id, `Search Poster ${stamp}`);
  await makePoster(poster.id, `Search Traders ${stamp}`);
  await publishOpportunity(poster.id, `Carpenter for ${word} doors`);
  const person = await createMember(`e2e_search_person_${stamp}`);
  await addProfile(person.id, `Neema ${word}`);
  await setSkills(person.id, ["carpentry"]);

  const reader = await createMember(`e2e_search_reader_${stamp}`);
  await signInAs(page, `e2e_search_reader_${stamp}`, reader.email);
  const box = page.getByLabel("Search Kingdom Connect");
  await box.fill(word);
  await box.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=zebrawood\d+$/);
  await expect(page.getByRole("heading", { name: `Results for "${word}"` })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Neema ${word}`) })).toBeVisible();
  await page.getByRole("link", { name: `Carpenter for ${word} doors` }).click();
  await expect(page.getByRole("heading", { name: `Carpenter for ${word} doors` })).toBeVisible();
});
