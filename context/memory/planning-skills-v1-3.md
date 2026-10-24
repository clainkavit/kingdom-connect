---
name: planning-skills-v1-3
description: How the planning skills in .claude/skills were refreshed to mattpocock/skills v1.3.1, and why the setup wizard is not needed in this repo
metadata:
  type: reference
---

Refreshed 2026-10-22 from mattpocock/skills v1.3.1: `domain-modeling`, `grilling`, `prototype`, `research`, `wayfinder` in [../.claude/skills/](../.claude/skills/). The copies match upstream; no personal additions live in this repo.

- **Glossary is `context/GLOSSARY.md`**, renamed from `CONTEXT.md` because v1.3 renamed the convention. `domain-modeling` now looks for `GLOSSARY.md`, and `GLOSSARY-FORMAT.md` replaced `CONTEXT-FORMAT.md`. The glossary stays in `context/`, not the repo root.
- **Do not run `/setup-matt-pocock-skills` here.** On 2026-10-24 its outputs were hand-written instead: [../docs/agents/issue-tracker.md](../docs/agents/issue-tracker.md) (absorbed the old `docs/wayfinding.md`) and [../docs/agents/domain.md](../docs/agents/domain.md). There is no `triage-labels.md` because `triage` is not installed. The setup skill is not installed in the repo either.
- **Re-sync by merge, not overwrite.** Take the upstream files and merge; there is nothing local to re-apply.
- **Collaborator:** these copies are committed so the collaborator gets the same skills on pull. They were pushed in commit c099d7d.
