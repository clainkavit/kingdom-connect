import { expect, test } from "@playwright/test";
import { addProfile, createMember, requestConnection, signInAs } from "./helpers";

test("the dashboard welcomes the Member and answers a request inline, with no community counts (S08, PRD section 7)", async ({
  page,
}) => {
  const stamp = Date.now();
  const member = await createMember(`e2e_dash_${stamp}`);
  const asker = await createMember(`e2e_dash_asker_${stamp}`);
  await addProfile(member.id, `Dashboard Member ${stamp}`);
  await addProfile(asker.id, `Dashboard Asker ${stamp}`);
  await requestConnection(asker.id, member.id, "We met at the youth meeting");

  await signInAs(page, `e2e_dash_${stamp}`, member.email);
  await expect(page.getByText(`Hello, Dashboard Member ${stamp}`)).toBeVisible();
  await expect(page.getByText("We met at the youth meeting")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("No requests waiting")).toBeVisible();
  await expect(page.getByText("Verify your business to post opportunities.")).toBeVisible();
  await expect(page.getByText(/verified members|registered businesses/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Latest", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Training" }).click();
  await expect(page.getByRole("radio", { name: "Training" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("heading", { name: "News and updates", exact: true })).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/d01-dashboard.png`,
      fullPage: true,
    });
});
