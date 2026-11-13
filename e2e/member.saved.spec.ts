import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  hideOpportunity,
  makePoster,
  publishOpportunity,
  signInAs,
} from "./helpers";

test("a Member saves opportunities, finds them under Saved, and a hidden one shows as gone (O10)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_saved_poster_${stamp}`);
  await addProfile(poster.id, `Saved Poster ${stamp}`);
  await makePoster(poster.id, `Saved Traders ${stamp}`);
  const kept = `Kept post ${stamp}`;
  const gone = `Gone post ${stamp}`;
  await publishOpportunity(poster.id, kept);
  const goneId = await publishOpportunity(poster.id, gone);

  const reader = await createMember(`e2e_saved_reader_${stamp}`);
  await signInAs(page, `e2e_saved_reader_${stamp}`, reader.email);
  await page.goto("/opportunities");
  await page.getByRole("button", { name: `Save ${kept}` }).click();
  await page.getByRole("button", { name: `Save ${gone}` }).click();
  await expect(page.getByRole("link", { name: "Saved · 2" })).toBeVisible();

  await hideOpportunity(goneId);
  await page.getByRole("link", { name: "Saved · 2" }).click();
  await expect(page.getByRole("heading", { name: "Saved opportunities" })).toBeVisible();
  await expect(page.getByRole("link", { name: kept })).toBeVisible();
  await expect(page.getByText("This post is no longer available.")).toBeVisible();
  await expect(page.getByText(gone)).toHaveCount(0);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("This post is no longer available.")).toHaveCount(0);
});
