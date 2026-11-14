# Kingdom Connect memory

Facts discovered while working, one per file in [memory/](memory/). Not the onboarding manual, see [../CLAUDE.md](../CLAUDE.md) and [../docs/prd.md](../docs/prd.md).

- [Supabase Auth login flow](memory/supabase-auth-login-flow.md): username + password + email OTP second step, lockout and admin approval are mostly custom work on Free/Pro; lockout and attempt-limit hooks are Team-plan only (researched 15 Oct 2026).
- [Build skills](memory/build-skills.md): `implement`, `tdd`, `code-review` and friends installed 2026-10-24 from v1.3.1, per-ticket workflow, what was left out and why.
- [Planning skills v1.3](memory/planning-skills-v1-3.md): skills refreshed to mattpocock/skills v1.3.1 on 2026-10-22, glossary renamed to GLOSSARY.md, and why the setup wizard is skipped here.
- [SMS provider for Tanzania](memory/sms-provider-tanzania.md): per-SMS prices (local TZS 16 to 20, Twilio and Bird USD 0.32 to 0.43), TCRA sender ID rules, Supabase Send SMS hook fit; recommends Africa's Talking with Beem as fallback (researched 14 Nov 2026, #272).
- [Hosted test environment](memory/hosted-test-environment.md): Supabase test project and two Vercel projects exist (6 Nov 2026), how each was set up, where secrets live; sign-in is blocked until F08 mail.
