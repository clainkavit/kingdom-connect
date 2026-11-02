import { sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, isUuid, json } from "../_shared/http.ts";
import { requireStaff } from "../_shared/staff.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staffId = await requireStaff(req);
  if (staffId instanceof Response) return staffId;

  const body = await req.json().catch(() => ({}));
  const memberId = body.memberId;
  if (!isUuid(memberId)) return json({ error: "not_found" }, 404);

  const [row] = await sql`
    select private.reveal_id_number(${staffId}, ${memberId}, ${clientIp(req)}::inet) as number`;
  if (!row?.number) return json({ error: "not_found" }, 404);
  return json({ idNumber: row.number });
});
