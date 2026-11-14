# Kingdom Connect

People • Opportunities • Growth. Requirements and planning repo for the Kingdom Connect platform.

- Start with [CLAUDE.md](CLAUDE.md), then [docs/prd.md](docs/prd.md).
- Open decisions are tracked on the [wayfinder map](https://github.com/clainkavit/kingdom-connect/issues/1).
- Source documents are in [sources/](sources/).

## How we work

1. **Pick a ticket.** Open the [map](https://github.com/clainkavit/kingdom-connect/issues/1) and choose a ticket that is open, not blocked, and not assigned to anyone.
2. **Claim it.** Assign it to yourself before starting, so we never work the same ticket twice.
3. **Work it with Claude Code.** In this repo, ask Claude to run `/wayfinder` on the map and the ticket. The skill and its helpers are in `.claude/skills/`; how they use GitHub is in [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
4. **Branch and pull request.** Make changes on a branch and open a pull request. The other person reviews and merges.
5. **Record the decision.** Post the answer on the ticket, close it, and add one line to the map's "Decisions so far". Update [docs/prd.md](docs/prd.md) if requirements changed.

## Development

The code lives in a pnpm workspace:

| Folder | What it is |
|---|---|
| `apps/member` | The member app: Expo (React Native) universal app, web first |
| `apps/admin` | The admin console: Next.js |
| `packages/shared` | Types and business rules shared by both apps, with unit tests |

You need Node 22 or newer and pnpm.

```sh
pnpm install              # also sets up the Husky commit gate
pnpm member:web           # run the member app in a browser
pnpm admin                # run the admin console on http://localhost:3000
pnpm typecheck            # TypeScript check in every package
pnpm test                 # Vitest in watch mode (pnpm test:run runs once)
```

Every commit runs Prettier on the staged files, then the typecheck, then the tests. A failing step blocks the commit.

**Screen text.** Every string either app shows lives in [packages/shared/src/strings](packages/shared/src/strings): `en.ts` and `sw.ts`. Add a key to both. A key missing from `sw.ts` fails the typecheck. The platform name is never typed in; it comes from `platform_settings`.

### Checks on pull requests

GitHub Actions runs on every pull request to `main` and every push to `main` ([.github/workflows/ci.yml](.github/workflows/ci.yml)): format, lint, typecheck and unit tests; the database access-rule tests; and the end-to-end tests when app code changes. A failing check marks the pull request red. **Never merge on red** (PRD section 17).

### Local database

Each developer runs the whole Supabase stack (Postgres, Auth, Storage, Studio and an email catcher) on their own machine in Docker, with test data only. You need **Docker Desktop**, running, before these commands work. The Supabase CLI comes with `pnpm install`.

```sh
pnpm db:start             # start the local stack (the first run downloads a few GB of images)
pnpm db:reset             # rebuild an empty database from supabase/migrations, then load the seed
pnpm db:test              # run the database tests in supabase/tests (pgTAP)
pnpm db:new <name>        # create a new migration file in supabase/migrations
pnpm db:status            # show local URLs and keys
pnpm db:stop              # stop the stack
```

| What | Where |
|---|---|
| API | http://127.0.0.1:54321 |
| Database | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (browse tables) | http://127.0.0.1:54323 |
| Email catcher | http://127.0.0.1:54324 |

**Test accounts.** `pnpm db:reset` loads [supabase/seed.sql](supabase/seed.sql): fake people for every role, safe to load again. All of them use the password `kingdom-test-only`. Never use real names, ID numbers or phone numbers in test data (PRD section 17).

**Demo content.** `pnpm demo:load` adds [supabase/demo/demo-seed.sql](supabase/demo/demo-seed.sql) on top of the seed: 12 more fake members across regions (two waiting for review, with generated ID, face and business-document images), opportunities with a tender PDF and CVs, ideas with an NDA partner and a signed milestone plan, trainings, events, news, conversations with a photo and a PDF, and open reports. It refuses to run unless `test_data_only` is on, and it is safe to run again. Set `DEMO_PASSWORD` (the demo accounts' password); for a hosted project also set `DB_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The images are generated shapes, never real faces.

**Member or staff.** Set `EXPO_PUBLIC_ADMIN_URL` on the member app and `NEXT_PUBLIC_MEMBER_URL` on the admin console to show "I'm a member / I'm staff" on the member app's landing and log-in, and "Not staff? Go to the member app" on the staff log-in. Left unset, neither shows.

| Role | Email | Username |
|---|---|---|
| Applicant (pending) | test.applicant@example.test | test_applicant |
| Level 1 Member, connected to test_level2 | test.level1@example.test | test_level1 |
| Level 2 Member | test.level2@example.test | test_level2 |
| Level 3 Member | test.level3@example.test | test_level3 |
| Level 1 Member with the investor flag (never shown to other Members) | test.level1b@example.test | test_level1b |
| Suspended Member | test.suspended@example.test | test_suspended |
| Administrator | test.admin@example.test | |
| Super Administrator | test.superadmin@example.test | |

**Signing in locally.** Members sign in with their username and Administrators with their email, then type the 6-digit code from the email catcher. Five wrong passwords lock an account for 15 minutes; `pnpm db:reset` clears every lock.

**Notifications.** `private.notify(member, kind, payload)` stores a notification and queues its email; `send-notification-emails` sends the queue every minute (pg_cron, through pg_net), and a daily job queues the message digest. The copy comes from [docs/notifications.md](docs/notifications.md): after editing it, run `pnpm notifications`. Locally the seed stores the function URL and key in Vault. Production needs two Vault secrets set by hand: `functions_url` (the project's `https://<ref>.supabase.co/functions/v1`) and `service_role_key`.

**Registration.** `sign-up`, `save-identity` and `submit-registration` are Edge Functions. The ID number is encrypted with Vault keys `id_encryption_key` and `id_fingerprint_key`; the local seed sets throwaway values. Production needs its own long random values for both, set once and never changed (a new fingerprint key would stop duplicate checks matching older IDs), and `test_data_only` left off. The rules shared with the functions live in `packages/shared/src/registration-rules.ts`; after changing them, run `pnpm generate`.

**Verification queue.** Staff approve, reject, mark a suspected duplicate and reveal an ID number through the `decide-application`, `mark-duplicate` and `reveal-id-number` Edge Functions; each action is written to the audit log. The rejection reasons are rows in `rejection_reasons`, in English and Kiswahili.

**Staff accounts.** A Super Administrator invites staff from Settings (A16) through the `create-staff` Edge Function, which sends the sign-in service's invite email (`supabase/templates/invite.html`). The link opens `/set-password` on the admin console and works for 24 hours (`otp_expiry` in `supabase/config.toml`). Locally the email lands in Mailpit. Production needs the auth SMTP settings, the same invite template, `otp_expiry` of 86400 and the site URL set to the admin console's address.

**Legal texts.** The five texts live in [legal/](legal/) as `<kind>.en.md` and `<kind>.sw.md`, each with a version header. `pnpm db:reset` loads them; `pnpm legal:load` loads a new version on its own. A loaded version never changes: to change wording, raise the version, and members accept the new terms or privacy notice at their next sign-in. To load into a hosted project, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Real registrations stay closed (`real_registrations_open`) until all five are approved at 1.0.

**Login functions.** `supabase/functions/` holds the `login`, `verify-otp` and `resend-otp` Edge Functions. Their local settings (`MAIL_API_URL`, `DB_URL`, `OTP_SECRET`) sit under `[edge_runtime.secrets]` in `supabase/config.toml` and work only on this machine. Production needs its own long random `OTP_SECRET` and the access token hook switched on in the Supabase dashboard. `pnpm typecheck` also checks the functions with Deno.

**End-to-end tests.** `pnpm e2e` runs the Playwright browser tests in `e2e/` against the local stack. It starts the member app on port 8081 and the admin console on port 3000, or reuses them if they are already running (set `MEMBER_URL` and `ADMIN_URL` to use other ports). Run `pnpm db:start` first, and once `pnpm exec playwright install chromium`.

**Login codes and other emails.** Nothing is really sent locally. Every email the app sends, including the 6-digit login code, appears in the email catcher at http://127.0.0.1:54324.

**Real email (Brevo).** On a deployed project the Edge Functions send through Brevo's transactional API when the function secret `BREVO_API_KEY` is set, and through the catcher address `MAIL_API_URL` otherwise. Set the secrets from your own terminal, never in a file in the repo, and **from an empty folder, not the repo folder**: `supabase secrets set` and `supabase functions deploy` also push the `[edge_runtime.secrets]` of `supabase/config.toml` (the local `MAIL_FROM`, `OTP_SECRET`, `MAIL_API_URL` and `DB_URL`) to the project, which breaks sign-in and puts the public local code secret on the hosted project. In an empty folder run `<path to the repo>/node_modules/.bin/supabase secrets set BREVO_API_KEY=<key> MAIL_FROM=<sender> --project-ref <ref>`, then check with `supabase secrets list` that `DB_URL` is not there. `MAIL_FROM` must be a sender that Brevo has verified, on a domain with SPF and DKIM set up in Brevo (Senders, Domains and dedicated IPs). Every email sent is counted per day; at 200 the Super Administrators get a security alert, because Brevo's free plan stops at 300 a day, and the answer is to move to the paid plan or send less.

**Changing the database.** Never edit a migration that is already on `main`. Add a new one with `pnpm db:new`, run `pnpm db:reset` to check it builds from scratch, and add access-rule tests in `supabase/tests/database/` for every new table (PRD section 17).

**Windows.** Install Docker Desktop with the WSL 2 backend (the default) and keep it running. Run the `pnpm db:*` commands from PowerShell or Windows Terminal in the repository folder. The local analytics service is turned off in `supabase/config.toml` because on Windows it would need the Docker daemon exposed over TCP. If `db:start` reports a port in use, another program is on one of the ports above; stop it, or run `pnpm db:stop` first.

The build issues are the issues labelled `build`, grouped into the Release 1, Release 2 and Mobile apps milestones. Claim one by assigning it to yourself.

## Deploying to Vercel

Both apps are hosted on Vercel (PRD section 15). Make two Vercel projects from this repository; Vercel installs with pnpm from the repository root.

| Project | Root directory | Framework | Build |
|---|---|---|---|
| Member app | `apps/member` | Other | From [apps/member/vercel.json](apps/member/vercel.json): `expo export -p web` into `dist`, every path served by `index.html`, hashed files cached for a year |
| Admin console | `apps/admin` | Next.js | Vercel's default |

Settings (Project → Settings → Environment Variables):

| Project | Name | Value |
|---|---|---|
| Member app | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The Supabase project's URL and anon key |
| Member app | `EXPO_PUBLIC_SENTRY_DSN` | The DSN of the Sentry project `kingdom-connect-member` |
| Admin console | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The same Supabase values |
| Admin console | `NEXT_PUBLIC_SENTRY_DSN` | The DSN of the Sentry project `kingdom-connect` |

Without a Sentry DSN nothing is sent, so local development and previews report nothing unless you add one. Before a report leaves the device, `scrubEvent` ([packages/shared/src/monitoring.ts](packages/shared/src/monitoring.ts)) removes the member, extra data, request headers, cookies, bodies, query strings and console output, and blanks out email addresses, phone numbers and ids in error messages, breadcrumbs and URLs. It works on patterns, so it cannot promise to catch every personal detail; keep personal data out of error messages in the first place.

The member app installs to a phone's home screen from the browser menu ("Add to Home screen"), using [apps/member/public/manifest.json](apps/member/public/manifest.json).
