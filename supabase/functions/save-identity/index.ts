import { requireApplicant } from "../_shared/applicant.ts";
import { sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { idNumberProblem, idTypes, type IdType } from "../_shared/registration-rules.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const applicant = await requireApplicant(req);
  if (applicant instanceof Response) return applicant;
  if (applicant.submitted) return json({ error: "already_submitted" }, 409);

  const body = await req.json().catch(() => ({}));
  const idType = body.idType as IdType;
  const idNumber = String(body.idNumber ?? "");
  const expires =
    typeof body.idExpiresOn === "string" && body.idExpiresOn ? body.idExpiresOn : null;
  if (!idTypes.includes(idType)) return json({ error: "invalid", problem: "required" }, 400);
  const problem = idNumberProblem(idType, idNumber);
  if (problem) return json({ error: "invalid", problem }, 400);

  const [row] = await sql`
    select private.set_identity(${applicant.userId}, ${idType}, ${idNumber}, ${expires}::date) as result`;
  if (row?.result === "duplicate") return json({ error: "duplicate" }, 409);
  if (row?.result === "too_many") return json({ error: "too_many" }, 429);
  if (row?.result === "not_editable") return json({ error: "already_submitted" }, 409);
  if (row?.result !== "ok") return json({ error: "invalid", problem: "id_number" }, 400);
  return json({ ok: true });
});
