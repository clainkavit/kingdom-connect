import { expect, test } from "@playwright/test";
import { memberIdByPhone, memberState, nextSmsCode } from "./helpers";

test("someone new continues with a phone number, enters the SMS code, chooses a username and looks around (R29, S04b, S01a)", async ({
  page,
}) => {
  const phone = `+2557${String(Date.now()).slice(-8)}`;
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Continue with phone number" }).click();
  await expect(page.getByRole("heading", { name: "Continue with your phone" })).toBeVisible();

  await page.getByLabel("Phone number").fill("+44 7700 900123");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(
    page.getByText("Use a Tanzanian number that starts with +255.", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Phone number").fill(`0${phone.slice(4)}`);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await expect(
    page.getByText(`${phone.slice(0, 4)} ${phone[4]}•• ••• ${phone.slice(-3)}`, { exact: false }),
  ).toBeVisible();
  const code = await nextSmsCode(phone);

  await page.getByLabel("SMS code").fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code is not right. 2 tries left.")).toBeVisible();

  await page.getByLabel("SMS code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "One more step" })).toBeVisible();
  await expect(page.getByText(phone, { exact: false })).toBeVisible();
  await page.getByRole("checkbox", { name: "I accept the terms of use" }).click();
  await page.getByRole("checkbox", { name: "I accept the privacy notice" }).click();
  await page.getByRole("button", { name: "Agree and continue" }).click();
  await expect(page.getByText("Not verified yet")).toBeVisible();

  const id = await memberIdByPhone(phone);
  expect(id).toBeTruthy();
  expect((await memberState(id!))?.status).toBe("signed_in");
});
