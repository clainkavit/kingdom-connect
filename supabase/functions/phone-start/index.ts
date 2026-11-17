import { anonClient, serviceClient, sql } from "../_shared/db.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { CODE_MINUTES, CODES_PER_HOUR, hashCode, type Language } from "../_shared/login-rules.ts";
import { normalizePhone } from "../_shared/registration-rules.ts";
import { sendPhoneCode } from "../_shared/sms.ts";

/**
 * S04b step 1: sends a 6-digit SMS code to a +255 number. The answer is the same whether or not the number
 * has an account. A number one member uses signs in to that member's account; a number two members share
 * gets no code, since it cannot say whose account it opens.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  if (!phone) return json({ error: "not_tanzanian" }, 400);

  const owners = await sql`
    select p.member_id as id, coalesce(p.language, 'en') as language
    from public.member_private p join public.members m on m.id = p.member_id
    where p.phone = ${phone} limit 2`;
  if (owners.length > 1) return json({ ok: true });
  const owner = owners[0] as { id: string; language: Language } | undefined;

  if (owner) {
    const [holder] = await sql`select id from auth.users where phone = ${phone.slice(1)}`;
    if (!holder) {
      const { error } = await serviceClient.auth.admin.updateUserById(owner.id, {
        phone: phone.slice(1),
        phone_confirm: true,
      });
      if (error) return json({ error: "not_sent" }, 500);
    }
  }

  const { error } = await anonClient().auth.signInWithOtp({ phone });
  if (error)
    return json(
      { error: error.status === 429 ? "wait" : "not_sent" },
      error.status === 429 ? 429 : 400,
    );

  const [pending] =
    await sql`delete from private.sms_pending where phone = ${phone} returning code`;
  if (!pending) return json({ error: "not_sent" }, 500);
  const code = pending.code as string;
  const [row] = await sql`
    select private.issue_phone_code(${phone}, ${await hashCode(code, phone, Deno.env.get("OTP_SECRET")!)},
      ${CODE_MINUTES}, ${CODES_PER_HOUR}) as issued`;
  if (!row?.issued) return json({ error: "too_many_codes" }, 429);

  await sendPhoneCode(phone, owner?.language ?? "en", code);
  return json({ ok: true });
});
