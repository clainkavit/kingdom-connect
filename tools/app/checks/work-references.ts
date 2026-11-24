import type { Page } from "@playwright/test";
import { expect } from "../check";
import { defineCheck } from "../check";

const scores = [
  "Did what they promised, on time",
  "Quality of the work",
  "Communication",
  "Honesty and respect",
];

export default defineCheck(async ({ as, step, scenario, note }) => {
  const made = await scenario("worked-together");
  const { posterName, workerName, responsesPage, workerProfile } = made as unknown as Record<
    string,
    string
  >;

  async function rate(page: Page, other: string, comment: string, who: string) {
    await page.goto("/work");
    await step(page, `${who} work list`);
    await page.getByRole("link", { name: "Rate the work" }).click();
    await expect(
      page.getByRole("heading", { name: `How was working with ${other}?` }),
    ).toBeVisible();
    for (const q of scores) await page.getByRole("radiogroup", { name: q }).getByLabel("5").click();
    await page
      .getByRole("radiogroup", { name: `Would you work with ${other} again?` })
      .getByLabel("Yes")
      .click();
    await page.getByLabel("A few words for their profile (optional)").fill(comment);
    await step(page, `${who} rating filled in`, { full: true });
    await page.getByRole("button", { name: "Send rating" }).click();
    await expect(page.getByText("Rating sent. It cannot be changed.")).toBeVisible();
    await step(page, `${who} rating sent`);
  }

  const poster = await as("wt-poster");
  await poster.goto(responsesPage!);
  await step(poster, "poster responses");
  await poster.getByRole("button", { name: "Mark as hired" }).click();
  await step(poster, "poster confirms hired");
  await poster.getByRole("button", { name: "Mark as hired" }).first().click();
  await expect(poster.getByText(`Hired · waiting for ${workerName}`)).toBeVisible();
  await step(poster, "poster waiting for worker");

  const worker = await as("wt-worker");
  await worker.goto("/profile");
  await step(worker, "worker profile before", { full: true });
  await worker.goto("/work");
  await step(worker, "worker asked to confirm");
  await worker.getByRole("button", { name: "Yes, I did this work" }).click();
  await rate(worker, posterName!, "Clear brief and paid on time.", "worker");

  await poster.goto(workerProfile!);
  await expect(poster.getByRole("heading", { name: "Ideas", exact: true })).toBeVisible();
  await expect(poster.getByRole("heading", { name: "Work references" })).toHaveCount(0);
  await step(poster, "worker profile hidden until both rate", { full: true });
  await rate(poster, workerName!, "Every uniform was ready a day early.", "poster");

  await poster.goto(workerProfile!);
  const references = poster.getByRole("heading", { name: "Work references" });
  await expect(references).toBeVisible();
  await references.scrollIntoViewIfNeeded();
  await step(poster, "worker profile with references");
  await poster.mouse.move(195, 420);
  await poster.mouse.wheel(0, 500);
  await step(poster, "worker references comments");

  note(
    `Poster ${posterName} hired ${workerName}; the worker confirmed; both rated. References show from the third rating.`,
  );
});
