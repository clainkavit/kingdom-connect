import type { FieldProblem, IdType, SignUpInput } from "./registration-rules";
import type { Language } from "./strings";

/** Sign-in flow shared by both apps: PRD section 6 (criteria 7 and 8), docs/screens.md S03 to S06. */

export type App = "member" | "admin";
export type Route = "login" | "verify" | "status" | "app" | "wrong_app";

type Claims = { sub?: string; otp_verified?: boolean; user_status?: string };

function claimsOf(accessToken: string): Claims {
  const part = accessToken.split(".")[1] ?? "";
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as Claims;
}

export function userStatusOf(accessToken: string): string | undefined {
  return claimsOf(accessToken).user_status;
}

export function userIdOf(accessToken: string): string {
  return claimsOf(accessToken).sub ?? "";
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
  status: "/registration",
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
  | { kind: "too_many_codes" }
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
  | { kind: "too_many_codes" }
  | { kind: "network" };

export type PasswordResetStart =
  { kind: "sent"; resetId: string; resendAfterSeconds: number } | { kind: "network" };

export type SavePasswordResult = VerifyResult | { kind: "weak_password" };

function resetCodeResult(r: Record<string, unknown> | null): VerifyResult {
  if (!r || r.error === "failed") return { kind: "network" };
  if (r.ok) return { kind: "verified" };
  if (r.error === "wrong_code")
    return { kind: "wrong_code", attemptsLeft: Number(r.attempts_left) };
  if (r.error === "too_many") return { kind: "too_many" };
  if (r.error === "expired") return { kind: "expired" };
  return { kind: "no_code" };
}

export type FunctionOptions = { url: string; anonKey: string; fetch?: typeof fetch };

export function functionCaller({ url, anonKey, fetch: fetchImpl = fetch }: FunctionOptions) {
  return async (name: string, body: object, accessToken?: string) => {
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
  };
}

export type EmailRecoveryRequest = {
  username: string;
  newEmail: string;
  lastDigits: string;
  photo: string;
  mime: string;
};

export type EmailRecoveryResult = "sent" | "invalid" | "photo_too_large" | "failed";

export function createLoginClient(options: FunctionOptions) {
  const call = functionCaller(options);

  return {
    async requestEmailRecovery(
      request: EmailRecoveryRequest,
      staffAccessToken?: string,
    ): Promise<EmailRecoveryResult> {
      const r = await call("request-email-recovery", request, staffAccessToken);
      if (r?.ok) return "sent";
      if (r?.error === "invalid" || r?.error === "photo_too_large") return r.error;
      return "failed";
    },

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
      if (r.error === "too_many_codes") return { kind: "too_many_codes" };
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
      if (r.error === "too_many_codes") return { kind: "too_many_codes" };
      return { kind: "sent", resendAfterSeconds: Number(r.resend_after_seconds ?? 60) };
    },

    /** S04a step 1. The answer is the same whether or not the username exists. */
    async startPasswordReset(username: string): Promise<PasswordResetStart> {
      const r = await call("forgot-password", { username });
      if (typeof r?.reset_id !== "string") return { kind: "network" };
      return {
        kind: "sent",
        resetId: r.reset_id,
        resendAfterSeconds: Number(r.resend_after_seconds ?? 60),
      };
    },

    /** S04a step 2: confirms the code without using it up. */
    async checkResetCode(resetId: string, code: string): Promise<VerifyResult> {
      return resetCodeResult(await call("reset-password", { reset_id: resetId, code }));
    },

    /** S04a step 3: saves the new password; every other device is signed out. */
    async saveNewPassword(
      resetId: string,
      code: string,
      password: string,
    ): Promise<SavePasswordResult> {
      const r = await call("reset-password", { reset_id: resetId, code, password });
      if (r?.error === "weak_password") return { kind: "weak_password" };
      return resetCodeResult(r);
    },
  };
}

export type LoginClient = ReturnType<typeof createLoginClient>;

export type SignUpResult =
  | { kind: "created" }
  | { kind: "invalid"; problems: Partial<Record<keyof SignUpInput, FieldProblem>> }
  | { kind: "username_taken" }
  | { kind: "email_taken" }
  | { kind: "closed" }
  | { kind: "cap_reached" }
  | { kind: "network" };

export type SaveIdentityResult =
  | { kind: "saved" }
  | { kind: "invalid"; problem: FieldProblem }
  | { kind: "duplicate" }
  | { kind: "too_many" }
  | { kind: "network" };

