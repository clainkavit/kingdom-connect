# Kingdom Connect

"People • Opportunities • Growth." A verified, members-only platform for people in Tanzania, open to anyone with a verified identity, piloting with the Mkuyuni Community (Pastor Tony's congregation), on web and mobile. Phase 1 is Tanzania only.

**This folder is the source of truth.** It supersedes the earlier Osborn Ministries Jobs project, built to an older scope. Nothing from that project is used, neither requirements, documents nor code.

## Where things live

- **[docs/prd.md](docs/prd.md)** is the source of truth: requirements, decisions (section 18) and changes since v0.1 (Appendix A). Read it before any task.
- **The [wayfinder map](https://github.com/clainkavit/kingdom-connect/issues/1)** on GitHub Issues tracks every open decision as a ticket. The open questions live there, not in this file.
- **[docs/wayfinding.md](docs/wayfinding.md)** is the tracker doc for the `wayfinder` skill: how to claim, create, block and resolve tickets on GitHub.
- **[.claude/skills/](.claude/skills/)** holds the planning skills (wayfinder, grilling, domain-modeling, research, prototype), so they load for anyone working in this repo.
- **[context/CONTEXT.md](context/CONTEXT.md)** is the glossary. Use its terms.
- **[sources/](sources/)** holds the original Plan v1.1 (frozen, approved church document), PRD v0.1 (superseded) and the use case diagram (outdated). Extracts sit in `context/`.
- **[context/design/](context/design/)** holds the mockup and the clickable dashboard prototype.
- [context/memory.md](context/memory.md) indexes facts discovered while working.

## Rules specific to this project

- **Traceability.** Cite PRD story IDs (REG-1, IDEA-5...) and Plan FR/UC numbers in specs and tickets.
- **Privacy is the product.** Contact details never reach another member's device unless shared inside an accepted connection. The investor flag is never labelled, listed or counted for members. Enforce on the server, not in the UI.
- **Nothing is decided by assumption.** "Proposed" items and open tickets need Champion's and the collaborator's answer.
- **Stack decided 20 Oct.** Expo member app, Next.js admin console, Supabase, Brevo email. See [docs/prd.md](docs/prd.md) section 15. Development uses test data only; production hosting is decided before the pilot.
- No payments of any kind in Phase 1.

## Collaboration

Two people work here. Keep commits small, work on branches, merge through pull requests. Record decisions in the ticket that resolves them and in `docs/prd.md`, not only in chat.

## Not Osborn Pay

`../osborn-pay/` is an unrelated fintech project. Do not merge context.
