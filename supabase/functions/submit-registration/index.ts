import { requireApplicant } from "../_shared/applicant.ts";
import { serviceClient, sql } from "../_shared/db.ts";
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
  if (row?.result === "ok") {
    await keepPhotosWithApplication(applicant.userId);
    return json({ ok: true });
  }
  if (row?.result === "incomplete") return json({ error: "incomplete", step: 1 }, 400);
  return json({ error: row?.result ?? "failed" }, 400);
});

/** Copies the photos to a path of their own, so replacing a photo later never changes an earlier application. */
async function keepPhotosWithApplication(memberId: string) {
  const documents = await sql`
    select d.id, d.request_id, d.kind, d.storage_path from public.verification_documents d
    join public.verification_requests r on r.id = d.request_id
    where r.member_id = ${memberId} and r.status = 'pending' and r.level = 1`;
  for (const doc of documents) {
    const kept = `${memberId}/requests/${doc.request_id}/${doc.kind}`;
    const { error } = await serviceClient.storage
      .from("identity-documents")
      .copy(doc.storage_path, kept);
    if (!error)
      await sql`update public.verification_documents set storage_path = ${kept} where id = ${doc.id}`;
  }
}
