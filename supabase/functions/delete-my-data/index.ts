import { serviceClient, sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { requireVerifiedAccount } from "../_shared/session.ts";

const HUNDRED_YEARS = "876000h";
const MAY_DELETE = new Set(["approved", "pending", "rejected"]);

async function logUnfinished(
  memberId: string,
  step: string,
  detail: Record<string, string | string[]>,
) {
  await sql`select private.log_unfinished_deletion(${memberId}, ${step}, ${sql.json(detail)})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;
  if (!MAY_DELETE.has(account.status)) return json({ error: "not_allowed" }, 403);

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true) return json({ error: "not_confirmed" }, 400);

  const files = await sql<{ bucket: string; path: string }[]>`
    select bucket, path from private.member_file_paths(${account.id})`;

  const [row] = await sql`select private.delete_member_data(${account.id}) as result`;
  if (row?.result !== "ok") return json({ error: row?.result ?? "failed" }, 400);

  for (const bucket of new Set(files.map((f) => f.bucket))) {
    const paths = files.filter((f) => f.bucket === bucket).map((f) => f.path);
    const { error } = await serviceClient.storage.from(bucket).remove(paths);
    if (error) await logUnfinished(account.id, "files", { bucket, paths });
  }

  const { error } = await serviceClient.auth.admin.updateUserById(account.id, {
    email: `deleted-${account.id}@deleted.invalid`,
    phone: "",
    user_metadata: {},
    ban_duration: HUNDRED_YEARS,
  });
  if (error) await logUnfinished(account.id, "sign_in", { error: error.message });
  return json({ ok: true });
});
