import { expect, test } from "@playwright/test";
import {
  ADMIN_URL,
  addProfile,
  createMember,
  notificationKinds,
  signInAs,
  signInToAdmin,
} from "./helpers";

const FEE_MESSAGE = "Pay a 20,000 registration fee first";

test("Release 1 journey: connect, accept on the dashboard, message, report, an Administrator acts, the reporter sees the outcome (PRD section 17)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const asker = await createMember(`e2e_journey_asker_${stamp}`);
  const receiver = await createMember(`e2e_journey_receiver_${stamp}`);
  await addProfile(asker.id, `Journey Asker ${stamp}`);
  await addProfile(receiver.id, `Journey Receiver ${stamp}`);

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await signInAs(a, `e2e_journey_asker_${stamp}`, asker.email);
  await signInAs(b, `e2e_journey_receiver_${stamp}`, receiver.email);

  await a.goto("/people");
  await a.getByLabel("Search by name, profession or skill").fill(`Journey Receiver ${stamp}`);
  await a.getByRole("button", { name: "Search" }).click();
  await a.getByRole("link", { name: "Connect", exact: true }).click();
  await a.getByLabel("Add a note (optional)").fill("Can I ask about the job?");
  await a.getByRole("button", { name: "Send request" }).click();
  await expect(a.getByText("Request sent")).toBeVisible();

  await b.goto("/");
  await expect(b.getByText("Can I ask about the job?")).toBeVisible();
  await b.getByRole("button", { name: "Accept" }).click();
  await expect(b.getByText("No requests waiting")).toBeVisible();

  await b.goto(`/profile/${asker.id}`);
  await b.getByRole("button", { name: "Message", exact: true }).click();
  await expect(b).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await b.getByLabel("Write a message").fill(FEE_MESSAGE);
  await b.getByRole("button", { name: "Send", exact: true }).click();
  await expect(b.getByText(FEE_MESSAGE)).toBeVisible();

  await a.goto("/messages");
  await a.getByRole("link", { name: new RegExp(`Journey Receiver ${stamp}`) }).click();
  await expect(a.getByText(FEE_MESSAGE)).toBeVisible();
  await a.getByRole("link", { name: "Report", exact: true }).click();
  await a.getByRole("button", { name: /Why are you reporting\?/ }).click();
  await a.getByRole("option", { name: "Asked for money" }).click();
  await a.getByRole("button", { name: "Send report" }).click();
  const referenceLine = a.getByText(/^Your reference: KC-\d{4}-\d{6,}$/);
  await expect(referenceLine).toBeVisible();
  const reference = (await referenceLine.textContent())!.replace("Your reference: ", "").trim();

  await signInToAdmin(admin);
  await admin.goto(`${ADMIN_URL}/reports`);
  await admin.getByRole("link", { name: new RegExp(reference) }).click();
  await expect(admin.getByText(FEE_MESSAGE)).toBeVisible();
  await admin.getByRole("button", { name: "Warn" }).click();
  await admin.getByLabel("Note for staff (required)").fill("Asked for a fee in chat");
  await admin.getByLabel("Message to the member (required)").fill("Never ask members for money.");
  await admin.getByRole("button", { name: "Confirm decision" }).click();
  await expect(
    admin.getByText("Decision saved. Each reporter was told the outcome."),
  ).toBeVisible();

  await a.goto("/reports");
  await expect(a.getByText(reference)).toBeVisible();
  await expect(a.getByText(reference).locator("xpath=../..")).toContainText("Action taken");
  expect(await notificationKinds(asker.id)).toContain("R1");
});
