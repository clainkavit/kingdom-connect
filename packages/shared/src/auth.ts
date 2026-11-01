/** Sign-in flow shared by both apps: PRD section 6 (criteria 7 and 8), docs/screens.md S03 to S06. */

export type App = "member" | "admin";
export type Route = "login" | "verify" | "status" | "app" | "wrong_app";

type Claims = { otp_verified?: boolean; user_status?: string };

function claimsOf(accessToken: string): Claims {
  const part = accessToken.split(".")[1] ?? "";
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as Claims;
}

export function userStatusOf(accessToken: string): string | undefined {
  return claimsOf(accessToken).user_status;
}

/** The standard local Supabase address and public anon key, the same on every machine and in CI. */
export const LOCAL_SUPABASE = {
  url: "http://127.0.0.1:54321",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
} as const;

export const routePaths: Record<Route, string> = {
  login: "/login",
  verify: "/verify",
  status: "/status",
  app: "/",
  wrong_app: "/wrong-app",
};

export function routeFor(accessToken: string | null, app: App): Route {
  if (!accessToken) return "login";
  const claims = claimsOf(accessToken);
  if (!claims.otp_verified) return "verify";
  const status = claims.user_status;
  if (app === "admin") return status === "staff" ? "app" : "wrong_app";
  if (status === "approved") return "app";
  if (status === "pending" || status === "rejected") return "status";
  return "wrong_app";
}

export type Session = { access_token: string; refresh_token: string };

export type LoginResult =
  | { kind: "code_sent"; session: Session; resendAfterSeconds: number }
  | { kind: "invalid" }
  | { kind: "locked"; retryAfterSeconds: number }
  | { kind: "suspended" }
  | { kind: "network" };

export type VerifyResult =
  | { kind: "verified" }
  | { kind: "wrong_code"; attemptsLeft: number }
  | { kind: "too_many" }
  | { kind: "expired" }
  | { kind: "no_code" }
  | { kind: "network" };

export type ResendResult =
  | { kind: "sent"; resendAfterSeconds: number }
  | { kind: "too_soon"; retryAfterSeconds: number }
  | { kind: "network" };

type Options = { url: string; anonKey: string; fetch?: typeof fetch };

export function createLoginClient({ url, anonKey, fetch: fetchImpl = fetch }: Options) {
  async function call(name: string, body: object, accessToken?: string) {
    const headers: Record<string, string> = { apikey: anonKey, "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      const res = await fetchImpl(`${url}/functions/v1/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return {
    async logIn(
      credentials: { username: string; password: string } | { email: string; password: string },
    ): Promise<LoginResult> {
      const r = await call("login", credentials);
      if (!r) return { kind: "network" };
      if (r.session) {
        return {
          kind: "code_sent",
          session: r.session as Session,
          resendAfterSeconds: Number(r.resend_after_seconds ?? 60),
        };
      }
      if (r.error === "locked")
        return { kind: "locked", retryAfterSeconds: Number(r.retry_after_seconds) };
      if (r.error === "suspended") return { kind: "suspended" };
      return { kind: "invalid" };
    },

    async verifyCode(accessToken: string, code: string): Promise<VerifyResult> {
      const r = await call("verify-otp", { code }, accessToken);
      if (!r) return { kind: "network" };
      if (r.ok) return { kind: "verified" };
      if (r.error === "wrong_code")
        return { kind: "wrong_code", attemptsLeft: Number(r.attempts_left) };
      if (r.error === "too_many") return { kind: "too_many" };
      if (r.error === "expired") return { kind: "expired" };
      return { kind: "no_code" };
    },

    async resendCode(accessToken: string): Promise<ResendResult> {
      const r = await call("resend-otp", {}, accessToken);
      if (!r) return { kind: "network" };
      if (r.error === "too_soon")
        return { kind: "too_soon", retryAfterSeconds: Number(r.retry_after_seconds) };
      return { kind: "sent", resendAfterSeconds: Number(r.resend_after_seconds ?? 60) };
    },
  };
}

export type LoginClient = ReturnType<typeof createLoginClient>;
