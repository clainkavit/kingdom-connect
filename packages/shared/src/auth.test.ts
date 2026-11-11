import { describe, expect, it, vi } from "vitest";
import {
  codeMessage,
  createLoginClient,
  createRegistrationClient,
  loginMessage,
  minutesAndSeconds,
  routeFor,
  type LoginMessages,
} from "./auth";

const token = (claims: object) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

describe("routeFor (docs/screens.md S03 to S06)", () => {
  it("sends a signed-out visitor to Log in", () => {
    expect(routeFor(null, "member")).toBe("login");
  });

  it("sends a session that has not passed the email code to Email code", () => {
    expect(routeFor(token({ otp_verified: false, user_status: "approved" }), "member")).toBe(
      "verify",
    );
  });

  it("lets an approved Member into the member app", () => {
    expect(routeFor(token({ otp_verified: true, user_status: "approved" }), "member")).toBe("app");
  });

  it("sends an Applicant to Registration status only", () => {
    expect(routeFor(token({ otp_verified: true, user_status: "pending" }), "member")).toBe(
      "status",
    );
    expect(routeFor(token({ otp_verified: true, user_status: "rejected" }), "member")).toBe(
      "status",
    );
  });

  it("keeps Administrators out of the member app and Members out of the admin console", () => {
    expect(routeFor(token({ otp_verified: true, user_status: "staff" }), "member")).toBe(
      "wrong_app",
    );
    expect(routeFor(token({ otp_verified: true, user_status: "approved" }), "admin")).toBe(
      "wrong_app",
    );
    expect(routeFor(token({ otp_verified: true, user_status: "staff" }), "admin")).toBe("app");
  });
});

