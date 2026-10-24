---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Self-Improvement Loop

At the end of every run of this skill, before ending the turn, review the run:

- Did any step fail, need a workaround, or behave differently than this file describes?
- Did the user correct, reject, or meaningfully rework something this skill produced?
- Did you discover something a future run needs (a changed ID, a tool quirk, a better sequence)?

**The bar:** propose an update ONLY if it would change what a future run actually does, or prevent a repeat of a real mistake. No cosmetic tweaks, no hypothetical improvements, no flagging for the sake of it. Most runs should end with nothing to propose.

If something clears the bar, end the run with:

> **Proposed update to this skill:** [one line — what changes and why]

Wait for approval. On approval, edit this SKILL.md in place (update the relevant section — don't append a changelog). If this skill lives in a git repo, commit and push the change in the same turn.
