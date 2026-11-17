---
name: phone-sign-in-setup
description: How phone sign-in by SMS (R29) is wired, the local test sender, and the hosted settings it needs before it can be switched on
metadata:
  type: project
---

# Phone sign-in by SMS (R29), as built 18 Nov 2026

- **Flow.** `phone-start` checks the number is +255, finds the one member whose `member_private.phone` it is and links it to that auth user, then calls Supabase Auth `signInWithOtp`. Auth's Send SMS hook is the Postgres function `private.send_sms_hook`, which only parks the plain code in `private.sms_pending`; `phone-start` takes it back in the same request, stores a hash in `private.phone_codes` and sends the A9 text. `phone-verify` applies the email code's rules (10 minutes, 3 attempts) and only then calls Auth `verifyOtp` and writes `private.mfa_sessions`, so the refreshed token has `otp_verified`. A session made by calling Auth directly is never marked.
- **A number two members share** gets the same answer and no code. A new number makes a new account that goes to S01a; the first sign-in stores the number in `member_private.phone`. Phone-only accounts have an empty email, so `member_private_email_unique` skips empty emails and the email sender skips them.
- **Local test sender.** With `SMS_SENDER = "test"` (config.toml edge secrets) and no Africa's Talking key, codes go to `private.test_sms`; e2e reads them with `nextSmsCode`. Without the test flag and without a key, `phone-start` fails rather than keep codes.
- **Local CLI quirk.** The phone provider only turns on when an SMS provider block is enabled, so `[auth.sms.twilio]` is on with placeholder values that are never used.
- **Before switching it on hosted** (`EXPO_PUBLIC_PHONE_SIGN_IN=1` on the member site): enable the phone provider and the Send SMS hook (`pg-functions://postgres/private/send_sms_hook`) in the dashboard, set SMS OTP expiry to at least 600 seconds and the SMS rate limit to 60 seconds, and set `AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME` and `SMS_SENDER_ID` as function secrets. The Africa's Talking request follows their documented API but was not tried against it; check one real send first.

Related: [[sms-provider-tanzania]], [[hosted-test-environment]].
