import { expect, test } from "@playwright/test";
import { signInToAdmin } from "./helpers";

test("the admin dashboard shows the counts and the weekly chart, and each count opens its queue (A01, D06, PRD section 7)", async ({
  page,
}) => {
  await signInToAdmin(page);
  await expect(page.getByRole("link", { name: /Waiting for verification/ })).toBeVisible();
  await expect(page.getByText("Sign-ups today")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^New verified members per week, from \d+ to \d+$/ }),
  ).toBeVisible();
  await expect(page.getByText(/^\d+ this week$/)).toBeVisible();
  await page.getByRole("link", { name: /Open reports/ }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
});
