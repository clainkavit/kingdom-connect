import { expect, test } from "@playwright/test";
import {
  addPublicListing,
  approvePublicListing,
  createMember,
  createStaff,
  signInAs,
} from "./helpers";

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("a Member finds an approved public listing and is sent to its official site (O21)", async ({
  page,
}) => {
  const stamp = Date.now();
  const title = `Construction of a market shed ${stamp}`;
  const id = await addPublicListing("nest", {
    external_id: `e2e-member-${stamp}`,
    title,
    employer: "IKUNGI DISTRICT COUNCIL",
    original_url: "https://nest.go.tz/tenders/published-tenders",
    language: "en",
    closing_on: inDays(14),
    fee_note: "Fees or bid security may apply. See the official notice.",
    translated_title: `Ujenzi wa banda la soko ${stamp}`,
  });
  const staff = await createStaff(`Listings Approver ${stamp}`);
  expect((await approvePublicListing(id, staff, "Singida", "Construction")).result).toBe("ok");

  const reader = await createMember(`e2e_public_reader_${stamp}`);
  await signInAs(page, `e2e_public_reader_${stamp}`, reader.email);
  await page.getByRole("link", { name: "Opportunities" }).first().click();
  await expect(page.getByRole("heading", { name: "Opportunities", exact: true })).toBeVisible();
  await page.getByLabel("Search opportunities").fill(`banda ${stamp}`);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Public listing from NeST/).first()).toBeVisible();
  await page.getByRole("link", { name: title }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Public listing from NeST").first()).toBeVisible();
  await expect(
    page.getByText("Fees or bid security may apply. See the official notice.").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Send application|Send interest/ })).toHaveCount(0);
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/o21-public-listing.png`,
      fullPage: true,
    });

  await page
    .context()
    .route("https://nest.go.tz/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>NeST</title>" }),
    );
  const opened = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "Apply on the official site" }).click();
  await expect
    .poll(async () => (await opened).url())
    .toContain("nest.go.tz/tenders/published-tenders");
});
