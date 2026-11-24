import { expect, type Page, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  pastRatings,
  publishOpportunity,
  shortlistResponse,
  signInAs,
} from "./helpers";

const scores = [
  "Did what they promised, on time",
  "Quality of the work",
  "Communication",
  "Honesty and respect",
];

async function rate(page: Page, other: string, comment: string) {
  await page.goto("/work");
  await page.getByRole("link", { name: "Rate the work" }).click();
  await expect(page.getByRole("heading", { name: `How was working with ${other}?` })).toBeVisible();
  for (const q of scores) await page.getByRole("radiogroup", { name: q }).getByLabel("5").click();
  await page
    .getByRole("radiogroup", { name: `Would you work with ${other} again?` })
    .getByLabel("Yes")
    .click();
  await page.getByLabel("A few words for their profile (optional)").fill(comment);
  await page.getByRole("button", { name: "Send rating" }).click();
  await expect(page.getByText("Rating sent. It cannot be changed.")).toBeVisible();
}

test("a poster marks hired, the member confirms, both rate, and references show from the third (O18, S21, S52, S53, S11)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_wr_poster_${stamp}`);
  await addProfile(poster.id, `Work Poster ${stamp}`);
  await makePoster(poster.id, `Work Traders ${stamp}`);
  const id = await publishOpportunity(poster.id, `Tailor wanted ${stamp}`);
  const worker = await createMember(`e2e_wr_worker_${stamp}`);
  await addProfile(worker.id, `Work Tailor ${stamp}`);
  await shortlistResponse(id, worker.id);
  const earlier = [];
  for (const n of [1, 2]) {
    const m = await createMember(`e2e_wr_earlier${n}_${stamp}`);
    await addProfile(m.id, `Earlier Client ${n} ${stamp}`);
    earlier.push(m.id);
  }
  await pastRatings(worker.id, earlier, id);

  const posterPage = await browser.newPage();
  await signInAs(posterPage, `e2e_wr_poster_${stamp}`, poster.email);
  await posterPage.goto(`/opportunities/${id}/responses`);
  await posterPage.getByRole("button", { name: "Mark as hired" }).click();
  await posterPage.getByRole("button", { name: "Mark as hired" }).first().click();
  await expect(posterPage.getByText(`Hired · waiting for Work Tailor ${stamp}`)).toBeVisible();

  await signInAs(page, `e2e_wr_worker_${stamp}`, worker.email);
  await page.goto("/profile");
  await expect(page.getByText("Your references appear once you have 3.")).toBeVisible();
  await page.goto("/work");
  await page.getByRole("button", { name: "Yes, I did this work" }).click();
  await rate(page, `Work Poster ${stamp}`, "Clear brief and paid on time.");

  const hidden = posterPage.waitForResponse((r) => r.url().includes("/rpc/work_references"));
  await posterPage.goto(`/profile/${worker.id}`);
  expect(await (await hidden).json()).toEqual([]);
  await expect(posterPage.getByRole("heading", { name: "Work references" })).toHaveCount(0);
  await rate(posterPage, `Work Tailor ${stamp}`, "Every uniform was ready a day early.");

  await posterPage.goto(`/profile/${worker.id}`);
  await expect(posterPage.getByRole("heading", { name: "Work references" })).toBeVisible();
  await expect(
    posterPage.getByText(
      `3 of 3 members who worked with Work Tailor ${stamp} would work with them again`,
    ),
  ).toBeVisible();
  await expect(posterPage.getByText("Every uniform was ready a day early.")).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await posterPage.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o18-references.png` });
  await posterPage.close();
});
