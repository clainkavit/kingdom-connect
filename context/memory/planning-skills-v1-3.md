---
name: planning-skills-v1-3
description: How the planning skills in .claude/skills were refreshed to mattpocock/skills v1.3.1, and why the setup wizard is not needed in this repo
metadata:
  type: reference
---

Refreshed 2026-10-22 from mattpocock/skills v1.3.1: `domain-modeling`, `grilling`, `prototype`, `research`, `wayfinder` in [../.claude/skills/](../.claude/skills/). Each `SKILL.md` ends with Champion's Self-Improvement Loop block, which upstream does not have.

- **Glossary is `context/GLOSSARY.md`**, renamed from `CONTEXT.md` because v1.3 renamed the convention. `domain-modeling` now looks for `GLOSSARY.md`, and `GLOSSARY-FORMAT.md` replaced `CONTEXT-FORMAT.md`. The glossary stays in `context/`, not the repo root.
- **Do not run `/setup-matt-pocock-skills` here.** It writes `docs/agents/issue-tracker.md`, `domain.md` and `triage-labels.md`. This repo already has [../docs/wayfinding.md](../docs/wayfinding.md) as its tracker doc, pointing at GitHub issue #1, so the wizard would duplicate it.
- **Re-sync by merge, not overwrite.** Take the upstream files, then re-append the Self-Improvement Loop block. The workspace-wide procedure is in `me/context/memory/skill-workflow-conventions.md` in the parent repo.
- **Collaborator:** these copies are committed so the collaborator gets the same skills on pull. They were pushed in commit c099d7d.
