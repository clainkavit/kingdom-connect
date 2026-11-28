# Kingdom Connect memory

Facts discovered while working, one per file in [memory/](memory/). Not the onboarding manual, see [../CLAUDE.md](../CLAUDE.md) and [../docs/prd.md](../docs/prd.md).

- [Supabase Auth login flow](memory/supabase-auth-login-flow.md): username + password + email OTP second step, lockout and admin approval are mostly custom work on Free/Pro; lockout and attempt-limit hooks are Team-plan only (researched 15 Oct 2026).
- [Build skills](memory/build-skills.md): `implement`, `tdd`, `code-review` and friends installed 2026-10-24 from v1.3.1, per-ticket workflow, what was left out and why.
- [Planning skills v1.3](memory/planning-skills-v1-3.md): skills refreshed to mattpocock/skills v1.3.1 on 2026-10-22, glossary renamed to GLOSSARY.md, and why the setup wizard is skipped here.
- [SMS provider for Tanzania](memory/sms-provider-tanzania.md): per-SMS prices (local TZS 16 to 20, Twilio and Bird USD 0.32 to 0.43), TCRA sender ID rules, Supabase Send SMS hook fit; recommends Africa's Talking with Beem as fallback (researched 14 Nov 2026, #272).
- [Hosted test environment](memory/hosted-test-environment.md): Supabase test project and two Vercel projects (6 Nov 2026), how each was set up, where secrets live; emptied for real testers and demo extras removed (24 Nov 2026), two Super Administrators, Auth email gaps, the server is deployed by hand and the stored DB password fails.
- [Phone sign-in setup](memory/phone-sign-in-setup.md): how R29 phone sign-in is wired (Auth OTP plus our 10-minute, 3-attempt check), the local test sender, and the hosted settings and secrets it needs before it is switched on (18 Nov 2026).
- [Staff reset setup](memory/staff-reset-setup.md): how R30 staff password resets approved by a Super Admin are wired, the `ADMIN_URL` secret and the no-link Auth email templates a hosted project must copy (18 Nov 2026).
- [Google sign-in on the hosted site](memory/google-sign-in-hosted.md): the Google client in Champion's account, the callback and allow-list URLs, the Vercel switch and the 0.3 legal texts loaded for it (24 Nov 2026).
- [Member web speed](memory/member-web-speed.md): measured load times, the boot screen, the cut-down fonts and how to rerun the throttled speed test (18 Nov 2026).
- [Public listing sources](memory/public-listing-sources.md): the public endpoints the O19 import reads for NeST tenders, Ajira vacancies and CRDB jobs, what each lacks (NeST fees and per-tender links), how Ajira's PDF adverts are read, and the Gemini secret and its free-tier data rule (27 to 28 Nov 2026).
