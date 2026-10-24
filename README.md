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
