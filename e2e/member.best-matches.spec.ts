import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  publishOpportunity,
  setSkills,
  signInAs,
} from "./helpers";

test("a Member with skills sees the posts that fit them first, and can switch to Newest (O11)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_best_poster_${stamp}`);
  await addProfile(poster.id, `Best Poster ${stamp}`);
  await makePoster(poster.id, `Best Traders ${stamp}`);
  const fit = `Fits you ${stamp}`;
  await publishOpportunity(poster.id, fit, [`weaving${stamp}`, `dyeing${stamp}`]);
  await publishOpportunity(poster.id, `Newer but unrelated ${stamp}`, [`welding${stamp}`]);

  const reader = await createMember(`e2e_best_reader_${stamp}`);
  await addProfile(reader.id, `Best Reader ${stamp}`);
  await setSkills(reader.id, [`weaving${stamp}`, `dyeing${stamp}`]);
  await signInAs(page, `e2e_best_reader_${stamp}`, reader.email);
  await page.goto("/opportunities");

  await expect(page.getByRole("tab", { name: "Best matches" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const firstCard = page.getByRole("link", { name: fit });
  await expect(firstCard).toBeVisible();
  await expect(firstCard.getByText(`weaving${stamp} ✓`)).toBeVisible();
  await expect(firstCard.getByText(`dyeing${stamp} ✓`)).toBeVisible();
  const cards = page.getByRole("link", { name: new RegExp(`${stamp}$`) });
  await expect(cards.first()).toHaveAccessibleName(fit);

  await page.getByRole("tab", { name: "Newest" }).click();
  await expect(page.getByRole("tab", { name: "Newest" })).toHaveAttribute("aria-selected", "true");
});
