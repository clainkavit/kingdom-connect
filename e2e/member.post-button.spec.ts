import { expect, test } from "@playwright/test";
import { addProfile, createMember, makePoster, signInAs } from "./helpers";

test("only an Opportunity Poster sees Post an opportunity on Opportunities (O14)", async ({
  page,
}) => {
  const stamp = Date.now();
  const member = await createMember(`e2e_pb_member_${stamp}`);
  await addProfile(member.id, `Plain Member ${stamp}`);
  await signInAs(page, `e2e_pb_member_${stamp}`, member.email);
  await page.goto("/opportunities");
  await expect(page.getByRole("tab", { name: "Newest" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Post an opportunity" })).toHaveCount(0);

  const poster = await createMember(`e2e_pb_poster_${stamp}`);
  await addProfile(poster.id, `Poster Member ${stamp}`);
  await makePoster(poster.id, `Poster Traders ${stamp}`);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signInAs(page, `e2e_pb_poster_${stamp}`, poster.email);
  await page.goto("/opportunities");
  await page.getByRole("link", { name: "Post an opportunity" }).click();
  await expect(page).toHaveURL(/\/opportunities\/new$/);
});
