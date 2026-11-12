import { expect, test } from "@playwright/test";
import { addProfile, createMember, setSkills, signInAs } from "./helpers";

test("the dashboard suggests a member with shared skills and says why (O08, S08)", async ({
  page,
}) => {
  const stamp = Date.now();
  const skill = `kilnwork${stamp}`;
  const second = `glazing${stamp}`;
  const member = await createMember(`e2e_pymk_${stamp}`);
  const other = await createMember(`e2e_pymk_other_${stamp}`);
  await addProfile(member.id, `Pymk Member ${stamp}`);
  await addProfile(other.id, `Pymk Other ${stamp}`);
  await setSkills(member.id, [skill, second]);
  await setSkills(other.id, [skill, second]);

  await signInAs(page, `e2e_pymk_${stamp}`, member.email);
  await expect(
    page.getByRole("heading", { name: "People you may know", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`Pymk Other ${stamp}`)).toBeVisible();
  await expect(page.getByText(new RegExp(`Shared skills: .*${skill}`))).toBeVisible();
  await page.getByRole("link", { name: `Connect with Pymk Other ${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/profile/${other.id}$`));
});
