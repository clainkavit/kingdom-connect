import { expect, test } from "@playwright/test";
import {
  addPublicListing,
  createStaff,
  opportunityByTitle,
  publicListingStatus,
  signInToAdmin,
} from "./helpers";

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("an Administrator approves a public tender and discards another (O20)", async ({ page }) => {
  const stamp = Date.now();
  const title = `Construction of a bus stand ${stamp}`;
  const other = `Supply of office chairs ${stamp}`;
  await addPublicListing("nest", {
    external_id: `e2e-${stamp}-1`,
    title,
    employer: "IKUNGI DISTRICT COUNCIL",
    summary: "Works, Small Works",
    details: { reference_no: `E2E/${stamp}/W/01` },
    original_url: "https://nest.go.tz/tenders/published-tenders",
    language: "en",
    closing_on: inDays(14),
    region: "SINGIDA",
    sector: "Construction",
    fee_note: "Fees or bid security may apply. See the official notice.",
    translated_title: `Ujenzi wa stendi ya mabasi ${stamp}`,
  });
  const otherId = await addPublicListing("nest", {
    external_id: `e2e-${stamp}-2`,
    title: other,
    original_url: "https://nest.go.tz/tenders/published-tenders",
    closing_on: inDays(14),
  });

  await signInToAdmin(page, await createStaff(`Listings Admin ${stamp}`));
  await page
    .getByRole("navigation", { name: "Admin menu" })
    .getByRole("link", { name: /Public listings/ })
    .click();
  await page.getByLabel("Search titles").fill(String(stamp));
  await page.getByLabel(`Select ${other}`).check();
  await page.getByRole("button", { name: "Discard selected (1)" }).click();
  await expect(page.getByText("1 listing discarded.")).toBeVisible();
  await expect.poll(() => publicListingStatus(otherId)).toBe("discarded");

  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("link", { name: "Open the official notice" })).toHaveAttribute(
    "href",
    "https://nest.go.tz/tenders/published-tenders",
  );
  await expect(page.getByLabel("Region")).toHaveValue(/.+/);
  await page.getByLabel("Skills wanted").fill("civil works");
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText(/^Published\./)).toBeVisible();
  await expect
    .poll(() => opportunityByTitle(title))
    .toEqual({ status: "published", by_staff: true });
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o20-public-listings.png` });
});
