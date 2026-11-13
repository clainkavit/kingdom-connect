import { expect, test } from "@playwright/test";
import { addProfile, createMember, placeIn, signInAs } from "./helpers";

test("a Member in Mwanza sees members in Mwanza first, under Near you (R25)", async ({ page }) => {
  const stamp = Date.now();
  const profession = `Nearwork${stamp}`;
  const people = [
    ["reader", `Near Reader ${stamp}`, "Nyamagana"],
    ["neighbour", `Ilemela Neighbour ${stamp}`, "Ilemela"],
    ["far", `Dodoma Member ${stamp}`, "Kondoa"],
  ] as const;
  const ids: Record<string, { id: string; email: string }> = {};
  for (const [key, name, district] of people) {
    const m = await createMember(`e2e_near_${key}_${stamp}`);
    await addProfile(m.id, name);
    await placeIn(m.id, district, profession);
    ids[key] = m;
  }

  await signInAs(page, `e2e_near_reader_${stamp}`, ids.reader!.email);
  await page.goto("/people");
  await page.getByRole("textbox", { name: "Profession", exact: true }).fill(profession);
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const near = page.getByRole("heading", { name: "Near you in Mwanza" });
  const more = page.getByRole("heading", { name: "More members" });
  await expect(near).toBeVisible();
  await expect(more).toBeVisible();
  await expect(near.locator("..")).toContainText(`Ilemela Neighbour ${stamp}`);
  await expect(near.locator("..")).not.toContainText(`Dodoma Member ${stamp}`);
  await expect(more.locator("..")).toContainText(`Dodoma Member ${stamp}`);
});
