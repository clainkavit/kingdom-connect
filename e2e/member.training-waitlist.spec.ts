import { expect, test } from "@playwright/test";
import { addProfile, createMember, publishTraining, signInAs } from "./helpers";

test("a full training takes a waitlist, and a cancelled seat goes to the first in line (D03, T01)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const trainer = await createMember(`e2e_train_host_${stamp}`);
  const first = await createMember(`e2e_train_first_${stamp}`);
  const second = await createMember(`e2e_train_second_${stamp}`);
  await addProfile(trainer.id, "Training Host");
  await addProfile(first.id, `Training First ${stamp}`);
  await addProfile(second.id, `Training Second ${stamp}`);
  const id = await publishTraining(trainer.id, `Bookkeeping basics ${stamp}`, 1);

  await signInAs(page, `e2e_train_first_${stamp}`, first.email);
  await page.goto(`/training/${id}`);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page.getByText("You have a seat.")).toBeVisible();

  const other = await browser.newPage();
  await signInAs(other, `e2e_train_second_${stamp}`, second.email);
  await other.goto(`/training/${id}`);
  await other.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(other.getByText("You are number 1 on the waitlist.")).toBeVisible();

  await page.getByRole("button", { name: "Cancel my seat" }).click();
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();

  await other.reload();
  await expect(other.getByText("You have a seat.")).toBeVisible();
  await other.close();
});
