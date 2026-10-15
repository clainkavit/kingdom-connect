---
name: supabase-auth-login-flow
description: What Supabase Auth supports natively for username + password + email OTP second step, lockout and admin approval, and what needs custom work
metadata:
  type: reference
---

# Supabase Auth: username + password + email OTP, lockout, admin approval

Findings dated 15 October 2026. Sources are Supabase docs, the `supabase/auth` source on `master`, the `supabase/supabase` repo and Supabase GitHub issues/discussions. Docs and code change, so re-check anything load-bearing before building on it.

## Answer

- **Username sign-in: custom.** `signInWithPassword` takes email or phone only [1]. Supabase stated in 2023 that it does not plan to add username login [2]. Use a server-side lookup (edge function) from username to email, then sign in.
- **Email OTP as a second factor on every login: custom.** Native MFA factors are TOTP and phone (plus WebAuthn and recovery codes in source, off by default). There is no email factor [3][4][5]. Email OTP via `signInWithOtp` is a first-factor login that creates its own session, so it cannot be chained after a password to reach AAL2 [3][6]. Build it yourself: OTP table, edge functions, and a Custom Access Token hook that adds a "second step done" claim, enforced in RLS.
- **5-minute expiry, 6 digits, 3 attempts: custom (for the custom OTP).** Native email OTP length is 6 to 10 digits and expiry is configurable, but there is no per-code attempt limit, only an IP rate limit on `/verify` (30 per 5 minutes) [6][7][8]. Native phone MFA codes are also valid up to 5 minutes, again with no per-challenge attempt counter in the code [9][10].
- **Lockout after 5 failed passwords for 15 minutes: not native.** The Password Verification Attempt hook can do it, but it is Team/Enterprise only [11][12][13]. On Free/Pro, do it in the login edge function and enforce with the admin `ban_duration` (for example `"15m"`), which the password grant checks before anything else [14][15].
- **Admin approval (Pending to Approved/Rejected): custom, small.** Keep `status` in your own table. Check it in the login function, put it in the JWT via the Custom Access Token hook (Free and Pro) and enforce with a restrictive RLS policy [11][12][16]. Never use `user_metadata` for this, users can edit it [17].
- **Sending: native hooks.** Custom SMTP is on all plans and required for real users [18][12]. Send Email and Send SMS hooks are Free and Pro [11]. The Send SMS hook fits a Tanzanian gateway later [19].

## Recommended approach

Works on the Pro plan. No Team-only hooks needed.

**Tables (in a private schema, no `anon`/`authenticated` access):**

- `profiles(user_id, username unique citext, status enum('pending','approved','rejected'), ...)`. Admin-only writes to `status`.
- `login_attempts(user_id, failed_count, first_failed_at, locked_until)`.
- `login_otps(id, user_id, session_id, code_hash, expires_at, attempts, consumed_at)`. Store a hash, never the plain code.
- `mfa_sessions(session_id primary key, user_id, verified_at)`.

**Edge function `login` (username + password):**

1. Look up the user by username server-side (service role). Return the same generic error for "no such user", "wrong password", "pending" and "rejected" to limit username enumeration. Never return the email to the client.
2. If `locked_until > now()`, refuse.
3. Call `signInWithPassword({ email, password })` from the function with the anon key.
4. On failure: increment `failed_count`. At 5, set `locked_until = now() + 15 min` and call `auth.admin.updateUserById(id, { ban_duration: '15m' })` so direct calls to `/auth/v1/token` are also blocked during the lock [14][15].
5. On success: reset the counter. If status is not `approved`, sign that session out and refuse. Otherwise create a `login_otps` row tied to the new `session_id` (6 digits, `expires_at = now() + 5 min`, `attempts = 0`), send it by email (custom SMTP or Send Email hook / Resend etc.), and return the session to the client.

**Edge function `verify-otp`:** reads the caller's JWT for `user_id` and `session_id`. Rejects if expired, consumed, or `attempts >= 3` (increment on each wrong code, invalidate at 3). On a match, mark consumed and insert into `mfa_sessions`. Client then calls `refreshSession()` to get a new token.

**Custom Access Token hook (Postgres function, Free/Pro) [11][16]:** adds claims `user_status` (from `profiles`) and `otp_verified = exists(select 1 from mfa_sessions where session_id = claims.session_id)`. Keep the required claims intact [16].

**RLS:** add a `restrictive` policy on every app table, in the same style Supabase documents for AAL2 [3]:
`(auth.jwt()->>'otp_verified')::boolean is true and auth.jwt()->>'user_status' = 'approved'`.
A password-only session (from the edge function or from someone calling Auth directly) then reads nothing.

**Do not** overwrite the `aal` claim to `aal2` from the hook. The source shows the hook output replaces the claims and `aal` is only checked to be a string [20], so it is possible, but it is undocumented and fights Supabase's own AAL logic. A separate custom claim is clearer.

