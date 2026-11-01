import { describe, expect, it, vi } from "vitest";
import { createLoginClient, routeFor } from "./auth";

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
});
