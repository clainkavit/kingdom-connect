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
  const payload = JSON.parse(
    atob(accessToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
  );
  return payload.session_id as string;
}

export function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
