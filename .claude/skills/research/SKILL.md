---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

## Self-Improvement Loop

At the end of every run of this skill, before ending the turn, review the run:

- Did any step fail, need a workaround, or behave differently than this file describes?
- Did the user correct, reject, or meaningfully rework something this skill produced?
- Did you discover something a future run needs (a changed ID, a tool quirk, a better sequence)?

**The bar:** propose an update ONLY if it would change what a future run actually does, or prevent a repeat of a real mistake. No cosmetic tweaks, no hypothetical improvements, no flagging for the sake of it. Most runs should end with nothing to propose.

If something clears the bar, end the run with:

> **Proposed update to this skill:** [one line — what changes and why]

Wait for approval. On approval, edit this SKILL.md in place (update the relevant section — don't append a changelog). If this skill lives in a git repo, commit and push the change in the same turn.
