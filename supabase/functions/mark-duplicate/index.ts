import { sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, isUuid, json, refusalStatus } from "../_shared/http.ts";
import { requireStaff } from "../_shared/staff.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staffId = await requireStaff(req);
  if (staffId instanceof Response) return staffId;

  const body = await req.json().catch(() => ({}));
  const requestId = body.requestId;
  if (!isUuid(requestId)) return json({ error: "not_found" }, 404);
  const username = typeof body.username === "string" ? body.username.slice(0, 40) : null;

  const [row] = await sql`
    select private.mark_duplicate(${staffId}, ${requestId}, ${username}, ${clientIp(req)}::inet) as result`;
  if (row?.result === "ok") return json({ ok: true });
  return json({ error: row?.result ?? "failed" }, refusalStatus[row?.result] ?? 400);
});
