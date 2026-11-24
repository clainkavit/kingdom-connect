---
name: check-app
description: Launch Kingdom Connect locally, sign in as any test account, drive a screen or a whole flow, and save screenshots and video as proof. Use to verify a change in the running app, reproduce a bug before fixing it, show how a screen looks, or gather proof for a pull request. Also use when asked "how does X look now" or "does X work".
---

# Check the app

"It compiles" and "the tests pass" are not proof. Proof is the running app: screenshots, and a video for a flow. This skill drives `pnpm app`, a CLI in `tools/app/`. Every command prints JSON; on failure it prints `error` and `fix`. Do what `fix` says.

Local only, web only: the member app at http://localhost:8081 and the admin console at http://localhost:3000, against the local Supabase stack with test data. Never point it at the hosted site.

## When

- **Before a fix:** reproduce the bug in the running app first. If it does not reproduce, say so and stop.
- **After a change someone can see:** show it. `docs/agents/issue-tracker.md` makes this the rule for build pull requests.
- **When asked how something looks or works now.**

## Steps

1. `pnpm app up`. Starts Docker Desktop, Supabase (with Mailpit and the edge functions) and both apps, reusing what runs. Takes up to a few minutes cold.
2. Find the screen: `pnpm app map <word>` reads [docs/feature-map.md](../../../docs/feature-map.md): route, how a person reaches it, who may see it, which e2e test proves it.
3. Pick the person: `pnpm app accounts`. Seeded: `applicant`, `level1`, `level2`, `level3`, `investor`, `suspended`, `admin`, `superadmin`. If the check needs a state the seed lacks, `pnpm app scenario --list`, then `pnpm app scenario <name>` (add `--dry-run` first if unsure). Scenarios only add fresh fake members; they never delete.
4. One screen: `pnpm app shot <route> --as <account>` or `--guest member|admin`. Members default to a phone screen, staff to a computer; `--device` changes it.
5. A flow: write a check script and run `pnpm app check <file> --video`. Reusable checks live in `tools/app/checks/`; copy one as a start. Throwaway checks go in your scratchpad, not the repo.
6. Look at every screenshot you cite. Proof you have not looked at is not proof. Files land in `proof/<branch>/` (gitignored).
7. Report: what you checked, as whom, what you saw, and the file paths. Say plainly if something looked wrong, even outside the task.

## Writing a check

```ts
import { defineCheck, expect } from "../check";

export default defineCheck(async ({ as, guest, step, scenario, emailCode, note }) => {
  const made = await scenario("worked-together");
  const poster = await as("wt-poster");
  await poster.goto(String(made.responsesPage));
  await step(poster, "responses");
});
```

- `as(account)` opens a page already signed in (it signs in through the real form and the Mailpit code, then reuses the saved sign-in). `guest(app)` opens a signed-out page. Each person gets their own browser context, so two people can act in one check.
- `step(page, name)` saves a numbered screenshot. Import `expect` from `../check`, not from Playwright: it waits 20 seconds like the e2e tests.
- Find elements by role and label, as the e2e tests in `e2e/` do. Copy their selectors.
- **Prove the page has drawn before you assert something is gone.** `toHaveCount(0)` passes at once on a page that has not rendered yet. Put a `toBeVisible()` on something that only shows once the page loaded on the line before it. `tools/app/checks.test.ts` fails a check that skips this.
- **Match text exactly.** `getByText("Verified member")` ignores case and matches part of a sentence, so it also finds "Verified members see each other here". Pass `{ exact: true }` for any text that proves a state.
- The member app scrolls inside an inner panel, so `{ full: true }` only helps in the admin console. In the member app, `scrollIntoViewIfNeeded()` the part you want, then `step`.
- On failure the runner saves `*-failed-*.png` for every open page. Open them before guessing.

## Things that go wrong

- **"Wrong username or password" for a seeded account:** the edge functions are down. `pnpm app up` restarts them. `pnpm app status` shows `functions`.
- **Locked account:** five wrong passwords lock it for 15 minutes. `pnpm app reset --dry-run` explains the reset; only run `--yes` when the user agrees, because it deletes all local data.
- **Email codes are limited per account per hour.** Saved sign-ins avoid most codes. Do not loop sign-ins.
- **The app shows old behaviour after an edit, or after switching branch:** a member app started with `CI=1` (as `pnpm e2e` does) does not watch files. Run `pnpm app down`, then `pnpm app up`. Never trust a passing check whose screenshots show otherwise.
- `pnpm app down` stops the two app servers it started; Docker and Supabase keep running.

## Keep the map true

A new screen needs a row in `docs/feature-map.md`. `tools/app/feature-map.test.ts` fails when a screen has no row or a row names a missing screen or test. If a "How to get there" turned out wrong while you checked, fix the row.
