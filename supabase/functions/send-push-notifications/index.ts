import { accountById, platformName, sql } from "../_shared/db.ts";
import { json, roleOf } from "../_shared/http.ts";
import { categoryOfCode } from "../_shared/notifications.ts";
import { deadTokens, planPush, type PushMessage, sendToExpo } from "../_shared/push.ts";

const MAX_ATTEMPTS = 5;

type Claimed = {
  id: string;
  member_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
};

async function finish(id: string, status: string, error: string | null = null) {
  await sql`
    update private.push_outbox
    set status = ${status}, last_error = ${error},
        sent_at = case when ${status} = 'sent' then now() else sent_at end
    where id = ${id}`;
}

async function retryLater(row: Claimed, error: string) {
  if (row.attempts >= MAX_ATTEMPTS) return finish(row.id, "failed", error);
  await sql`
    update private.push_outbox
    set status = 'pending', last_error = ${error},
        next_attempt_at = now() + make_interval(mins => ${row.attempts * row.attempts})
    where id = ${row.id}`;
}

async function switchOn(memberId: string, category: string): Promise<boolean> {
  const [row] = await sql`
    select push from public.notification_preferences
    where member_id = ${memberId} and category = ${category}`;
  return row?.push ?? true;
}

Deno.serve(async (req) => {
  if (roleOf(req) !== "service_role") return json({ error: "forbidden" }, 403);

  const rows = (await sql`select * from private.claim_pushes(50)`) as unknown as Claimed[];
  const name = await platformName();
  const counts = { sent: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const account = await accountById(row.member_id);
    if (!account) {
      await finish(row.id, "skipped", "no account");
      counts.skipped++;
      continue;
    }
    let category: string;
    try {
      category = categoryOfCode(row.kind);
    } catch {
      await finish(row.id, "failed", `unknown kind ${row.kind}`);
      counts.failed++;
      continue;
    }
    const tokens = (
      await sql`
      select token from public.push_tokens where member_id = ${row.member_id}`
    ).map((t) => String(t.token));
    const plan = planPush(
      row,
      {
        language: account.language,
        masterOn: await switchOn(row.member_id, "all"),
        categoryOn: await switchOn(row.member_id, category),
        tokens,
      },
      name,
    );
    if (plan.action === "skip") {
      await finish(row.id, "skipped", plan.reason);
      counts.skipped++;
      continue;
    }
    if (plan.action === "fail") {
      await finish(row.id, "failed", plan.reason);
      counts.failed++;
      continue;
    }
    try {
      const tickets = await sendToExpo(plan.messages);
      for (const token of deadTokens(plan.messages as PushMessage[], tickets)) {
        await sql`delete from public.push_tokens where token = ${token}`;
      }
      await finish(row.id, "sent");
      counts.sent++;
    } catch (error) {
      await retryLater(row, String(error));
      counts.failed++;
    }
  }
  return json(counts);
});
