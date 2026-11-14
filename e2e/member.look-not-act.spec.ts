import { expect, test } from "@playwright/test";
import {
  addProfile,
  createApplication,
  createMember,
  enterCode,
  logIn,
  makePoster,
  nextCode,
  publishOpportunity,
} from "./helpers";

test("an applicant waiting for review looks around but cannot act (R27, PRD section 3)", async ({
  page,
}) => {
  const stamp = Date.now();
  const poster = await createMember(`e2e_look_poster_${stamp}`);
  await addProfile(poster.id, "Look Poster");
  await makePoster(poster.id, `Look Traders ${stamp}`);
  const title = `Shop bookkeeper ${stamp}`;
  const id = await publishOpportunity(poster.id, title);

  const username = `e2e_look_applicant_${stamp}`;
  const applicant = await createApplication(username, `LK${stamp}`);
  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, "Username", username);
  await enterCode(page, await nextCode(applicant.email, sentAfter));
  await expect(page.getByText("Under review")).toBeVisible();

  await page.getByRole("link", { name: "Look around while you wait" }).click();
  await expect(page.getByText("Not verified yet")).toBeVisible();
  await expect(page.getByText("Your identity is being checked")).toBeVisible();

  await page.goto(`/opportunities/${id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Verify your identity to apply")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();

  await page.goto("/people");
  await expect(page.getByText("This opens once you are verified")).toBeVisible();
  await expect(page.getByText("Look Poster")).toHaveCount(0);
});
