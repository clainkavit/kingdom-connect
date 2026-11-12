import { expect, test } from "@playwright/test";
import { addProfile, createMember, makePoster, publishOpportunity, signInAs } from "./helpers";

test("a Member applies, the poster shortlists, and the Member sees it (O03, S18, S19, S21)", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_resp_poster_${stamp}`);
  await addProfile(poster.id, "Response Poster");
  await makePoster(poster.id, `Response Traders ${stamp}`);
  const title = `Bookkeeper wanted ${stamp}`;
  const id = await publishOpportunity(poster.id, title);

  const applicant = await createMember(`e2e_resp_applicant_${stamp}`);
  await addProfile(applicant.id, `Applicant ${stamp}`);
  await signInAs(page, `e2e_resp_applicant_${stamp}`, applicant.email);
  await page.goto(`/opportunities/${id}`);
  await page.getByLabel("A note to the poster (optional)").fill("Five years of bookkeeping.");
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByRole("heading", { name: "Your application" })).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toBeVisible();

  const posterPage = await browser.newPage();
  await signInAs(posterPage, `e2e_resp_poster_${stamp}`, poster.email);
  await posterPage.goto("/opportunities/mine");
  await posterPage.getByRole("link", { name: "Responses" }).first().click();
  await expect(posterPage.getByText("Five years of bookkeeping.")).toBeVisible();
  await expect(posterPage.getByRole("link", { name: `Applicant ${stamp}` })).toBeVisible();
  await posterPage.getByRole("button", { name: "Shortlist" }).click();
  await expect(posterPage.getByText("Shortlisted", { exact: true })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await posterPage.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o03-responses.png` });
  await posterPage.close();

  await page.goto("/opportunities/responses");
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText("Shortlisted", { exact: true })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o03-mine.png` });
});
