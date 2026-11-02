import { expect, test } from "@playwright/test";
import { addProfile, block, connect, createMember, signInAs } from "./helpers";

test("contact details reach only a connection, only what the owner shares (PRD section 8 criterion 5, S45)", async ({
  browser,
}) => {
  const stamp = Date.now();
  const owner = await createMember(`e2e_owner_${stamp}`);
  const viewer = await createMember(`e2e_viewer_${stamp}`);
  await addProfile(owner.id, `Sharing Owner ${stamp}`);
  await addProfile(viewer.id, "Contact Viewer");

  const ownerPage = await (await browser.newContext()).newPage();
  await signInAs(ownerPage, `e2e_owner_${stamp}`, owner.email);
  await ownerPage.goto("/settings");
  await ownerPage.getByRole("link", { name: "Profile privacy and contact sharing" }).click();
  const phoneSwitch = ownerPage.getByRole("switch", { name: "Share my phone number" });
  await expect(phoneSwitch).toHaveAttribute("aria-checked", "false");
  await expect(ownerPage.getByRole("switch", { name: "Share my email" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await phoneSwitch.click();
  await expect(phoneSwitch).toHaveAttribute("aria-checked", "true");
  await ownerPage.reload();
  await expect(ownerPage.getByRole("switch", { name: "Share my phone number" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const page = await (await browser.newContext()).newPage();
  await signInAs(page, `e2e_viewer_${stamp}`, viewer.email);
  await page.goto(`/profile/${owner.id}`);
  await expect(page.getByText(`Sharing Owner ${stamp}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact" })).toHaveCount(0);
  await expect(page.getByText("+255700000000")).toHaveCount(0);

  await connect(owner.id, viewer.id);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
  await expect(page.getByText("+255700000000")).toBeVisible();
  await expect(page.getByText(owner.email)).toHaveCount(0);
  await expect(page.getByText("Address", { exact: true })).toHaveCount(0);

  await block(owner.id, viewer.id);
  await page.reload();
  await expect(page.getByText("Profile not found")).toBeVisible();
  await expect(page.getByText("+255700000000")).toHaveCount(0);
});
