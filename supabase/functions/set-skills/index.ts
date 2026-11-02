import { sql } from "../_shared/db.ts";
import { corsHeaders, json, refusalStatus } from "../_shared/http.ts";
import { requireVerifiedAccount } from "../_shared/session.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const account = await requireVerifiedAccount(req);
  if (account instanceof Response) return account;

  const body = await req.json().catch(() => ({}));
  const skills = Array.isArray(body.skills)
    ? body.skills.filter((s: unknown): s is string => typeof s === "string").slice(0, 50)
    : [];

  const [row] = await sql`select private.set_skills(${account.id}, ${skills}::text[]) as result`;
  if (row?.result === "ok") return json({ ok: true });
  return json({ error: row?.result ?? "failed" }, refusalStatus[row?.result] ?? 400);
});
