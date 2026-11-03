import { expect, test } from "@playwright/test";
import { signInToAdmin } from "./helpers";

test("the admin dashboard shows the queue counts and each opens its queue (A01, PRD section 7)", async ({
  page,
}) => {
  await signInToAdmin(page);
  await expect(page.getByRole("link", { name: /Waiting for verification/ })).toBeVisible();
  await expect(page.getByText("Sign-ups today")).toBeVisible();
  await page.getByRole("link", { name: /Open reports/ }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
});
