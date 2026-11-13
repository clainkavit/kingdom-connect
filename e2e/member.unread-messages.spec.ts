import { expect, test } from "@playwright/test";
import { addProfile, connect, createMember, signInAs, startThread, threadReadsOf } from "./helpers";

test("a new message shows a count on Messages, and opening it clears the count (R24)", async ({
  page,
}) => {
  const stamp = Date.now();
  const friend = await createMember(`e2e_unread_friend_${stamp}`);
  await addProfile(friend.id, `Unread Friend ${stamp}`);
  const reader = await createMember(`e2e_unread_reader_${stamp}`);
  await addProfile(reader.id, `Unread Reader ${stamp}`);
  await connect(friend.id, reader.id);
  await startThread(friend.id, reader.id, friend.id, "Habari, are you free on Saturday?");

  await signInAs(page, `e2e_unread_reader_${stamp}`, reader.email);
  const menu = page.getByRole("navigation", { name: "Member menu" });
  await expect(menu.getByRole("link", { name: "Messages, 1 unread" })).toBeVisible();

  await menu.getByRole("link", { name: "Messages, 1 unread" }).click();
  await page.getByText(`Unread Friend ${stamp}`).click();
  await expect(page.getByText("Habari, are you free on Saturday?")).toBeVisible();
  await expect.poll(() => threadReadsOf(reader.id)).toBe(1);
  await page.goto("/");
  await expect(menu.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
});
