import { sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { requireVerifiedAccount } from "../_shared/session.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;

  const [row] = await sql`select private.application_status(${account.id}) as status`;
  if (!row?.status) return json({ error: "not_an_applicant" }, 403);
  return json(row.status);
});
