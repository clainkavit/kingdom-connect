import { expect, test } from "@playwright/test";
import {
  addProfile,
  createMember,
  makePoster,
  nextEmail,
  notificationKinds,
  publishOpportunity,
  retypeOpportunity,
  runJobAlerts,
  sendQueuedEmails,
  signInAs,
} from "./helpers";

test("a Member keeps their filters as an alert and is told about a new matching post (O13)", async ({
  page,
}) => {
  const stamp = Date.now();
  const reader = await createMember(`e2e_alert_reader_${stamp}`);
  await addProfile(reader.id, `Alert Reader ${stamp}`);
  await signInAs(page, `e2e_alert_reader_${stamp}`, reader.email);

  await page.goto("/opportunities");
  await page.getByRole("button", { name: "Type: Any", exact: true }).click();
  await page.getByRole("option", { name: "Investment", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Email me new posts like these" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await page.goto("/settings/alerts");
  await expect(page.getByText("Investment", { exact: true })).toBeVisible();

  const poster = await createMember(`e2e_alert_poster_${stamp}`);
  await addProfile(poster.id, `Alert Poster ${stamp}`);
  await makePoster(poster.id, `Alert Traders ${stamp}`);
  const id = await publishOpportunity(poster.id, `Investor wanted ${stamp}`);
  await retypeOpportunity(id, "investment");

  const sentAfter = new Date();
  expect(await runJobAlerts()).toBeGreaterThan(0);
  await expect.poll(() => notificationKinds(reader.id)).toContain("S2");
  await sendQueuedEmails();
  await nextEmail(reader.email, sentAfter, /New posts for your alerts/);

  await page.getByRole("button", { name: "Remove the alert: Investment" }).click();
  await expect(page.getByText("No alerts yet")).toBeVisible();
});
