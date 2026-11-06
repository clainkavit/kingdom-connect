# Hosted test environment (6 Nov 2026)

Supabase project `kingdom-connect-test` (ref `palsowodunzxqbbyenvb`, eu-central-1, free plan, test data only) and two Vercel projects on the personal team `light-8f71`: `kingdom-connect-member` (root `apps/member`) and `kingdom-connect-admin` (root `apps/admin`), both linked to `clainkavit/kingdom-connect` with git deployments disabled (deploy by hand).

- Secrets (DB password, service key, OTP and vault keys, seed password) live in the gitignored `.env.hosted` at the repo root. Nothing in git.
- Database: `supabase db push --linked`, then a seed copy with a random password and hosted vault values (the local `supabase/seed.sql` has the known local password and keys, never run it hosted). Legal texts: `pnpm legal:load` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Functions: `supabase functions deploy --use-api`. Secrets: `OTP_SECRET`, `MAIL_FROM`, `MAIL_API_URL`; do not set `DB_URL` hosted, the built-in `SUPABASE_DB_URL` is used.
- Auth: the access token hook and site URL were pushed with `supabase config push` from a temporary folder holding only `[auth]`, so the local config.toml never overwrites the hosted one.
- Vercel deployment protection is on (Vercel login before any page).
- Login needs email: every sign-in sends an OTP through `MAIL_API_URL`, whose payload is Mailpit's format, not Brevo's. Until F08 (#46) is done, nobody can sign in on the hosted site.
- Demo sign-in links: `EXPO_PUBLIC_DEMO_LINKS=1` (member) and `NEXT_PUBLIC_DEMO_LINKS=1` (admin) switch on `detectSessionInUrl`, set only on the two test Vercel projects. A link comes from the Auth admin `generate_link` call (type magiclink, service key from `.env.hosted`, `redirect_to` the site) for a seeded account such as `test.level2@example.test`. Each link works once. Never set these flags on a real environment.
- Vercel Authentication was switched off on both test projects on 6 Nov 2026 for a demo; the sites hold only fake people.
