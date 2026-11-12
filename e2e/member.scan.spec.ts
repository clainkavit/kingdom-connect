import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  publishOpportunity,
  setSkills,
  signInAs,
} from "./helpers";

test("Scan for Opportunities matches a post to the member's skills and says why (O07, S16)", async ({
  page,
}) => {
  const stamp = Date.now();
  const skill = `ledgerwork${stamp}`;
  const poster = await createMember(`e2e_scan_poster_${stamp}`);
  await addProfile(poster.id, "Scan Poster");
  await makePoster(poster.id, `Scan Traders ${stamp}`);
  const title = `Ledger clerk ${stamp}`;
  await publishOpportunity(poster.id, title, [skill]);

  const member = await createMember(`e2e_scan_member_${stamp}`);
  await addProfile(member.id, `Scan Member ${stamp}`);
  await setSkills(member.id, [skill]);
  await signInAs(page, `e2e_scan_member_${stamp}`, member.email);
  await page.getByRole("link", { name: "Scan for opportunities" }).first().click();
  await expect(page.getByRole("heading", { name: "Scan for opportunities" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByText(`Your skills: ${skill}`, { exact: false })).toBeVisible();
  await expect(page.getByText(/Add .* to your profile for better matches/)).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/o07-scan.png`, fullPage: true });
});
