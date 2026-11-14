# Proposal: sign in with Google

| Item | Detail |
|---|---|
| Status | **Proposed, needs Champion's and the collaborator's answer.** Nothing is built. |
| Date | 14 November 2026 |
| Touches | REG-1 (registration), REG-4 (login), REG-6 (password reset), PRD section 4 "Out of scope: social media integrations", section 15 Security ("MFA on every login") and Privacy, the privacy notice (`legal/privacy.*.md`) |
| Plan | FR-01, FR-02, UC-01 to UC-06, UC-09, UC-10 |

## What we propose, in one paragraph

Add **"Continue with Google"** to S02 Sign up and S03 Log in in the member app, as another way to type in who you are. Google replaces the **password** only. **The 6-digit email code is still asked for on every login** (PRD section 15), a Google sign-up still goes through the whole registration wizard (S05: +255 phone, region and district, ID, face photo, terms) and stays **Pending until an administrator approves it**, and the same lock, suspension and audit rules apply. Members who signed up with a password can link Google later in Settings. The admin console is left out for now (see Decision 4). The feature sits behind a platform setting, off by default.

## Why

- Fewer forgotten passwords: Forgot password (REG-6) and the email-recovery queue (S04 "Can't get the code?") are among the most-used support paths in pilots like this one.
- A faster first step on a phone: no password to invent and type twice on S02.
- Most members already have a Google account on their Android phone.

What it does **not** do: skip the email code, skip verification, or let anyone in who is not an approved member.

## Does this conflict with the PRD?

