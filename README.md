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

**Login codes and other emails.** Nothing is really sent locally. Every email the app sends, including the 6-digit login code, appears in the email catcher at http://127.0.0.1:54324.

**Changing the database.** Never edit a migration that is already on `main`. Add a new one with `pnpm db:new`, run `pnpm db:reset` to check it builds from scratch, and add access-rule tests in `supabase/tests/database/` for every new table (PRD section 17).

**Windows.** Install Docker Desktop with the WSL 2 backend (the default) and keep it running. Run the `pnpm db:*` commands from PowerShell or Windows Terminal in the repository folder. The local analytics service is turned off in `supabase/config.toml` because on Windows it would need the Docker daemon exposed over TCP. If `db:start` reports a port in use, another program is on one of the ports above; stop it, or run `pnpm db:stop` first.

The build issues are the issues labelled `build`, grouped into the Release 1, Release 2 and Mobile apps milestones. Claim one by assigning it to yourself.
