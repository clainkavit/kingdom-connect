import { expect, test } from "@playwright/test";
import { ADMIN_URL, signInToAdmin } from "./helpers";

const SUPER = "test.superadmin@example.test";

test("a Super Administrator changes a matching weight and sees the legal versions (A16, D02)", async ({
  page,
}) => {
  await signInToAdmin(page, SUPER);
  await page.goto(`${ADMIN_URL}/settings`);
  await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();
  await expect(page.getByLabel("Platform name")).not.toHaveValue("");
  await expect(page.getByRole("table")).toContainText("Terms of use");
  await expect(page.getByRole("table")).toContainText("In force");

  const scan = page.getByRole("group", { name: "Scan for Opportunities" });
  const minimum = scan.getByLabel("Minimum score to show");
  const before = await minimum.inputValue();
  await minimum.fill("101");
  await page.getByRole("button", { name: "Save weights" }).click();
  await expect(page.getByText(/Check "Minimum score to show"/)).toBeVisible();

  await minimum.fill(before === "25" ? "24" : "25");
  await page.getByRole("button", { name: "Save weights" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Scan for Opportunities" }).getByLabel("Minimum score to show"),
  ).toHaveValue(before === "25" ? "24" : "25");

  await page
    .getByRole("group", { name: "Scan for Opportunities" })
    .getByLabel("Minimum score to show")
    .fill(before);
  await page.getByRole("button", { name: "Save weights" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/d02-settings.png`,
      fullPage: true,
    });
});