| PRD rule | Conflict? | How the proposal handles it |
|---|---|---|
| Section 4: "Out of scope: … social media integrations" | **Possibly.** Signing in with Google is not posting to or reading from a social network, but it is an outside account. | Needs an explicit decision (Decision 1). If yes, add a line to section 18 and Appendix A. |
| REG-4: "log in with password and OTP" | Yes, wording | REG-4 becomes "password **or Google**, then the email code". AC 7 (code valid 10 minutes, 3 attempts, resend after 60 s) is unchanged. |
| Section 15: "MFA on every login" | No | The email code stays. Google's own 2-step verification is not used as our second step (Decision 2). |
| Section 6 AC 8: 5 wrong passwords lock the account for 15 minutes | No | Google sign-ins have no password to get wrong. The code's own limits (3 tries, codes per hour) still apply, and a locked account stays locked whichever way the member comes in. |
| Section 15 Privacy: consent, PDPA 2022 | Yes, needs a text change | Google learns that the person signed in to Kingdom Connect. The privacy notice must say so: a new version, which members accept at their next sign-in (existing S07 flow). |
| CLAUDE.md "Privacy is the product" | No | We ask Google only for `openid email profile` and store only the Google account id and the email. We never store or show the Google profile photo (the face photo stays the member's own upload). |

## How it works

### Today (for reference)

`login` (Edge Function) finds the account by username, phone or email, checks the password through Supabase Auth, applies the 5-try lock, refuses pending, rejected and suspended accounts, then emails a 6-digit code tied to that session. `verify-otp` marks the session as code-checked, and the access token hook adds `otp_verified` and `user_status` claims, which every RLS rule requires (`context/memory/supabase-auth-login-flow.md`).

### Log in with Google (S03)

1. The member taps **Continue with Google**. The app starts Supabase Auth's Google sign-in with PKCE and comes back to `/auth/callback`.
2. Supabase creates a session. The access token hook gives it `otp_verified = false`, so RLS still returns nothing.
3. The app calls a new Edge Function, **`google-login`**. It does what `login` does after a correct password: finds the member by the Google identity, refuses suspended, pending (which go to S06), rejected and staff accounts with the same answers as today, checks the lock, and emails the 6-digit code tied to this session.
4. The member types the code on S04 as today. `verify-otp` is reused unchanged.

A Google account that belongs to no member gets the S02 flow below, not an error that says whether an account exists.

### Sign up with Google (S02)

1. **Continue with Google** on S02. Google confirms the email, so S02 asks only for **username and +255 phone**, with the same checks as `sign-up` (unique username and phone, daily cap, `real_registrations_open` / `test_data_only`).
2. A new Edge Function, **`complete-google-sign-up`**, creates the member row exactly as `sign-up` does, without a password. The member then gets the email code (S04), as every new account does.
3. The wizard (S05), S06 Pending, admin approval and everything after are unchanged.

Supabase creates its own auth user the moment Google answers, before step 2. Until step 2 that user has no member row, so RLS gives them nothing. A daily job deletes auth users with no member row after 24 hours, so abandoned Google clicks leave nothing behind. The `before_user_created` auth hook (already in our Supabase version, commented out in `supabase/config.toml`) can also refuse new users while registrations are closed. *To check: which Supabase plans offer that hook.*

### Link and unlink in Settings (S47)

- **Link Google** on S47 Password and sign-in: the email code is asked for first, then Google. The Google account's email must match the member's verified email. One Google account per member.
- **Unlink** keeps password login. A member who signed up with Google and never set a password is asked to set one (through the existing reset steps) before unlinking, so they can never lock themselves out.
- Supabase links a Google sign-in to an existing account by itself when both emails are verified. That gives no more power than our email reset already does (whoever controls the email can reset the password), and the email code is still required. We will still test that this automatic link never skips `google-login`.
- Every Google sign-in, link and unlink goes to the audit log, with a security notification to the member (E-series, new copy in `docs/notifications.md`).

### Android and iOS apps (Mobile apps milestone)

The same flow with `expo-auth-session` / `expo-web-browser` and the `kingdomconnect://auth/callback` deep link. **Apple App Store guideline 4.8:** an iOS app that offers Google sign-in must also offer an equivalent privacy-focused option, in practice Sign in with Apple. *To check against the current guideline before the iOS build.* This is a cost of choosing Google that lands later.

## Risks

| Risk | Effect | Answer |
|---|---|---|
| A Google account is taken over | The attacker still needs the email code, sent to that same Gmail: it is a single point. | The same is true today for Forgot password. Members who want separation can keep password login. We recommend members turn on Google 2-step verification (help text). |
| Members think Google "verified" them | Confusion about the admin check | The S02 wording says Google only confirms the email; verification is still the ID check. |
| Orphan auth users from abandoned sign-ups | Clutter, possible abuse of the daily cap | No member row means no access and no cap use; the daily clean-up job removes them. |
| Google OAuth consent screen | Branding verification needs a domain we own | `*.vercel.app` cannot be verified as ours. Needs the production domain (open with the hosting decision). Testing works unverified with up to 100 test users. |
| iOS guideline 4.8 | Sign in with Apple needed for the iOS app | Plan it in the Mobile apps milestone, or keep Google off on iOS. |
| Privacy notice change | All members accept a new version | Uses the existing S07 flow. Draft wording for the lawyer below. |

## Work, if approved

| Piece | Size |
|---|---|
| Google Cloud project and OAuth client ids (web, Android, iOS), done by the team, not in code | Small, needs an owner account |
| Supabase: `[auth.external.google]` with env substitution, redirect URLs per environment | Small |
| Edge Functions `google-login` and `complete-google-sign-up`, rules shared with `login` and `sign-up` | Medium |
| Member app: buttons on S02 and S03, `/auth/callback`, shortened S02, Link and Unlink on S47 | Medium |
| Platform setting `google_sign_in_enabled` (off by default), audit events, notification copy, orphan clean-up job | Small |
| Tests: unit, pgTAP for any new table or rule, Playwright with a mocked Google callback | Medium |
| Privacy notice version 0.3, English and Kiswahili | Lawyer |
| README: Google Cloud console steps | Small |

About one to two weeks of build work for the web member app, plus the lawyer's text.

## Decisions needed

1. **Is Google sign-in in scope for Phase 1?** It is not a social media integration in the sense of section 4, but it is an outside account. *Recommendation: yes, for the member web app, behind the off-by-default setting.*
2. **Keep the email code after Google?** We cannot tell from Google whether the person used 2-step verification. *Recommendation: yes, keep it; MFA on every login stays exactly as section 15 says.*
3. **Can a member sign up with Google, or only link it after signing up with a password?** *Recommendation: both. Sign-up is where most of the benefit is.*
4. **Admin console?** Staff are few and invited, and a Google sign-in creates a Supabase user for any Google account that tries. *Recommendation: not now. If wanted later, only for emails a Super Administrator invited, with the `before_user_created` hook refusing everyone else.*
5. **iOS:** add Sign in with Apple when the iOS app is built, or keep Google off on iOS? *Recommendation: decide at the Mobile apps milestone.*
6. **Privacy notice:** approve adding Google to the service providers (draft below) for the lawyer.

## Draft privacy notice addition (for the lawyer)

Under "Who can see it", after the service providers line:

> **Google**, if you choose "Continue with Google": Google tells us your email address and confirms you control it, and learns that you signed in to {platform_name}. We do not receive your Google password, contacts or photos. You can stop using Google sign-in at any time in Settings.

Kiswahili:

> **Google**, ukichagua "Endelea na Google": Google inatuambia anwani yako ya barua pepe na kuthibitisha kwamba ni yako, na inajua kwamba umeingia kwenye {platform_name}. Hatupokei nenosiri lako la Google, anwani zako za mawasiliano wala picha zako. Unaweza kuacha kutumia kuingia kwa Google wakati wowote kwenye Mipangilio.

## Next step

If the answers are yes, record them on the [wayfinder map](https://github.com/clainkavit/kingdom-connect/issues/1) and in PRD section 18 and Appendix A, update REG-4, then cut the build issues from the "Work" table.
