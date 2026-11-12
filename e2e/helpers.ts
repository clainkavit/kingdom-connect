import { compareVersions, LOCAL_SUPABASE, reacceptKinds } from "@kingdom-connect/shared";
import { LOCAL_SERVICE_ROLE_KEY } from "@kingdom-connect/shared/src/local-dev";

export { LOCAL_SERVICE_ROLE_KEY };
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const TEST_PASSWORD = "kingdom-test-only";
const MAILPIT = "http://localhost:54324";

type MailpitMessage = { ID: string; Created: string; Subject: string; Snippet: string };

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

/** The first link in an email, read from its HTML. */
export async function linkInEmail(to: string, after: Date, subject: RegExp): Promise<string> {
  const email = await nextEmail(to, after, subject);
  const res = await fetch(`${MAILPIT}/api/v1/message/${email.ID}`);
  const { HTML } = (await res.json()) as { HTML: string };
  return HTML.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
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

/** Sends every queued email, batch after batch, as the per-minute job would over time. */
export async function sendQueuedEmails() {
  for (let batch = 0; batch < 20; batch++) {
    const res = await fetch(`${LOCAL_SUPABASE.url}/functions/v1/send-notification-emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.ok).toBe(true);
    const counts = (await res.json()) as { sent: number; skipped: number; failed: number };
    if (counts.sent + counts.skipped + counts.failed === 0) return;
  }
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

/** A fresh Applicant with a submitted application (ID saved, both photo files recorded), ready for the queue. */
export async function createApplication(username: string, idNumber: string) {
  const { id, email } = await createMember(username, { acceptTexts: false });
  await db`update public.members set status = 'pending' where id = ${id}`;
  await db`select private.set_identity(${id}, 'passport', ${idNumber})`;
  await db`insert into storage.objects (bucket_id, name) values
    ('identity-documents', ${`${id}/face`}), ('identity-documents', ${`${id}/id`})`;
  const [place] = await db`select id, region_id from public.districts limit 1`;
  const draft = {
    fullName: "Queue Applicant",
    category: "other",
    address: "Plot 9, Test Street",
    regionId: place!.region_id,
    districtId: place!.id,
    categoryDetails: { description: "Tailor" },
    idType: "passport",
    identitySaved: true,
    facePhoto: true,
    idPhoto: true,
    acceptTerms: true,
    acceptPrivacy: true,
  };
  await db`insert into public.registration_drafts (member_id, step, data)
    values (${id}, 6, ${db.json(draft)})`;
  const [result] = await db`select private.submit_registration(${id}) as result`;
  expect(result!.result).toBe("ok");
  return { id, email };
}

export async function auditActions(targetId: string): Promise<string[]> {
  const rows =
    await db`select action from private.audit_log where target_id = ${targetId} order by created_at`;
  return rows.map((r) => r.action as string);
}

export async function notificationKinds(memberId: string): Promise<string[]> {
  const rows =
    await db`select kind from public.notifications where member_id = ${memberId} order by created_at`;
  return rows.map((r) => r.kind as string);
}

export const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:3000";

export async function signInToAdmin(
  page: Page,
  email = "test.admin@example.test",
  password?: string,
) {
  await page.goto(`${ADMIN_URL}/login`);
  const sentAfter = new Date();
  await logIn(page, "Email", email, password);
  await enterCode(page, await nextCode(email, sentAfter));
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
}

/** Opens one Applicant's application from the verification queue, as a signed-in Administrator. */
export async function openApplication(page: Page, username: string) {
  await page.goto(`${ADMIN_URL}/verification`);
  await page.getByRole("link", { name: `@${username} ·` }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
}

export async function setApplicationCap(cap: number | null) {
  await db`update public.platform_settings set value = ${db.json(cap as never)} where key = 'daily_application_cap'`;
}

export async function signUpsToday(): Promise<number> {
  const [row] = await db`select private.sign_ups_today() as count`;
  return Number(row!.count);
}

export async function addProfile(memberId: string, fullName: string) {
  await db`insert into public.profiles (member_id, full_name) values (${memberId}, ${fullName})`;
}

export async function connect(a: string, b: string) {
  const [first, second] = [a, b].sort();
  await db`insert into public.connections (member_a, member_b) values (${first!}, ${second!})`;
}

export async function addSynonym(variant: string, skill: string) {
  await db`insert into public.skills (name) values (${skill}) on conflict (name) do nothing`;
  await db`insert into public.skill_synonyms (from_name, skill_id)
    select ${variant}, id from public.skills where name = ${skill}
    on conflict (from_name) do nothing`;
}

export async function setSkills(memberId: string, skills: string[]) {
  const [row] = await db`select private.set_skills(${memberId}, ${skills}::text[]) as result`;
  expect(row!.result).toBe("ok");
}

export async function hideProfile(memberId: string) {
  await db`update public.profiles set hidden_from_directory = true where member_id = ${memberId}`;
}

export async function block(blocker: string, blocked: string) {
  await db`insert into public.blocks (blocker_id, blocked_id) values (${blocker}, ${blocked})`;
}

export async function startThread(a: string, b: string, firstMessageFrom: string, body: string) {
  const [first, second] = [a, b].sort();
  const [thread] = await db`insert into public.message_threads (member_a, member_b)
    values (${first!}, ${second!}) returning id`;
  await db`insert into public.messages (thread_id, sender_id, body)
    values (${thread!.id}, ${firstMessageFrom}, ${body})`;
  return thread!.id as string;
}

export async function fileThreadReport(reporter: string, thread: string, subject: string) {
  const [report] =
    await db`insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, note)
    values (${reporter}, 'thread', ${thread}, ${subject}, 'asked_for_money', 'Wants a fee first')
    returning id, reference_no`;
  await db`update public.message_threads set status = 'reported', reported_at = now() where id = ${thread}`;
  return { id: report!.id as string, reference: report!.reference_no as string };
}

export async function giveSession(memberId: string) {
  await db`insert into auth.sessions (id, user_id) values (gen_random_uuid(), ${memberId})`;
}

export async function memberState(memberId: string) {
  const [row] = await db`select m.status,
      (select count(*)::int from auth.sessions s where s.user_id = m.id) as sessions
    from public.members m where m.id = ${memberId}`;
  return row as unknown as { status: string; sessions: number };
}

export async function reportStatus(reportId: string) {
  const [row] = await db`select status from public.reports where id = ${reportId}`;
  return row!.status as string;
}

export async function addAuditEntry(action: string, before: object, after: object) {
  await db`insert into private.audit_log (action, target_type, before, after)
    values (${action}, 'e2e', ${db.json(before as never)}, ${db.json(after as never)})`;
}

export async function requestConnection(from: string, to: string, note: string) {
  await db`insert into public.connection_requests (requester_id, receiver_id, note)
    values (${from}, ${to}, ${note})`;
}

export async function signInEmail(memberId: string) {
  const [row] = await db`select email from auth.users where id = ${memberId}`;
  return row!.email as string;
}

export async function profileCount(memberId: string) {
  const [row] =
    await db`select count(*)::int as n from public.profiles where member_id = ${memberId}`;
  return row!.n as number;
}

/** Moves approved email recoveries past their 48 hours and applies them, as the scheduled job does. */
export async function applyDueRecoveries() {
  await db`update public.email_recoveries set takes_effect_at = now() - interval '1 minute'
    where status = 'approved'`;
  const [row] = await db`select private.apply_due_email_recoveries() as applied`;
  return Number(row!.applied);
}

/** Records a duplicate ID attempt for a member and runs the security check, as the 5-minute job does. */
export async function raiseDuplicateIdAlert(memberId: string) {
  await db`insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
    values (${memberId}, 'registration.duplicate_id', 'members', ${memberId}, '{"id_type": "nida"}')`;
  await db`select private.check_security_alerts()`;
}

export async function verifyBusiness(memberId: string, name: string, licenceDays = 365) {
  const [business] =
    await db`insert into public.businesses (member_id, name, sector_id, size, level, status)
    select ${memberId}, ${name}, id, 'small', 2, 'approved' from public.sectors order by name_en limit 1
    returning id`;
  await db`insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on)
    values (${business!.id}, 'BRELA-E2E', '123-456-789', 'LIC-E2E', current_date + ${licenceDays}::int)`;
  await db`insert into public.verification_requests (member_id, level, status, business_id, decided_at)
    values (${memberId}, 2, 'approved', ${business!.id}, now())`;
}

export async function pendingBusiness(memberId: string, name: string) {
  await db`insert into public.businesses (member_id, name, sector_id, size, status)
    select ${memberId}, ${name}, id, 'small', 'pending' from public.sectors order by name_en limit 1`;
}

/** Makes a member an Opportunity Poster: a verified business at Level 3 (B02), as O01's tests need. */
export async function makePoster(memberId: string, businessName: string) {
  await verifyBusiness(memberId, businessName);
  await db`update public.businesses set level = 3 where member_id = ${memberId}`;
  await db`insert into public.verification_requests (member_id, level, status, business_id, decided_at)
    select ${memberId}, 3, 'approved', id, now() from public.businesses where member_id = ${memberId}`;
}

/** The status of an opportunity found by its title, and whether staff posted it. */
export async function opportunityByTitle(title: string) {
  const [row] = await db`select status, poster_staff_id is not null as by_staff
    from public.opportunities where title = ${title}`;
  return row as { status: string; by_staff: boolean } | undefined;
}

/**
 * A new Administrator account for one test. Sign-in codes are limited per account per hour, so tests
 * that sign in to the admin app often should not all share the seeded Test Administrator.
 */
export async function createStaff(name: string): Promise<string> {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.test`;
  const user = await fetch(`${LOCAL_SUPABASE.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  await db`insert into public.staff (id, full_name, role) values (${user.id}, ${name}, 'admin')`;
  return email;
}

/** A published, open post by a member, as if it had passed review (O02 browsing tests). */
export async function publishOpportunity(posterId: string, title: string) {
  const [row] = await db`insert into public.opportunities
      (poster_member_id, type, title, role, employment_type, remote, sector_id, description, closing_at,
       no_fee_declared, status, published_at)
    select ${posterId}, 'job', ${title}, 'Accountant', 'full_time', true, id,
           ${"Keep the books for a growing trading business, prepare monthly reports and work with the tax office."},
           current_date + 30, true, 'published', now()
    from public.sectors order by name_en limit 1
    returning id`;
  return row!.id as string;
}

/** Hides a post as a report does while staff review it. */
export async function hideOpportunity(id: string) {
  await db`update public.opportunities set status = 'hidden' where id = ${id}`;
}
