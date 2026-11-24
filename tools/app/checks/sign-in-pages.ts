import { expect } from "../check";
import { enterCode, logIn } from "../../../e2e/helpers";
import { defineCheck } from "../check";

export default defineCheck(async ({ guest, step, emailCode, note }) => {
  const phone = await guest("member");
  await phone.goto("/welcome");
  await step(phone, "member welcome, phone");
  await phone.goto("/sign-up");
  await step(phone, "member sign up, phone", { full: true });
  await phone.goto("/phone-sign-in");
  await step(phone, "member phone sign in, phone");
  await phone.goto("/login");
  await step(phone, "member log in, phone");

  const sentAfter = new Date();
  await logIn(phone, "Username", "test_level1");
  await expect(phone.getByLabel("Email code")).toBeVisible();
  await step(phone, "member email code, phone");
  await enterCode(phone, await emailCode("test.level1@example.test", sentAfter));
  await expect(phone.getByRole("navigation", { name: /Member menu|Member tabs/ })).toBeVisible();
  await step(phone, "member home after sign in, phone");

  const computer = await guest("member", { device: "desktop" });
  await computer.goto("/welcome");
  await step(computer, "member welcome, computer");
  await computer.goto("/sign-up");
  await step(computer, "member sign up, computer");
  await computer.goto("/login");
  await step(computer, "member log in, computer");

  const admin = await guest("admin");
  await admin.goto("/login");
  await step(admin, "admin log in, computer");
  const adminPhone = await guest("admin", { device: "phone" });
  await adminPhone.goto("/login");
  await step(adminPhone, "admin log in, phone");

  note("Signed in as test_level1 through the real form and the Mailpit email code.");
});
