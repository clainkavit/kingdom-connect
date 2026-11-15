import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  answerPick,
  createMember,
  createStaff,
  makePoster,
  pickedPost,
  pickRequestStatus,
  signInToAdmin,
} from "./helpers";

test("staff pick 2 members, ask them, one says yes, and staff send the list (D07, A18)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_apick_poster_${stamp}`);
  await addProfile(poster.id, `Admin Pick Poster ${stamp}`);
  await makePoster(poster.id, `Admin Pick Traders ${stamp}`);
  const title = `Bookkeeper to pick ${stamp}`;
  const id = await pickedPost(poster.id, title);
  const members = [];
  for (const n of [1, 2]) {
    const m = await createMember(`e2e_apick_m${n}_${stamp}`);
    await addProfile(m.id, `Admin Pick Member ${n} ${stamp}`);
    members.push(m);
  }

  await signInToAdmin(page, await createStaff(`Pick Staff ${stamp}`));
  await page.goto(`${ADMIN_URL}/picks`);
  const panel = page.getByRole("region", { name: title });
  await expect(panel).toBeVisible();
  for (const n of [1, 2]) {
    await panel.getByLabel("Add a member").fill(`e2e_apick_m${n}_${stamp}`);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      panel.getByRole("checkbox", { name: `Pick Admin Pick Member ${n} ${stamp}` }),
    ).toBeChecked();
  }
  const whys = panel.getByLabel("Why we picked them (the poster sees this)");
  await whys.nth(0).fill("Kept the books for two traders.");
  await whys.nth(1).fill("Careful with numbers and on time.");
  await panel.getByRole("button", { name: "Ask the ticked members" }).click();
  await expect(panel.getByText("2 members asked.")).toBeVisible();

  await answerPick(id, members[0]!.id, true);
  await page.reload();
  const again = page.getByRole("region", { name: title });
  await expect(again.getByText("Said yes", { exact: true })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/d07-picks.png`, fullPage: true });
  await again.getByRole("button", { name: "Send the list to the poster" }).click();
  await expect(again.getByText("The list was sent to the poster.")).toBeVisible();
  expect(await pickRequestStatus(id)).toBe("sent");
});
