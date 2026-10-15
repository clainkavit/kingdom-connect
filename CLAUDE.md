# Kingdom Connect

"People • Opportunities • Growth." A verified, members-only platform where the Mkuyuni Community (Pastor Tony's congregation) finds people, opportunities and ideas, on web and mobile. Phase 1 is Tanzania only, NIDA-verified.

**This folder is the source of truth.** It supersedes the earlier Osborn Ministries Jobs project (Champion's workspace, `../osborn-ministries-jobs/`), built to an older scope. Do not pull requirements from it; its code is reference only.

## Source documents (authoritative, in [sources/](sources/))

| File | What it is | Authority |
|---|---|---|
| [Kingdom_Connect_Project_Plan_v1.1.docx](sources/Kingdom_Connect_Project_Plan_v1.1.docx) | Project Plan v1.1, 14 Oct 2026. FR-01 to FR-49, UC-01 to UC-43. | Scope and intent |
| [Kingdom-Connect-PRD-v0.1.pdf](sources/Kingdom-Connect-PRD-v0.1.pdf) | PRD v0.1 draft, 14 Oct 2026. Buildable requirements, user stories, acceptance criteria. | What to build. Items marked "Proposed" are changeable defaults |
| [Church-Connect-Platform-Use-Case-Diagram.pdf](sources/Church-Connect-Platform-Use-Case-Diagram.pdf) | Use case diagram, UC01 to UC21. | **Outdated.** Pre-v1.1 (no business levels, ideas pool, training, events, tenders). Do not treat as current |

Readable extracts: [context/project-plan-v1.1.md](context/project-plan-v1.1.md) and [context/prd-v0.1.txt](context/prd-v0.1.txt) (plain-text layout extract). If an extract and its source differ, the source wins. If the Plan and PRD disagree, the PRD is more specific, but flag the conflict to Champion rather than choosing.

## Read before any task

[context/overview.md](context/overview.md) has the decisions, roles, release plan and open questions in one page. Read it first. [context/memory.md](context/memory.md) indexes facts discovered while working.

## Rules specific to this project

- **Traceability.** Cite PRD story IDs (REG-1, IDEA-5...) and Plan FR/UC numbers in specs and tickets.
- **Privacy is the product.** Contact details never reach another member's device unless shared inside an accepted connection. The investor flag is never labelled, listed or counted for members. Enforce on the server, not in the UI.
- **Nothing is decided by assumption.** "Proposed" items and the three open questions (agreements/e-signing, cloud provider and region, admin team size) need Champion's or the Technical Committee's answer.
- **No stack chosen yet.** The new Plan and PRD do not name one. The old project used Next.js, Supabase, Vercel. Do not carry that over without a decision.
- No payments of any kind in Phase 1.

## Collaboration

Two people work here. Keep commits small, work on branches, merge through pull requests. Record decisions in [context/overview.md](context/overview.md), not only in chat.

## Not Osborn Pay

`../osborn-pay/` is an unrelated fintech project. Do not merge context.
