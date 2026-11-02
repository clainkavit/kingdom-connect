import { compareVersions, LOCAL_SUPABASE, reacceptKinds } from "@kingdom-connect/shared";
import { LOCAL_SERVICE_ROLE_KEY } from "@kingdom-connect/shared/src/local-dev";

export { LOCAL_SERVICE_ROLE_KEY };
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const TEST_PASSWORD = "kingdom-test-only";
const MAILPIT = "http://localhost:54324";

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

export async function createMember(
  username: string,
  { acceptTexts = true } = {},
): Promise<{ email: string; id: string }> {
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
  if (acceptTexts) await acceptCurrentTexts([user.id]);
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

const serviceHeaders = {
  apikey: LOCAL_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/** Records that test members accepted the current terms and privacy notice, so S07 stays out of the way. */
export async function acceptCurrentTexts(memberIds: string[]) {
  const texts: { id: string; kind: string; version: string }[] = await fetch(
    `${LOCAL_SUPABASE.url}/rest/v1/legal_texts?kind=in.(${reacceptKinds.join(",")})&effective_at=lte.${new Date().toISOString()}&select=id,kind,version`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const current = reacceptKinds
    .map(
      (kind) =>
        texts
          .filter((t) => t.kind === kind)
          .sort((a, b) => compareVersions(a.version, b.version))[0],
    )
    .filter((t): t is { id: string; kind: string; version: string } => Boolean(t));
  for (const memberId of memberIds) {
    for (const text of current) {
      const res = await fetch(`${LOCAL_SUPABASE.url}/rest/v1/legal_acceptances`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          member_id: memberId,
          legal_text_id: text.id,
          context_type: "reaccept",
        }),
      });
      if (!res.ok && res.status !== 409)
        throw new Error(`accepting ${text.kind} failed: ${res.status} ${await res.text()}`);
    }
  }
}
