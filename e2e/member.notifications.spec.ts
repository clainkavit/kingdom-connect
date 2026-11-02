import { expect, test } from "@playwright/test";
import { createMember, emailsTo, notify, sendQueuedEmails, signInAs } from "./helpers";

test("the bell counts unread notifications and the centre opens them (S09)", async ({ page }) => {
  const username = `e2e_bell_${Date.now()}`;
  const { email, id } = await createMember(username);
  await notify(id, "C1", { name: "Test Sender" });

  await signInAs(page, username, email);
  await page.getByLabel("Notifications, 1 unread").click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(
    page.getByText("Test Sender wants to connect with you.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("link", { name: "New connection request" }).click();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByLabel("Notifications, 0 unread")).toBeVisible();
});

test("turning an email category off stops that email, but critical ones still arrive (S46)", async ({
  page,
}) => {
  const username = `e2e_switch_${Date.now()}`;
  const { email, id } = await createMember(username);
  await signInAs(page, username, email);

  await page.goto("/notifications/settings");
  const connections = page.getByRole("switch", { name: "Email for Connection requests" });
  await expect(connections).toHaveAttribute("aria-checked", "true");
  await connections.click();
  await expect(connections).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(connections).toHaveAttribute("aria-checked", "false");

  const after = new Date();
  await notify(id, "C1", { name: "Test Sender" });
  await notify(id, "X2", { reason: "Test reason" });
  await sendQueuedEmails();

  const subjects = (await emailsTo(email, after)).map((m) => m.Subject);
  expect(subjects).not.toContain("New connection request");
  expect(subjects).toContain("Your posting is paused");
});
