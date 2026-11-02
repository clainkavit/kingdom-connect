import { expect, test } from "@playwright/test";
import { createMember, logIn, nextCode } from "./helpers";

test("a visitor switches to Kiswahili and it stays after a reload (F07)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Kiswahili" }).click();
  await expect(page.getByRole("heading", { name: "Ingia kwenye Kingdom Connect" })).toBeVisible();
  await expect(page.getByLabel("Jina la mtumiaji", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "sw");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Ingia kwenye Kingdom Connect" })).toBeVisible();
});

test("a Member's language is saved to their account and comes back on a new device (F07)", async ({
  browser,
}) => {
  const username = `e2e_lang_${Date.now()}`;
  const { email } = await createMember(username);

  const signIn = async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    const sentAfter = new Date();
    await logIn(page, "Username", username);
    const code = await nextCode(email, sentAfter);
    await page.getByLabel(/Email code|Msimbo wa barua pepe/).fill(code);
    await page.getByRole("button", { name: /^(Verify|Thibitisha)$/ }).click();
    return { context, page };
  };

  const first = await signIn();
  await expect(first.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await first.page.getByRole("button", { name: "Kiswahili" }).click();
  await expect(first.page.getByRole("heading", { name: "Dashibodi" })).toBeVisible();
  await expect(first.page.getByRole("navigation", { name: "Menyu ya mwanachama" })).toBeVisible();
  await first.context.close();

  const second = await signIn();
  await expect(second.page.getByRole("heading", { name: "Dashibodi" })).toBeVisible();
  await second.context.close();
});

test("a language picked before signing in is saved to the account (F07)", async ({ browser }) => {
  const username = `e2e_lang_pick_${Date.now()}`;
  const { email } = await createMember(username);

  const first = await browser.newContext();
  const page = await first.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Kiswahili" }).click();
  let sentAfter = new Date();
  await logIn(page, "Jina la mtumiaji", username);
  await page.getByLabel("Msimbo wa barua pepe").fill(await nextCode(email, sentAfter));
  await page.getByRole("button", { name: "Thibitisha" }).click();
  await expect(page.getByRole("heading", { name: "Dashibodi" })).toBeVisible();
  await first.close();

  const second = await browser.newContext();
  const next = await second.newPage();
  await next.goto("/login");
  sentAfter = new Date();
  await logIn(next, "Username", username);
  await next.getByLabel("Email code").fill(await nextCode(email, sentAfter));
  await next.getByRole("button", { name: "Verify" }).click();
  await expect(next.getByRole("heading", { name: "Dashibodi" })).toBeVisible();
  await second.close();
});
