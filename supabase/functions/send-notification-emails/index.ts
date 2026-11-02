import { accountById, platformName, sql } from "../_shared/db.ts";
import { json, roleOf } from "../_shared/http.ts";
import { sendEmail } from "../_shared/mail.ts";
import { copyFor, type OutboxRow, planDelivery } from "../_shared/outbox.ts";

const MAX_ATTEMPTS = 5;

type Claimed = OutboxRow & { id: string; member_id: string; attempts: number };

async function finish(id: string, status: string, error: string | null = null) {
  await sql`
    update private.email_outbox
    set status = ${status}, last_error = ${error},
        sent_at = case when ${status} = 'sent' then now() else sent_at end
    where id = ${id}`;
}

async function retryLater(row: Claimed, error: string) {
  if (row.attempts >= MAX_ATTEMPTS) return finish(row.id, "failed", error);
  await sql`
    update private.email_outbox
    set status = 'pending', last_error = ${error},
        next_attempt_at = now() + make_interval(mins => ${row.attempts * row.attempts})
    where id = ${row.id}`;
}

async function emailSwitchedOn(memberId: string, kind: string): Promise<boolean> {
  const category = copyFor(kind)?.category;
  const [row] = await sql`
    select email from public.notification_preferences
    where member_id = ${memberId} and category = ${category ?? ""}`;
  return row?.email ?? true;
}

Deno.serve(async (req) => {
  if (roleOf(req) !== "service_role") return json({ error: "forbidden" }, 403);

  const rows = (await sql`select * from private.claim_emails(50)`) as unknown as Claimed[];
  const name = await platformName();
  const counts = { sent: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const account = await accountById(row.member_id);
    if (!account) {
      await retryLater(row, "no account");
      counts.failed++;
      continue;
    }
    const plan = planDelivery(
      row,
      {
        language: account.language,
        emailSwitchedOn: await emailSwitchedOn(row.member_id, row.kind),
      },
      name,
    );
    if (plan.action === "skip") {
      await finish(row.id, "skipped");
      counts.skipped++;
      continue;
    }
    if (plan.action === "fail") {
      await finish(row.id, "failed", plan.reason);
      counts.failed++;
      continue;
    }
    try {
      await sendEmail(account.email, plan.email);
      await finish(row.id, "sent");
      counts.sent++;
    } catch (error) {
      await retryLater(row, String(error));
      counts.failed++;
    }
  }
  return json(counts);
});