describe("createLoginClient", () => {
  const respond = (status: number, body: object) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const client = (fetchImpl: typeof fetch) =>
    createLoginClient({ url: "http://api.test", anonKey: "anon", fetch: fetchImpl });

  it("posts the username and password to the login function", async () => {
    const fetchImpl = respond(200, {
      session: { access_token: "a", refresh_token: "r" },
      user_status: "approved",
      resend_after_seconds: 60,
    });
    const result = await client(fetchImpl).logIn({ username: "test_level1", password: "pw" });
    expect(result).toEqual({
      kind: "code_sent",
      session: { access_token: "a", refresh_token: "r" },
      resendAfterSeconds: 60,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/functions/v1/login");
    expect(JSON.parse(init.body)).toEqual({ username: "test_level1", password: "pw" });
    expect(init.headers.apikey).toBe("anon");
  });

  it("maps each refusal", async () => {
    expect(
      await client(respond(401, { error: "invalid_credentials" })).logIn({
        username: "x",
        password: "y",
      }),
    ).toEqual({
      kind: "invalid",
    });
    expect(
      await client(respond(423, { error: "locked", retry_after_seconds: 840 })).logIn({
        username: "x",
        password: "y",
      }),
    ).toEqual({ kind: "locked", retryAfterSeconds: 840 });
    expect(
      await client(respond(403, { error: "suspended" })).logIn({ username: "x", password: "y" }),
    ).toEqual({
      kind: "suspended",
    });
  });

  it("treats a network failure as its own result, never as wrong details", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await client(fetchImpl).logIn({ username: "x", password: "y" })).toEqual({
      kind: "network",
    });
  });

  it("verifies a code with the session's access token", async () => {
    const fetchImpl = respond(200, { ok: true });
    expect(await client(fetchImpl).verifyCode("token", "123456")).toEqual({ kind: "verified" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/functions/v1/verify-otp");
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  it("maps code errors", async () => {
    expect(
      await client(respond(400, { error: "wrong_code", attempts_left: 2 })).verifyCode("t", "1"),
    ).toEqual({
      kind: "wrong_code",
      attemptsLeft: 2,
    });
    expect(
      await client(respond(400, { error: "too_many", attempts_left: 0 })).verifyCode("t", "1"),
    ).toEqual({
      kind: "too_many",
    });
    expect(await client(respond(400, { error: "expired" })).verifyCode("t", "1")).toEqual({
      kind: "expired",
    });
  });

  it("asks for a new code, or says how long to wait", async () => {
    expect(
      await client(respond(200, { ok: true, resend_after_seconds: 60 })).resendCode("t"),
    ).toEqual({
      kind: "sent",
      resendAfterSeconds: 60,
    });
    expect(
      await client(respond(429, { error: "too_soon", retry_after_seconds: 12 })).resendCode("t"),
    ).toEqual({
      kind: "too_soon",
      retryAfterSeconds: 12,
    });
  });

  it("starts a password reset with the username only, and no token (S04a)", async () => {
    const fetchImpl = respond(200, { reset_id: "r-1", resend_after_seconds: 60 });
    expect(await client(fetchImpl).startPasswordReset("neema")).toEqual({
      kind: "sent",
      resetId: "r-1",
      resendAfterSeconds: 60,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/functions/v1/forgot-password");
    expect(JSON.parse(init.body)).toEqual({ username: "neema" });
    expect(init.headers.Authorization).toBeUndefined();
    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await client(offline).startPasswordReset("neema")).toEqual({ kind: "network" });
  });

  it("checks the reset code, then saves the new password with it (S04a)", async () => {
    const check = respond(200, { ok: true });
    expect(await client(check).checkResetCode("r-1", "123456")).toEqual({ kind: "verified" });
    expect(JSON.parse(check.mock.calls[0]![1].body)).toEqual({ reset_id: "r-1", code: "123456" });

    const save = respond(200, { ok: true });
    expect(await client(save).saveNewPassword("r-1", "123456", "newpass12")).toEqual({
      kind: "verified",
    });
    const [url, init] = save.mock.calls[0]!;
    expect(url).toBe("http://api.test/functions/v1/reset-password");
    expect(JSON.parse(init.body)).toEqual({
      reset_id: "r-1",
      code: "123456",
      password: "newpass12",
    });
  });

  it("maps reset refusals like the login code's", async () => {
    expect(
      await client(respond(400, { error: "wrong_code", attempts_left: 1 })).checkResetCode(
        "r",
        "1",
      ),
    ).toEqual({ kind: "wrong_code", attemptsLeft: 1 });
    expect(await client(respond(400, { error: "too_many" })).checkResetCode("r", "1")).toEqual({
      kind: "too_many",
    });
    expect(await client(respond(400, { error: "expired" })).checkResetCode("r", "1")).toEqual({
      kind: "expired",
    });
    expect(
      await client(respond(400, { error: "weak_password" })).saveNewPassword("r", "1", "short"),
    ).toEqual({ kind: "weak_password" });
    expect(
      await client(respond(500, { error: "failed" })).saveNewPassword("r", "1", "newpass12"),
    ).toEqual({ kind: "network" });
  });
});

describe("too many codes", () => {
  const respond = (status: number, body: object) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const client = (fetchImpl: typeof fetch) =>
    createLoginClient({ url: "http://api.test", anonKey: "anon", fetch: fetchImpl });

  it("is its own result at login and at resend", async () => {
    expect(
      await client(respond(429, { error: "too_many_codes" })).logIn({
        username: "x",
        password: "y",
      }),
    ).toEqual({ kind: "too_many_codes" });
    expect(await client(respond(429, { error: "too_many_codes" })).resendCode("t")).toEqual({
      kind: "too_many_codes",
    });
  });
});

describe("messages for the sign-in screens", () => {
  const strings: LoginMessages = {
    invalidLogin: "invalid",
    locked: (t) => `locked ${t}`,
    suspended: "suspended",
    network: "network",
    tooManyCodes: "too many codes",
    wrongCode: (n) => `wrong ${n}`,
    tooManyWrongCodes: "too many wrong",
    codeExpired: "expired",
    noCode: "no code",
  };

  it("maps every login result that is not a success", () => {
    expect(loginMessage({ kind: "invalid" }, strings)).toBe("invalid");
    expect(loginMessage({ kind: "suspended" }, strings)).toBe("suspended");
    expect(loginMessage({ kind: "network" }, strings)).toBe("network");
    expect(loginMessage({ kind: "too_many_codes" }, strings)).toBe("too many codes");
  });

  it("maps every code result that is not a success", () => {
    expect(codeMessage({ kind: "wrong_code", attemptsLeft: 2 }, strings)).toBe("wrong 2");
    expect(codeMessage({ kind: "too_many" }, strings)).toBe("too many wrong");
    expect(codeMessage({ kind: "expired" }, strings)).toBe("expired");
    expect(codeMessage({ kind: "no_code" }, strings)).toBe("no code");
    expect(codeMessage({ kind: "network" }, strings)).toBe("network");
  });

  it("formats a countdown as minutes and seconds", () => {
    expect(minutesAndSeconds(900)).toBe("15:00");
    expect(minutesAndSeconds(61)).toBe("1:01");
  });
});

describe("createRegistrationClient (S02, S05)", () => {
  const respond = (status: number, body: object) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const client = (fetchImpl: typeof fetch) =>
    createRegistrationClient({ url: "http://api.test", anonKey: "anon", fetch: fetchImpl });
  const signUp = {
    username: "test_user",
    email: "t@example.test",
    phone: "0712345678",
    password: "secret123",
    language: "en" as const,
  };

  it("creates an account through the sign-up function", async () => {
    const fetchImpl = respond(201, { ok: true });
    expect(await client(fetchImpl).signUp(signUp)).toEqual({ kind: "created" });
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://api.test/functions/v1/sign-up");
  });

  it("maps each sign-up refusal", async () => {
    expect(await client(respond(409, { error: "username_taken" })).signUp(signUp)).toEqual({
      kind: "username_taken",
    });
    expect(await client(respond(409, { error: "email_taken" })).signUp(signUp)).toEqual({
      kind: "email_taken",
    });
    expect(await client(respond(403, { error: "closed" })).signUp(signUp)).toEqual({
      kind: "closed",
    });
    expect(await client(respond(429, { error: "cap_reached" })).signUp(signUp)).toEqual({
      kind: "cap_reached",
    });
    expect(
      await client(respond(400, { error: "invalid", problems: { phone: "phone" } })).signUp(signUp),
    ).toEqual({ kind: "invalid", problems: { phone: "phone" } });
  });

  it("sends the ID with the Applicant's token and reports a duplicate", async () => {
    const fetchImpl = respond(409, { error: "duplicate" });
    expect(
      await client(fetchImpl).saveIdentity("tok", { idType: "nida", idNumber: "1".repeat(20) }),
    ).toEqual({ kind: "duplicate" });
    expect(fetchImpl.mock.calls[0]![1].headers.Authorization).toBe("Bearer tok");
  });

  it("points back to the unfinished step when submitting too early", async () => {
    expect(await client(respond(400, { error: "incomplete", step: 4 })).submit("tok")).toEqual({
      kind: "incomplete",
      step: 4,
    });
  });

  it("says when the server cannot be reached", async () => {
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await client(offline).submit("tok")).toEqual({ kind: "network" });
  });

  it("reads the Applicant's status (S06)", async () => {
    expect(await client(respond(200, { state: "under_review" })).status("tok")).toEqual({
      kind: "under_review",
    });
    expect(
      await client(respond(200, { state: "rejected", reason: "The ID has expired" })).status("tok"),
    ).toEqual({
      kind: "rejected",
      reason: "The ID has expired",
      final: false,
    });
    expect(
      await client(respond(200, { state: "rejected_final", reason: "R" })).status("tok"),
    ).toEqual({
      kind: "rejected",
      reason: "R",
      final: true,
    });
    expect(await client(respond(200, { state: "drafting" })).status("tok")).toEqual({
      kind: "drafting",
    });
    expect(await client(respond(200, { state: "approved" })).status("tok")).toEqual({
      kind: "approved",
    });
    expect(await client(respond(401, { error: "not_signed_in" })).status("tok")).toEqual({
      kind: "signed_out",
    });
    expect(await client(respond(403, { error: "not_an_applicant" })).status("tok")).toEqual({
      kind: "network",
    });
  });

  it("starts a resubmission", async () => {
    expect(await client(respond(200, { ok: true })).startResubmission("tok")).toBe(true);
    expect(await client(respond(409, { error: "final" })).startResubmission("tok")).toBe(false);
  });
});
