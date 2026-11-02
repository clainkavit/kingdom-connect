import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const TEST_PASSWORD = "kingdom-test-only";
const MAILPIT = "http://localhost:54324";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

type MailpitMessage = { Created: string; Subject: string; Snippet: string };

export async function nextEmail(to: string, after: Date, subject: RegExp): Promise<MailpitMessage> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
        const { messages } = (await res.json()) as { messages: MailpitMessage[] };
        found = messages.find((m) => new Date(m.Created) >= after && subject.test(m.Subject));
        return Boolean(found);
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

export async function nextCode(to: string, after: Date): Promise<string> {
  const email = await nextEmail(to, after, /code|msimbo/i);
  return email.Snippet.match(/\b(\d{6})\b/)![1]!;
}

export async function createMember(username: string): Promise<{ email: string; id: string }> {
  const email = `${username.replace(/_/g, ".")}@example.test`;
  const headers = {
    apikey: LOCAL_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const user = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  const res = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/members`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: user.id, username, status: "approved" }),
  });
  expect(res.ok).toBe(true);
  const contact = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/member_private`, {
    method: "POST",
    headers,
    body: JSON.stringify({ member_id: user.id, email, phone: "+255700000000" }),
  });
  expect(contact.ok).toBe(true);
  return { email, id: user.id };
}

export async function logIn(
  page: Page,
  field: "Username" | "Email" | "Jina la mtumiaji",
  value: string,
  password = TEST_PASSWORD,
) {
  await page.getByLabel(field, { exact: true }).fill(value);
  await page.getByLabel(/^(Password|Nenosiri)$/).fill(password);
  await page.getByRole("button", { name: /^(Log in|Ingia)$/ }).click();
}

export async function enterCode(page: Page, code: string) {
  await page.getByLabel("Email code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

const db = postgres(
  process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  {
    max: 1,
  },
);

export async function notify(memberId: string, kind: string, payload: Record<string, unknown>) {
  await db`select private.notify(${memberId}, ${kind}, ${db.json(payload as never)})`;
}

export async function sendQueuedEmails() {
  const res = await fetch(`${LOCAL_SUPABASE.url}/functions/v1/send-notification-emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(res.ok).toBe(true);
}

export async function emailsTo(to: string, after: Date): Promise<{ Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const { messages } = (await res.json()) as { messages: (MailpitMessage & { Subject: string })[] };
  return messages.filter((m) => new Date(m.Created) >= after);
}

export async function signInAs(page: Page, username: string, email: string) {
  await page.goto("/login");
  const sentAfter = new Date();
  await logIn(page, "Username", username);
  await enterCode(page, await nextCode(email, sentAfter));
  await expect(page.getByRole("navigation", { name: /Member menu|Member tabs/ })).toBeVisible();
}
