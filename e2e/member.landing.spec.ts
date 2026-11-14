import { expect, test } from "@playwright/test";

test("a visitor sees the intro once, then the landing page (S01, Phase 3)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);

  // First open of this device: the intro plays and ends by itself (or is left out when the app
  // took more than 3 s to arrive, as a dev server's first load can).
  await expect(page.getByTestId("intro")).toBeHidden({ timeout: 5_000 });
  await expect(
    page.getByRole("heading", { name: "Find people, opportunities and ideas to grow together" }),
  ).toBeVisible();
  await expect(page.getByText("Every member verified")).toBeVisible();

  // The next open goes straight to the landing page, now that the app comes from the cache.
  await page.reload();
  await expect(page.getByTestId("intro")).toBeHidden({ timeout: 3_000 });

  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("the landing page opens the terms of use for visitors and switches language", async ({
  page,
}) => {
  await page.goto("/welcome");
  await expect(page.getByTestId("intro")).toBeHidden({ timeout: 5_000 });

  await page.getByRole("button", { name: "Kiswahili" }).click();
  await expect(
    page.getByRole("heading", { name: "Pata watu, fursa na mawazo ya kukua pamoja" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();

  await page.getByRole("link", { name: "Terms of use" }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
  await expect(page.getByText("This text is not available yet.")).toBeHidden();
});
