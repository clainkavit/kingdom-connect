import { requireApplicant } from "../_shared/applicant.ts";
import { sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { firstIncompleteStep } from "../_shared/registration-rules.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const applicant = await requireApplicant(req);
  if (applicant instanceof Response) return applicant;
  if (applicant.submitted) return json({ error: "already_submitted" }, 409);

  const step = firstIncompleteStep(applicant.draft);
  if (step !== null) return json({ error: "incomplete", step }, 400);

  const [row] = await sql`select private.submit_registration(${applicant.userId}) as result`;
  if (row?.result === "ok") return json({ ok: true });
  if (row?.result === "incomplete") return json({ error: "incomplete", step: 1 }, 400);
  return json({ error: row?.result ?? "failed" }, 400);
});
