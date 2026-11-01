import { LOCAL_SUPABASE } from "@kingdom-connect/shared";
import { expect, test } from "@playwright/test";
import { createMember, TEST_PASSWORD } from "./helpers";

const fn = (name: string) => `${LOCAL_SUPABASE.url}/functions/v1/${name}`;
const headers = (token?: string) => ({
  apikey: LOCAL_SUPABASE.anonKey,
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

test("wrong passwords sent at the same moment are all counted (PRD section 6, criterion 8)", async ({
  request,
}) => {
  const username = `e2e_race_${Date.now()}`;
  await createMember(username);
  const tries = await Promise.all(
    Array.from({ length: 20 }, () =>
      request.post(fn("login"), {
        headers: headers(),
        data: { username, password: "not-the-password" },
      }),
    ),
  );
  const statuses = tries.map((r) => r.status());
  expect(statuses.filter((s) => s === 401)).toHaveLength(4);
  expect(statuses.filter((s) => s === 423)).toHaveLength(16);
});

test("wrong codes sent at the same moment cannot beat the 3-try limit", async ({ request }) => {
  const username = `e2e_codes_${Date.now()}`;
  await createMember(username);
  const login = await request.post(fn("login"), {
    headers: headers(),
    data: { username, password: TEST_PASSWORD },
  });
  const { session } = await login.json();
  const guesses = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      request.post(fn("verify-otp"), {
        headers: headers(session.access_token),
        data: { code: String(i).padStart(6, "0") },
      }),
    ),
  );
  const results = await Promise.all(guesses.map((g) => g.json()));
  expect(results.filter((r) => r.error === "wrong_code")).toHaveLength(2);
  expect(results.filter((r) => r.error === "too_many")).toHaveLength(8);
});

test("a session made straight at Supabase Auth cannot get an email code", async ({ request }) => {
  const direct = await request.post(`${LOCAL_SUPABASE.url}/auth/v1/token?grant_type=password`, {
    headers: headers(),
    data: { email: "test.suspended@example.test", password: TEST_PASSWORD },
  });
  const { access_token } = await direct.json();
  const resend = await request.post(fn("resend-otp"), { headers: headers(access_token), data: {} });
  expect(resend.status()).toBe(401);

  const member = await request.post(`${LOCAL_SUPABASE.url}/auth/v1/token?grant_type=password`, {
    headers: headers(),
    data: { email: "test.level2@example.test", password: TEST_PASSWORD },
  });
  const memberToken = (await member.json()).access_token;
  const noCode = await request.post(fn("resend-otp"), { headers: headers(memberToken), data: {} });
  expect(await noCode.json()).toEqual({ error: "no_code" });
});
