import { addDays, tanzaniaDate } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  makePoster,
  notificationKinds,
  opportunityByTitle,
  signInAs,
  signInToAdmin,
} from "./helpers";

const description =
  "We are looking for a partner to open a second bakery in Mwanza city, sharing the costs of the oven and the shop.";

test("a new poster sends a post, an Administrator approves it, and it is Published (O01, S20, S21, A04, A05)", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const poster = await createMember(`e2e_opp_${stamp}`);
  await addProfile(poster.id, `Opportunity Poster ${stamp}`);
  await makePoster(poster.id, `E2E Bakery ${stamp}`);
  const title = `Bakery partner ${stamp}`;

  await signInAs(page, `e2e_opp_${stamp}`, poster.email);
  await page.goto("/");
  await page.getByRole("link", { name: "Post an opportunity" }).first().click();
  await expect(page).toHaveURL(/\/opportunities\/new$/);
  await page.getByRole("radio", { name: "Partnership" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("switch", { name: "The work is remote" }).click();
  await page.getByRole("button", { name: "Sector: Choose" }).click();
  await page.getByRole("option", { name: "Agriculture", exact: true }).click();
  await page.getByRole("textbox", { name: "Description and requirements" }).fill(description);
  await page.getByRole("textbox", { name: "Closing date" }).fill(addDays(tanzaniaDate(), 30));
  await page
    .getByRole("checkbox", { name: "No fee will be charged to applicants at any stage" })
    .click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sent. Our team reviews it before members see it.")).toBeVisible();

  await page.getByRole("link", { name: "My posts" }).click();
  await expect(page.getByText(/^Partnership · Pending review · Closes /)).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/moderation`);
  await admin.getByRole("link", { name: new RegExp(title) }).click();
  await expect(admin.getByText(description)).toBeVisible();
  await expect(admin.getByText(`Posted by Opportunity Poster ${stamp}`)).toBeVisible();
  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved. The poster has been told.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(/^Partnership · Published · Closes /)).toBeVisible();
  expect((await opportunityByTitle(title))?.status).toBe("published");
  await expect.poll(() => notificationKinds(poster.id)).toContain("O5");
});

test("an Administrator posts an opportunity from A15 and it publishes at once (O01, A15)", async ({
  page,
}) => {
  const title = `Admin partnership ${Date.now()}`;
  await signInToAdmin(page);
  await page.goto(`${ADMIN_URL}/post`);
  await expect(page.getByLabel("No fee will be charged to applicants at any stage")).toHaveCount(0);
  await page.getByLabel("Type").selectOption("partnership");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("The work is remote").check();
  await page.getByLabel("Sector").selectOption({ label: "Agriculture" });
  await page.getByLabel("Description and requirements").fill(description);
  await page.getByLabel("Closing date").fill(addDays(tanzaniaDate(), 20));
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. Members can see it now.")).toBeVisible();
  expect(await opportunityByTitle(title)).toEqual({ status: "published", by_staff: true });
});
