import { expect, test } from "@playwright/test";
import { addProfile, block, connect, createMember, notificationKinds, signInAs } from "./helpers";

test("connected Members message each other live, with a file, and a block stops sending (CON-3, S14, S15)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const writer = await createMember(`e2e_writer_${stamp}`);
  const reader = await createMember(`e2e_reader_${stamp}`);
  await addProfile(writer.id, `Writing Member ${stamp}`);
  await addProfile(reader.id, `Reading Member ${stamp}`);
  await connect(writer.id, reader.id);

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signInAs(a, `e2e_writer_${stamp}`, writer.email);
  await signInAs(b, `e2e_reader_${stamp}`, reader.email);

  await a.goto(`/profile/${reader.id}`);
  await a.getByRole("button", { name: "Message", exact: true }).click();
  await expect(a).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await a.getByLabel("Write a message").fill("Hello from the writer");
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await expect(a.getByText("Hello from the writer")).toBeVisible();
  expect(await notificationKinds(reader.id)).toContain("C3");

  await b.goto("/messages");
  await b.getByRole("link", { name: `Writing Member ${stamp}, Unread` }).click();
  await expect(b.getByText("Hello from the writer")).toBeVisible();
  await b.getByLabel("Write a message").fill("Hello back");
  await b.getByRole("button", { name: "Send", exact: true }).click();

  await expect(a.getByText("Hello back")).toBeVisible();

  const chooser = a.waitForEvent("filechooser");
  await a.getByRole("button", { name: "Attach a file" }).click();
  await (
    await chooser
  ).setFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%test only\n"),
  });
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await expect(b.getByRole("link", { name: "notes.pdf" })).toBeVisible();

  await a.getByRole("button", { name: "Delete" }).first().click();
  await a.getByRole("button", { name: "Yes, delete" }).click();
  await expect(b.getByText("This message was deleted")).toBeVisible();

  await block(reader.id, writer.id);
  await a.reload();
  await expect(a.getByText("You can't send messages in this conversation.")).toBeVisible();
  await expect(a.getByLabel("Write a message")).toHaveCount(0);
});
