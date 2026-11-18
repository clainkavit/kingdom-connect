# Walkthrough report, 14 November 2026 (Phase 1 of the improvement prompt)

I acted out ten real-life journeys on the preview, as each person would, and wrote down where someone would get stuck. **No code was changed for this report.**

- **Where:** the member app at `kingdom-connect-preview.vercel.app` and the admin console at `kingdom-connect-preview-admin.vercel.app`. Both are built from the open PRs #267 to #271 and run on the test backend `kingdom-connect-preview`, which holds fake people only.
- **How:** a Playwright run against the live sites at 1280 px and 390 px, then manual checks in a browser, plus direct calls to the server functions and the database API to confirm each cause.
- **Accounts:** the seeded test accounts (`test_level1`, `test_level2`, `test_level3`, `test_level1b`, `test_applicant`, `test_suspended`, `test.admin@example.test`, `test.superadmin@example.test`).
- **Screenshots:** in [`walkthrough-2026-11/`](walkthrough-2026-11/).

Each finding is tagged **PRD covers it** (fix it now) or **needs a proposal** (Champion and the collaborator decide first).

## Summary

| | High | Medium | Low |
|---|---|---|---|
| Findings | 4 | 6 | 4 |

The core works. These all go end to end:

- log in;
- the registration status screen;
- Level 2 and Level 3 forms with uploads;
- the opportunity, idea, training and event forms;
- connections;
- reports;
- privacy settings;
- email recovery;
- download or delete my data;
- the suspended-account message;
- the admin queues, settings, audit log and investors page.

The admin console has a proper phone layout with a bottom bar. Kiswahili is complete on every screen I opened.

Privacy held when tested through the database API as `test_level2`:

- `member_private` returns only the member's own row;
- `investor_flags` returns nothing;
- `verification_documents` returns nothing.

**What blocks real-life use** is four things:

- no email, so a brand-new person cannot finish signing up;
- screens that spin forever when the server fails;
- the opportunity post form isn't locked to Level 3;
- a preview with no content, so half of the journeys have nothing to act on.

## High

### H1. A new person cannot finish signing up, and the screen never says why (journeys 1 and 9)

**What happens.** Amina fills in sign-up and presses "Create an account". The account is created (the `sign-up` function returns 201), but the automatic log-in that follows fails with a server error (`login` returns 500), because no email provider is set on the preview: `MAIL_API_URL` and `BREVO_API_KEY` are both unset, so the login code cannot be sent. The button stays greyed out and busy with no message ([screenshot](walkthrough-2026-11/j1-signup-submit.jpg)). Forgot password behaves the same way ([screenshot](walkthrough-2026-11/j9-forgot-password.jpg)), and so do change password (S47) and change email. Only the `test.*@example.test` accounts can sign in, because they skip the code.

**What it needs, in two parts:**

1. **Email** (F08). Either a Brevo key from the owner, or the preview-only test inbox (gap D in the prompt). → *needs a proposal* for the test inbox. The Brevo key needs only the owner.
2. **Screens must never spin forever** (PRD section 15: every list and form has loading, empty and error states). When a function fails, times out (after about 20 s) or returns something that isn't JSON, show "Something went wrong. Try again." next to the button and re-enable it. This affects sign-up, log in, the email code, forgot password, change password and change email. → *PRD covers it.*

### H2. A failed sign-up leaves a half-made account (journey 1)

**What happens.** Because of H1, Amina's account exists but she never got in. If she tries again with the same username, email or phone, sign-up answers "username taken" (409, confirmed), and she cannot log in either. I made two test sign-ups (`test_amina_walk` and `test_amina_walk2` are now `pending` with no email ever sent).

**What it needs.** Either send the code before the account is committed, or let a repeated sign-up with the same email and password continue the unfinished one. Clean up accounts that never confirm their code after 24 hours. → *needs a proposal* (it touches REG-1 duplicate rules).

### H3. A Level 1 or Level 2 member can fill in the whole "Post an opportunity" form (journey 4)

