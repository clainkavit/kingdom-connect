import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { serviceClient, sql } from "../_shared/db.ts";
import { clientIp, corsHeaders, json } from "../_shared/http.ts";
import { requireStaff } from "../_shared/staff.ts";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const ANSWER_AFTER_MS = 1500;

function looksLike(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50;
  return String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function file(req: Request, filedBy: string | null): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { username, newEmail, lastDigits, photo, mime } = body;
  if (
    [username, newEmail, lastDigits, photo, mime].some((v) => typeof v !== "string") ||
    !PHOTO_TYPES.has(mime)
  )
    return json({ error: "invalid" }, 400);
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(photo);
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES)
    return json({ error: "photo_too_large" }, 400);
  if (!looksLike(mime, bytes)) return json({ error: "invalid" }, 400);

  const [filed] = await sql`
    select result, recovery_id, member_id
    from private.file_email_recovery(${username}, ${newEmail}, ${lastDigits}, ${filedBy},
      ${clientIp(req)}::inet)`;
  if (filed?.result === "invalid") return json({ error: "invalid" }, 400);
  if (!filed?.recovery_id) return json({ ok: true });

  const path = `${filed.member_id}/recovery-${filed.recovery_id}`;
  const { error } = await serviceClient.storage
    .from("identity-documents")
    .upload(path, bytes, { contentType: mime });
  if (error) {
    await sql`select private.drop_recovery(${filed.recovery_id})`;
    return json({ error: "failed" }, 500);
  }
  await sql`select private.attach_recovery_photo(${filed.recovery_id}, ${path})`;
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES)
    return json({ error: "photo_too_large" }, 413);

  let filedBy: string | null = null;
  if (req.headers.get("Authorization")?.startsWith("Bearer ")) {
    const staff = await requireStaff(req);
    if (staff instanceof Response) return staff;
    filedBy = staff;
  }

  const answerAt = Date.now() + ANSWER_AFTER_MS;
  const response = await file(req, filedBy);
  const wait = answerAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return response;
});