**SMS later:** either reuse the same custom OTP with a different sender, or switch to native phone MFA (gives real `aal2`) with the Send SMS hook pointed at the local gateway. The phone challenge code does call the Send SMS hook [10]. Native phone MFA costs the Advanced MFA Phone add-on ($75/month first project, Pro and Team) and still has no per-challenge 3-attempt limit unless you add the MFA Verification Attempt hook, which is Team-only [9][10][11][12][22].

## Risks and unknowns

- **Direct Auth API bypass.** Anyone who knows a user's email can call `/auth/v1/token` directly and skip the edge function's failure counting. They still get no data (RLS needs `otp_verified`), and an active ban blocks them [15], but their failed attempts are not counted. Closing this fully needs the Password Verification Attempt hook (Team plan, $599/month) [11][12]. Hiding emails behind usernames lowers, but does not remove, this risk.
- **Claim staleness.** The hook runs when a token is issued [16], so approving, rejecting or revoking takes effect at the next token refresh. For instant revocation, also sign the user out (admin API) or ban them. Timing is inferred from the docs, UNVERIFIED in detail.
- **Whether the refresh-token grant re-checks bans** was not confirmed from source. UNVERIFIED.
- **`mfa_sessions` cleanup.** Rows must be deleted on logout and session expiry, or a reused `session_id` check could leak. Design detail, not from a source.
- **Ban message.** A banned user gets "User is banned" [15]. Map this to a friendly "account temporarily locked" in the client.
- **Plan gating source.** Hook-by-plan data comes from the auth hooks page and the pricing page [11][12]. Individual hook pages do not repeat it.
- **Email OTP expiry default mismatch.** Docs say 1 hour default [6], the source falls back to 86400 seconds when unset [7]. Irrelevant for the custom OTP, noted in case native email OTP is used.
- **Email MFA may ship later.** The feature request was still unanswered by Supabase in June 2026 [5]. If it ships, re-evaluate.
- **Self-hosting.** All the hooks used here are configurable in self-hosted Supabase via `GOTRUE_HOOK_<NAME>_ENABLED` / `_URI` / `_SECRETS` env vars on the auth container [21]. Plan restrictions are a hosted-platform matter; I found no plan check in the auth config code [7], so Team-only hooks (Password and MFA Verification Attempt) should work self-hosted. That last point is an inference, UNVERIFIED by a running test. Edge functions, SMTP and rate limits are also configured by env on self-host [7][21].

## Sources

1. signInWithPassword reference: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
2. supabase/auth issue #903, maintainer kangmingtay, 15 Feb 2023: https://github.com/supabase/auth/issues/903 (see also community patterns in https://github.com/orgs/supabase/discussions/16619)
3. MFA guide (factors, AAL1/AAL2, restrictive RLS examples): https://supabase.com/docs/guides/auth/auth-mfa
4. Factor types in source: https://github.com/supabase/auth/blob/master/internal/models/factor.go
5. Email as second factor feature request #29082: https://github.com/orgs/supabase/discussions/29082
6. Passwordless email (OTP length, expiry, 60s resend, verifyOtp): https://supabase.com/docs/guides/auth/auth-email-passwordless
7. Auth configuration source (OTP length 6 to 10, OTP expiry, rate limits, hook names, recovery-code lockout): https://github.com/supabase/auth/blob/master/internal/conf/configuration.go
8. Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
9. Phone MFA (5 minute validity, code length setting, pricing): https://supabase.com/docs/guides/auth/auth-mfa/phone
10. MFA challenge/verify source (Send SMS hook use, no attempt counter): https://github.com/supabase/auth/blob/master/internal/api/mfa.go
11. Auth hooks overview (plan table): https://supabase.com/docs/guides/auth/auth-hooks
12. Pricing: https://supabase.com/pricing
13. Password Verification Attempt hook: https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook
14. Admin updateUserById (`ban_duration`): https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid and `"none"` / `time.ParseDuration` handling in https://github.com/supabase/auth/blob/master/internal/api/admin.go
15. Password grant source (ban check first, hook runs after password check for valid and invalid attempts, reject blocks even valid passwords): https://github.com/supabase/auth/blob/master/internal/api/token.go
16. Custom Access Token hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook and RBAC with custom claims: https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
17. Users (user_metadata is user-editable): https://supabase.com/docs/guides/auth/users
18. Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
19. Send SMS hook (and Send Email hook): https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook , https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
20. Token service source (hook output replaces claims, schema validation only): https://github.com/supabase/auth/blob/master/internal/tokens/service.go
21. Self-hosted docker-compose hook env vars: https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
22. MFA Verification Attempt hook: https://supabase.com/docs/guides/auth/auth-hooks/mfa-verification-hook
