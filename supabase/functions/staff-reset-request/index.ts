import { sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, json } from "../_shared/http.ts";

/**
 * Admin-Forgot (R30): a staff member asks for a password reset. The answer is the same whether or not the email
 * belongs to a staff account. Every other active Super Administrator is told by email (Y2).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (email.includes("@")) {
    await sql`select private.request_staff_reset(${email}, ${clientIp(req)}::inet)`;
  }
  return json({ ok: true });
});
