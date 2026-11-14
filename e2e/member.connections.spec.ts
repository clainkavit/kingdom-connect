import { expect, test } from "@playwright/test";
import { addProfile, createMember, notificationKinds, signInAs } from "./helpers";

test("Members connect: a decline stays hidden, an accept connects, a block ends it (CON-1, CON-2, S13)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const asker = await createMember(`e2e_asker_${stamp}`);
  const receiver = await createMember(`e2e_receiver_${stamp}`);
  await addProfile(asker.id, `Asking Member ${stamp}`);
  await addProfile(receiver.id, `Receiving Member ${stamp}`);

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signInAs(a, `e2e_asker_${stamp}`, asker.email);
  await signInAs(b, `e2e_receiver_${stamp}`, receiver.email);

  await a.goto("/people");
  await a.getByLabel("Search by name, profession or skill").fill(`Receiving Member ${stamp}`);
  await a.keyboard.press("Enter");
  await a.getByRole("link", { name: "Connect", exact: true }).click();
  await a.getByLabel("Add a note (optional)").fill("We met at the Sunday service.");
  await a.getByRole("button", { name: "Send request" }).click();
  await expect(a.getByText("Request sent")).toBeVisible();
  expect(await notificationKinds(receiver.id)).toContain("C1");

  await b.goto("/connections");
  await expect(b.getByText("We met at the Sunday service.")).toBeVisible();
  await b.getByRole("button", { name: "Decline" }).click();
  await expect(b.getByText("No requests yet")).toBeVisible();

  await a.goto("/connections");
  await expect(a.getByText(`Receiving Member ${stamp}`)).toBeVisible();
  await expect(a.getByText("Request sent")).toBeVisible();
  expect(await notificationKinds(asker.id)).not.toContain("C2");
  await a.getByRole("button", { name: "Withdraw" }).click();
  await expect(a.getByText("You have no requests waiting for an answer.")).toBeVisible();

  await a.goto(`/profile/${receiver.id}`);
  await a.getByRole("button", { name: "Connect", exact: true }).click();
  await a.getByRole("button", { name: "Send request" }).click();
  await expect(a.getByText("Request sent")).toBeVisible();

  await b.goto("/connections");
  await b.getByRole("button", { name: "Accept" }).click();
  await expect(b.getByRole("link", { name: `Asking Member ${stamp}` })).toBeVisible();
  await expect.poll(() => notificationKinds(asker.id)).toContain("C2");

  await a.goto(`/profile/${receiver.id}`);
  await expect(a.getByText("Connected", { exact: true })).toBeVisible();
  await a.getByRole("button", { name: "Block" }).click();
  await a.getByRole("button", { name: "Yes, block" }).click();
  await expect(a.getByText("Profile not found")).toBeVisible();

  await b.goto("/connections");
  await expect(b.getByText("No connections yet.")).toBeVisible();

  await a.goto("/settings/privacy");
  await a.getByRole("button", { name: `Unblock Receiving Member ${stamp}` }).click();
  await expect(a.getByText("You haven't blocked anyone.")).toBeVisible();
});
