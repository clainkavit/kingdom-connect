import { serviceClient } from "./db.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function claimsOf(accessToken: string): Record<string, unknown> {
  const part = (accessToken.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export function sessionIdOf(accessToken: string): string {
  return claimsOf(accessToken).session_id as string;
}

/** The sign-in methods (the amr claim) of a token, such as "password", "otp" or "oauth". */
export function methodsOf(accessToken: string): string[] {
  const amr = claimsOf(accessToken).amr;
  if (!Array.isArray(amr)) return [];
  return amr
    .map((entry) => (entry as { method?: unknown } | null)?.method)
    .filter((method): method is string => typeof method === "string");
}

export type SignedIn = { userId: string; sessionId: string; methods: string[] };

/** The caller's verified user and session, or null when the token is missing or not valid. */
export async function requireUser(req: Request): Promise<SignedIn | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const { data } = await serviceClient.auth.getUser(token);
  if (!data.user) return null;
  return { userId: data.user.id, sessionId: sessionIdOf(token), methods: methodsOf(token) };
}

/** The role claim of a token the gateway has already verified (verify_jwt). */
export function roleOf(req: Request): string | null {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  try {
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4))).role ?? null;
  } catch {
    return null;
  }
}

/** The last x-forwarded-for hop, the one the platform's proxy added, as access.request_ip() reads it. */
export function clientIp(req: Request): string | null {
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",");
  const last = hops[hops.length - 1]?.trim();
  return last && /^[0-9a-fA-F.:]+$/.test(last) ? last : null;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** The HTTP status for each refusal the staff functions return. */
export const refusalStatus: Record<string, number> = {
  not_staff: 403,
  not_found: 404,
  unknown_member: 404,
  already_decided: 409,
  member_not_pending: 409,
  reason_required: 400,
  note_has_contact_details: 400,
  note_required: 400,
  not_rejected: 409,
  not_final: 409,
  final: 409,
  not_a_member: 403,
  too_many: 400,
  too_long: 400,
  invalid: 400,
};
