import { platformName, serviceClient, sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, isUuid, json } from "../_shared/http.ts";
import { sendEmail } from "../_shared/mail.ts";
import { requireStaff } from "../_shared/staff.ts";
import {
  hashResetToken,
  newResetToken,
  RESET_LINK_HOURS,
  resetLink,
  resetLinkEmail,
} from "../_shared/staff-reset.ts";

const actions = ["send_link", "refuse", "unlock"];

/**
 * "Password resets and locked accounts" in Staff accounts (R30). A Super Administrator sends a reset link or
 * refuses a request, never their own, or ends a lockout on a staff account.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const staffId = await requireStaff(req);
  if (staffId instanceof Response) return staffId;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (!actions.includes(action) || !isUuid(body.id)) return json({ error: "invalid" }, 400);
  const ip = clientIp(req);

  if (action === "unlock") {
    const [row] =
      await sql`select private.unlock_staff(${body.id}, ${staffId}, ${ip}::inet) as result`;
    if (row?.result !== "ok") return json({ error: row?.result ?? "failed" }, 409);
    await serviceClient.auth.admin.updateUserById(body.id, { ban_duration: "none" });
    return json({ ok: true });
  }

  const token = action === "send_link" ? newResetToken() : null;
  const [row] = await sql`
    select result, email from private.decide_staff_reset(${body.id}, ${staffId},
      ${action === "send_link" ? "sent" : "refused"}, ${token ? await hashResetToken(token) : null},
      ${RESET_LINK_HOURS}, ${ip}::inet)`;
  if (row?.result !== "ok") return json({ error: row?.result ?? "failed" }, 409);
  if (token) {
    const adminUrl = Deno.env.get("ADMIN_URL") ?? "http://localhost:3000";
    await sendEmail(
      row.email,
      resetLinkEmail(await platformName(), resetLink(adminUrl, body.id, token)),
    );
  }
  return json({ ok: true });
});
