import { expect, test } from "@playwright/test";
import { addProfile, connect, createMember, signInAs, startThread } from "./helpers";

test("a Member reports a conversation and a profile, and sees only the reference and outcome (SAFE-1, S42, S43)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const reporter = await createMember(`e2e_reporter_${stamp}`);
  const scammer = await createMember(`e2e_scammer_${stamp}`);
  await addProfile(reporter.id, "Reporting Member");
  await addProfile(scammer.id, `Asking For Money ${stamp}`);
  await connect(reporter.id, scammer.id);
  const thread = await startThread(reporter.id, scammer.id, scammer.id, "Send a fee first");

  await signInAs(page, `e2e_reporter_${stamp}`, reporter.email);
  await page.goto(`/messages/${thread}`);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: /Why are you reporting\?/ }).click();
  await page.getByRole("option", { name: "Asked for money" }).click();
  await page
    .getByLabel("Anything else we should know (optional)")
    .fill("They want a fee before an interview.");
  await page.getByRole("button", { name: "Send report" }).click();
  const reference = page.getByText(/^Your reference: KC-\d{4}-\d{6,}$/);
  await expect(reference).toBeVisible();
  const threadRef = (await reference.textContent())!.replace("Your reference: ", "");

  await page.goto(`/messages/${thread}`);
  await expect(
    page.getByText("This conversation was reported. Administrators can read it."),
  ).toBeVisible();

  await page.goto(`/profile/${scammer.id}`);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: /Why are you reporting\?/ }).click();
  await page.getByRole("option", { name: "Impersonation" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thank you. We received your report.")).toBeVisible();
  const profileRef = (await page.getByText(/^Your reference: /).textContent())!.replace(
    "Your reference: ",
    "",
  );

  await page.goto(`/profile/${scammer.id}`);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.getByRole("button", { name: /Why are you reporting\?/ }).click();
  await page.getByRole("option", { name: "Spam" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("You already reported this. It is being reviewed.")).toBeVisible();
  await expect(page.getByText(`Your reference: ${profileRef}`)).toBeVisible();

  await page.goto("/reports");
  await expect(page.getByText(threadRef)).toBeVisible();
  await expect(page.getByText(profileRef)).toBeVisible();
  await expect(page.getByText("Being reviewed")).toHaveCount(2);
  await expect(page.getByText("They want a fee before an interview.")).toHaveCount(0);
});