export type SubmitResult =
  | { kind: "submitted" }
  | { kind: "incomplete"; step: number }
  | { kind: "failed" }
  | { kind: "network" };

/** Sign-up (S02) and the registration wizard's server steps (S05). */
export function createRegistrationClient(options: FunctionOptions) {
  const call = functionCaller(options);
  return {
    async signUp(input: SignUpInput & { language: Language }): Promise<SignUpResult> {
      const r = await call("sign-up", input);
      if (!r) return { kind: "network" };
      if (r.ok) return { kind: "created" };
      if (r.error === "invalid")
        return { kind: "invalid", problems: (r.problems ?? {}) as Record<string, FieldProblem> };
      if (r.error === "username_taken") return { kind: "username_taken" };
      if (r.error === "email_taken") return { kind: "email_taken" };
      if (r.error === "closed") return { kind: "closed" };
      if (r.error === "cap_reached") return { kind: "cap_reached" };
      return { kind: "network" };
    },

    async saveIdentity(
      accessToken: string,
      identity: { idType: IdType; idNumber: string; idExpiresOn?: string },
    ): Promise<SaveIdentityResult> {
      const r = await call("save-identity", identity, accessToken);
      if (!r) return { kind: "network" };
      if (r.ok) return { kind: "saved" };
      if (r.error === "duplicate") return { kind: "duplicate" };
      if (r.error === "too_many") return { kind: "too_many" };
      if (r.error === "invalid") return { kind: "invalid", problem: r.problem as FieldProblem };
      return { kind: "network" };
    },

    async submit(accessToken: string): Promise<SubmitResult> {
      const r = await call("submit-registration", {}, accessToken);
      if (!r) return { kind: "network" };
      if (r.ok) return { kind: "submitted" };
      if (r.error === "incomplete") return { kind: "incomplete", step: Number(r.step) };
      return { kind: "failed" };
    },

    async status(accessToken: string): Promise<ApplicationStatus> {
      const r = await call("application-status", {}, accessToken);
      if (r?.state === "under_review") return { kind: "under_review" };
      if (r?.state === "rejected" || r?.state === "rejected_final")
        return {
          kind: "rejected",
          reason: String(r.reason ?? ""),
          final: r.state === "rejected_final",
        };
      if (r?.state === "drafting") return { kind: "drafting" };
      if (r?.state === "approved") return { kind: "approved" };
      if (r?.error === "not_signed_in") return { kind: "signed_out" };
      return { kind: "network" };
    },

    async startResubmission(accessToken: string): Promise<boolean> {
      const r = await call("start-resubmission", {}, accessToken);
      return Boolean(r?.ok);
    },
  };
}

/** Where an application stands (S06). Never carries reviewer details, queue numbers or an expected time (#180). */
export type ApplicationStatus =
  | { kind: "drafting" }
  | { kind: "under_review" }
  | { kind: "rejected"; reason: string; final: boolean }
  | { kind: "approved" }
  | { kind: "signed_out" }
  | { kind: "network" };

export type RegistrationClient = ReturnType<typeof createRegistrationClient>;

export type LoginMessages = {
  invalidLogin: string;
  locked: (time: string) => string;
  suspended: string;
  network: string;
  tooManyCodes: string;
  wrongCode: (attemptsLeft: number) => string;
  tooManyWrongCodes: string;
  codeExpired: string;
  noCode: string;
};

export const minutesAndSeconds = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The message under the Log in form; locked is shown by the screen's own countdown. */
export function loginMessage(
  result: Exclude<LoginResult, { kind: "code_sent" } | { kind: "locked" }>,
  text: LoginMessages,
): string {
  switch (result.kind) {
    case "invalid":
      return text.invalidLogin;
    case "suspended":
      return text.suspended;
    case "too_many_codes":
      return text.tooManyCodes;
    case "network":
      return text.network;
  }
}

export function codeMessage(
  result: Exclude<VerifyResult, { kind: "verified" }>,
  text: LoginMessages,
): string {
  switch (result.kind) {
    case "wrong_code":
      return text.wrongCode(result.attemptsLeft);
    case "too_many":
      return text.tooManyWrongCodes;
    case "expired":
      return text.codeExpired;
    case "no_code":
      return text.noCode;
    case "network":
      return text.network;
  }
}
