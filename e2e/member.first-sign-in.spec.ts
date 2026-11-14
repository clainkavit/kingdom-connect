import { expect, test } from "@playwright/test";
import { memberState, newSignInWithoutAccount } from "./helpers";

test("someone new from Google chooses a username, accepts both texts and looks around (R26, S01a)", async ({
  page,
}) => {
  const stamp = Date.now();
  const id = await newSignInWithoutAccount(page, `first.${stamp}@example.test`);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "One more step" })).toBeVisible();
  await expect(page.getByText(`first.${stamp}@example.test`, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue(`first.${stamp}`);

  await page.getByRole("checkbox", { name: "I accept the terms of use" }).click();
  await page.getByRole("checkbox", { name: "I accept the privacy notice" }).click();
  await page.getByRole("button", { name: "Agree and continue" }).click();

  await expect(page.getByText("Not verified yet")).toBeVisible();
  expect((await memberState(id))?.status).toBe("signed_in");
});
