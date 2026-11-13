import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  publishOpportunity,
  setSkills,
  signInAs,
} from "./helpers";

test("a Member sees which of a post's skills they have and adds a missing one to their profile (O12)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_sfj_poster_${stamp}`);
  await addProfile(poster.id, `Skills Poster ${stamp}`);
  await makePoster(poster.id, `Skills Traders ${stamp}`);
  const title = `Needs skills ${stamp}`;
  const id = await publishOpportunity(poster.id, title, [`masonry${stamp}`, `tiling${stamp}`]);

  const reader = await createMember(`e2e_sfj_reader_${stamp}`);
  await addProfile(reader.id, `Skills Reader ${stamp}`);
  await setSkills(reader.id, [`masonry${stamp}`]);
  await signInAs(page, `e2e_sfj_reader_${stamp}`, reader.email);
  await page.goto(`/opportunities/${id}`);

  await expect(page.getByRole("heading", { name: "Your skills for this job" })).toBeVisible();
  await expect(page.getByText("You have 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: `Add tiling${stamp} to my skills` }).click();
  await expect(page.getByText("You have 2 of 2")).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText(`tiling${stamp}`)).toBeVisible();
});
