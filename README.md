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

The build issues are the issues labelled `build`, grouped into the Release 1, Release 2 and Mobile apps milestones. Claim one by assigning it to yourself.
