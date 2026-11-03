import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  memberState,
  profileCount,
  signInAs,
  signInEmail,
} from "./helpers";

test("a Member downloads their data, then deletes it for good (S49, schema section 14)", async ({
  page,
}) => {
  const stamp = Date.now();
  const member = await createMember(`e2e_leaver_${stamp}`);
  await addProfile(member.id, `Leaving Member ${stamp}`);

  await signInAs(page, `e2e_leaver_${stamp}`, member.email);
  await page.goto("/settings");
  await page.getByRole("link", { name: "Download or delete my data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  expect((await download).suggestedFilename()).toBe("my-data.json");
  await expect(page.getByText("Your data was downloaded.")).toBeVisible();

  await page.getByRole("button", { name: "Delete my data" }).click();
  await expect(page.getByText("What is kept")).toBeVisible();
  await page.getByRole("checkbox", { name: "I understand this cannot be undone" }).click();
  await page.getByRole("button", { name: "Delete my data for good" }).click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  expect(await memberState(member.id)).toEqual({ status: "deleted", sessions: 0 });
  expect(await profileCount(member.id)).toBe(0);
  expect(await signInEmail(member.id)).toBe(`deleted-${member.id}@deleted.invalid`);
});
