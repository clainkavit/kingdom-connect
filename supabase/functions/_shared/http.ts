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

export function sessionIdOf(accessToken: string): string {
  const part = (accessToken.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(atob(padded)).session_id as string;
}

export type SignedIn = { userId: string; sessionId: string };

/** The caller's verified user and session, or null when the token is missing or not valid. */
export async function requireUser(req: Request): Promise<SignedIn | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const { data } = await serviceClient.auth.getUser(token);
  if (!data.user) return null;
  return { userId: data.user.id, sessionId: sessionIdOf(token) };
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
