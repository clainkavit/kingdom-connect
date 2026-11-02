import { sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, json, refusalStatus } from "../_shared/http.ts";
import { requireVerifiedAccount } from "../_shared/session.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;

  const [row] = await sql`
    select private.start_resubmission(${account.id}, ${clientIp(req)}::inet) as result`;
  if (row?.result === "ok") return json({ ok: true });
  return json({ error: row?.result ?? "failed" }, refusalStatus[row?.result] ?? 400);
});
