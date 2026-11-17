---
name: staff-reset-setup
description: How the staff password reset approved by a Super Administrator (R30) is wired, and the hosted settings it needs
metadata:
  type: project
---

# Staff password reset (R30), as built 18 Nov 2026

- **Flow.** Admin `/forgot-password` calls `staff-reset-request` (no sign-in, same answer for any email), which adds a waiting row to `private.staff_resets` and queues Y2 to the other active Super Admins. In Settings, Staff accounts, the `staff-access` function sends the link (Y3, emailed straight from the function so the token is never stored or queued; only its SHA-256 hash is kept), refuses (Y4) or unlocks. The link opens `/set-password?reset=<id>&token=<token>`; `staff-reset-finish` checks it, saves the password with the Auth admin API, then ends every session, clears the lockout, marks the row used and queues E7.
- **The link points at `ADMIN_URL`** (edge secret; `http://localhost:3000` locally). Set it to the hosted admin address before using this on a hosted project.
- **Supabase Auth's own recovery and magic-link emails** use `supabase/templates/no-link.html`, which carries no link or code. Their sessions cannot be told apart from phone sign-in in the access token hook (both report `otp`), so the template is the guard. On a hosted project, paste the same template into the dashboard (Auth, Email templates, Reset password and Magic link), or anyone who reads an inbox can set a password without R30 or REG-6.
- **A sole Super Admin** cannot reset their own password this way; keep at least two.

Related: [[phone-sign-in-setup]], [[hosted-test-environment]].
