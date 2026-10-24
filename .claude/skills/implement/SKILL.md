---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

## Self-Improvement Loop

At the end of every run of this skill, before ending the turn, review the run:

- Did any step fail, need a workaround, or behave differently than this file describes?
- Did the user correct, reject, or meaningfully rework something this skill produced?
- Did you discover something a future run needs (a changed ID, a tool quirk, a better sequence)?

**The bar:** propose an update ONLY if it would change what a future run actually does, or prevent a repeat of a real mistake. No cosmetic tweaks, no hypothetical improvements, no flagging for the sake of it. Most runs should end with nothing to propose.

If something clears the bar, end the run with:

> **Proposed update to this skill:** [one line — what changes and why]

Wait for approval. On approval, edit this SKILL.md in place (update the relevant section — don't append a changelog). If this skill lives in a git repo, commit and push the change in the same turn.