**What happens.** `test_level1` opens `/opportunities/new` and sees step 1 of 4 with Save draft and Next ([screenshot](walkthrough-2026-11/j4-level1-new-opp.jpg)). The PRD says posting is for Level 3 posters and administrators (section 6 line 200, section 7 line 269, OPP-1). The form doesn't check the level, so a member can do all the work and only be refused at the end, if the server refuses at all. Events already do this well: "Posting events is for members with a verified business (Level 2) and above", with a "Verify your business" link ([screenshot](walkthrough-2026-11/j7-level1-events.jpg)).

**What it needs.** The same pattern for opportunities. Below Level 3, show why and a link to Business verification instead of the form, and confirm in a pgTAP test that the server refuses the insert. → *PRD covers it.*

### H4. The preview has almost nothing in it (journeys 2, 4, 6, 7)

**What happens.** There are no opportunities, ideas, trainings, events, news, messages or notifications, and the admin moderation, reports and re-verification queues are empty ([screenshot](walkthrough-2026-11/j4-level1-opps.jpg)). The one applicant has no ID or face photo: the admin sees "No photo" twice, and the signed-link request returns 400 ([screenshot](walkthrough-2026-11/j2-admin-detail.jpg)). Journeys 2, 4, 6 and 7 can't be acted out past the empty state, and the system looks unfinished to anyone shown it.

**What it needs.** A separate, re-runnable demo seed (gap E in the prompt). Placeholder ID and face images must be generated, never real faces. → *PRD covers it* (section 17, Test data).

## Medium

### M1. There is no way to choose admin or member at sign-in (owner request)

The member app and admin console have separate addresses and don't link to each other. A staff member who opens the member link has no way to reach the admin login, apart from the `wrong-app` page after a failed sign-in. **What it needs:** gap A in the prompt (an "I'm a member / I'm staff" choice, with the URLs from env vars and the two apps kept separate). → *owner request; fits the PRD* (the two apps stay separate; this only adds links).

### M2. Staff cannot search members or suspend one directly (audit M5, SAFE-3, A09)

`/members` is the investors page ([screenshot](walkthrough-2026-11/j10-super-members.jpg)). The dashboard's "Open members" link goes there too. You can suspend only from a report. **What it needs:** gap B in the prompt. → *PRD covers it* (A09).

### M3. Admins cannot look closely at documents (journey 2)

The verification page shows the photos at a fixed size with no zoom, rotate, full size or download ([screenshot](walkthrough-2026-11/j2-admin-detail.jpg)). Comparing a face with an ID photo needs detail. The same goes for business documents (BRELA, TIN, licence). **What it needs:** gap C in the prompt (a viewer with zoom, rotate and full size; a download through short-lived signed links only). → *PRD covers it* (A03 asks the admin to compare the photos). Adding a download for staff → *needs a proposal* if it should be audit-logged.

### M4. Registration status is a dead end (journey 1)

An applicant sees "Under review" with only Log out ([screenshot](walkthrough-2026-11/j1-applicant-root.jpg)). There's no way to see what they sent, no reassurance about what comes next, and no help link. The PRD decided not to show an expected time (migration `status_without_expected_time`), so that stays. **Suggested:** "What you sent" (read-only: name, category, region, and photo thumbnails only to the applicant), plus a short "What happens next" (the admin checks your ID, you get an email and a notification, you can fix and resubmit if asked). → *needs a proposal* for "What you sent". The wording only → *PRD covers it.*

### M5. A rejection can't ask for just one fix (journey 2)

Reject offers fixed reasons and "Reject and send the reason" ([screenshot](walkthrough-2026-11/j2-admin-reject-dialog.jpg)). The member side has "Fix and resubmit", so the loop exists. Check that every reason tells the member exactly what to redo (for example, "Take a clearer ID photo" opens straight on the ID step). → *PRD covers it* (REG-3). Test it once H4 has an applicant with photos.

### M6. Staff have no forgot password (audit M4)

The admin login has no "Forgot password?". REG-6 covers members only. → *needs a proposal* (gap F in the prompt).

## Low

### L1. The first log-in can take about 8 seconds with no progress text

