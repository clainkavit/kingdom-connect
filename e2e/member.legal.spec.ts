import { expect, test } from "@playwright/test";
import { createMember, enterCode, logIn, nextCode } from "./helpers";

test("a Member must accept the current terms and privacy notice before the app opens (S07)", async ({
  page,
}) => {
  const username = `e2e_terms_${Date.now()}`;
  const { email } = await createMember(username, { acceptTexts: false });

  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, "Username", username);
  await enterCode(page, await nextCode(email, sentAfter));

  await expect(
    page.getByRole("heading", { name: "Please accept the updated texts" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Member menu" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByText("Kingdom Connect, which runs Kingdom Connect").first()).toBeVisible();

  const next = page.getByRole("button", { name: "Continue" });
  await page.getByRole("checkbox", { name: "I accept the terms of use" }).click();
  await expect(next).toBeDisabled();
  await page.getByRole("checkbox", { name: "I accept the privacy notice" }).click();
  await next.click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
