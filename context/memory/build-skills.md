---
name: build-skills
description: Which build skills are installed in .claude/skills, the per-ticket workflow, and what was deliberately left out
metadata:
  type: reference
---

Installed 2026-10-24 so both collaborators get identical skills on pull: `implement`, `tdd`, `code-review`, `diagnosing-bugs`, `codebase-design`, `handoff`, `pr`. Source is mattpocock/skills v1.3.1, unmodified (see [[planning-skills-v1-3]]).

- **Workflow per ticket:** claim a `build` issue, branch `build/<key>-<slug>`, `/implement #N` (calls `tdd` then `code-review`, commits to the current branch only), push, PR with `Closes #N`. Details in `docs/agents/issue-tracker.md`.
- **Left out on purpose:** `implement-spec` (builds a whole spec on an integration branch, wrong fit for two people claiming separate tickets), `triage` (only for externally created issues), `setup-matt-pocock-skills` (its outputs were hand-written).
- **Glossary stays at `context/GLOSSARY.md`.** `docs/agents/domain.md` tells skills to read it there.
- **`handoff` writes to the OS temp dir**, not the repo.
- **Not decided yet:** a `CODING_STANDARDS.md` (code-review reads it if present), and who takes which build tickets.