The first log-in after a quiet spell took about 8 s (the server function waking up). The button turns grey, but nothing says "Signing you in…". Add the text, and after about 5 s, "This is taking longer than usual". → *PRD covers it.*

### L2. The report form says its question twice

"Why are you reporting?" appears as a heading and again as the dropdown label ([screenshot](walkthrough-2026-11/j8-level1-report-form.jpg)). Keep one; screen readers read both. → *PRD covers it.*

### L3. Investor tools is nearly empty

For `test_level1b` it shows one line ("You have investor tools…") and nothing to act on. It needs H4's content (ideas, saved ideas), plus a short explanation of what the tools do. → *PRD covers it* (S29).

### L4. Empty states don't always offer the next step

- "No open opportunities yet" offers an alert but, for posters, no "Post one".
- "No messages yet" has no "Find people" button.
- The training list says "Post a training" but gives no reason why someone would.

→ *PRD covers it* (gap G in the prompt).

## Journey by journey

| # | Journey | Result | Findings |
|---|---|---|---|
| 1 | Amina joins (phone, Kiswahili) | Landing and sign-up work in Kiswahili ([1](walkthrough-2026-11/j1-welcome-phone.jpg), [2](walkthrough-2026-11/j1-welcome-sw.jpg)). Stuck after "Create an account" | H1, H2, M4 |
| 2 | Admin approves | Queue, detail, reveal ID (audit-logged), mark duplicate, approve, and reject with reasons are all there. No photos to compare | H4, M3, M5 |
| 3 | Juma's business | Level 2 form with BRELA, TIN and licence uploads; Level 3 form with proof and address; the licence date shown ([screenshot](walkthrough-2026-11/j3-level1-business.jpg)). Re-verification queue empty | H4 |
| 4 | Posting an opportunity | Level 3 has "Post an opportunity" on Home; the admin post form is complete. Level 1 can open the form; the list is empty | H3, H4, L4 |
| 5 | Connecting and messaging | Connected members see Message, Remove, Report and Block ([screenshot](walkthrough-2026-11/j5-level1-profile-of-level2.jpg)). Contact data stays private in the API. No message threads to open | H4 |
| 6 | Idea to milestone plan | The idea form separates the public summary from the NDA-only details ([screenshot](walkthrough-2026-11/j6-level1-idea-new.jpg)). No ideas or plans exist to continue with | H4, L3 |
| 7 | Training and events | Forms and level messages are correct. Lists are empty | H4, L4 |
| 8 | Safety | The report form has a screenshot upload. A suspended login says "Your account is suspended. An admin will review it." Reports queue empty | L2, H4 |
| 9 | Account care | Privacy, contact sharing, block list, low-data mode, download and delete data, and email recovery with a face photo are all there ([screenshot](walkthrough-2026-11/j9-recover.jpg)). Change password and forgot password fail without email | H1 |
| 10 | Super admin | Daily cap, staff invite and deactivate, platform name, matching weights, legal versions ([screenshot](walkthrough-2026-11/j10-super-settings.jpg)) and audit log with filters all work. The staff invite sends an email, so it fails without email (not tried). The phone layout is good ([screenshot](walkthrough-2026-11/j10-admin-dashboard-phone.jpg)) | H1, M2, M6 |

## Proposed order for Phase 2 onwards

1. **Phase 2:** H4 demo content, then M1 the sign-in choice (the prompt's phase 2).
2. **Phase 3:** M2 Members page and M3 document viewer.
3. **Phase 4:** H1 part 1, email (the Brevo key from the owner, or the test inbox after approval).
4. **Phase 5:** H1 part 2 (no endless spinners), H3 (Level 3 gate), L1, L2, L4 and M5.
5. **Phase 6:** write proposals for H2, M4 "What you sent", M6 and the test inbox.

## Left on the preview by this walkthrough

- Two test sign-ups: `test_amina_walk` and `test_amina_walk2` (pending, `@example.test`). Delete them when the demo seed is loaded.
- One unused password-reset request for `test_level2`. It expires by itself.
