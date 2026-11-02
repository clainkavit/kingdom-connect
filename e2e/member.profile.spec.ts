import { expect, test } from "@playwright/test";
import { addProfile, addSynonym, connect, createMember, signInAs } from "./helpers";

test("a Member edits their profile, hides it, and only a connection still sees it (PRO-1, S11, S12)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const owner = await createMember(`e2e_owner_${stamp}`);
  const friend = await createMember(`e2e_friend_${stamp}`);
  const stranger = await createMember(`e2e_stranger_${stamp}`);
  await addProfile(owner.id, "Profile Owner");
  await addProfile(friend.id, "Profile Friend");
  await addProfile(stranger.id, "Profile Stranger");
  await connect(owner.id, friend.id);
  await addSynonym("js", "javascript");

  await signInAs(page, `e2e_owner_${stamp}`, owner.email);
  await page.getByRole("link", { name: "My profile" }).first().click();
  await expect(page.getByText("Add skills to get matched.")).toBeVisible();
  await page.getByRole("link", { name: "Edit profile" }).click();

  await expect(
    page.getByText("Your name matches your ID. To change it, ask an Administrator."),
  ).toBeVisible();
  await page.getByLabel("Headline", { exact: true }).fill("Accountant in Mwanza");
  await page.getByLabel("Add a skill", { exact: true }).fill("js");
  await page.getByRole("button", { name: "javascript", exact: true }).click();
  await page.getByLabel("Add a skill", { exact: true }).fill("  Book Keeping ");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("checkbox", { name: "Hide my profile from the directory" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByText("Accountant in Mwanza")).toBeVisible();
  await expect(page.getByText("javascript", { exact: true })).toBeVisible();
  await expect(page.getByText("book keeping", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your profile is hidden from the directory/)).toBeVisible();

  const asStranger = await browser.newPage();
  await signInAs(asStranger, `e2e_stranger_${stamp}`, stranger.email);
  await asStranger.goto(`/profile/${owner.id}`);
  await expect(asStranger.getByText("Profile not found")).toBeVisible();
  await expect(asStranger.getByText("Accountant in Mwanza")).toHaveCount(0);

  const asFriend = await browser.newPage();
  await signInAs(asFriend, `e2e_friend_${stamp}`, friend.email);
  await asFriend.goto(`/profile/${owner.id}`);
  await expect(asFriend.getByText("Accountant in Mwanza")).toBeVisible();
  await expect(asFriend.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
  await expect(asFriend.getByText(owner.email)).toHaveCount(0);
});
