---
name: google-sign-in-hosted
description: How Continue with Google (R26) is switched on for the hosted test site, the Google client, redirect URLs and what was checked (24 Nov 2026)
metadata:
  type: project
---

# Google sign-in on the hosted test site (24 Nov 2026)

- **Google client.** A Google Cloud project in Champion's own Google account, as #273 allows until the company exists (L01). OAuth client type Web application, client ID starting `394511671084-`. The consent screen is published (not Testing), so any Google account can sign in. Scopes are only `email` and `profile` (Supabase adds `openid`). Without a verified domain, Google shows "to continue to palsowodunzxqbbyenvb.supabase.co", not Kingdom Connect. The client moves to a company account later.
- **Redirect URLs.** Google sends people to `https://palsowodunzxqbbyenvb.supabase.co/auth/v1/callback`, which must be an authorised redirect URI on the client. Supabase then returns them to `window.location.origin + "/"` (`startProviderSignIn` in `apps/member/src/lib/first-sign-in.ts`), which must be in the Auth redirect allow list. Since 24 Nov the allow list holds both member addresses, `https://kingdom-connect-member.vercel.app` and `https://kingdom-connect-member-light-8f71.vercel.app`, plus the admin site. Any other origin (a preview build) falls back to the site URL, the `-light-8f71` address. Local: `[auth.external.google]` in `supabase/config.toml` stays `enabled = false`.
- **Supabase.** The Google provider is enabled in the dashboard (Authentication, Sign In / Providers, Google) with the client ID and secret, set up by Champion. The secret is not in `.env.hosted` or git.
- **Member site.** `EXPO_PUBLIC_GOOGLE_SIGN_IN=1` on the Vercel project `kingdom-connect-member`, production only, added 24 Nov. It is read at build time, so changing it needs a rebuild.
- **Legal texts.** Privacy 0.3 (mentions Google), Terms 0.2 and NDA 0.2 were loaded hosted on 24 Nov with `pnpm legal:load`, so people who get in with Google accept a notice that names it. 0.3 still has `[TO CONFIRM]` gaps and no lawyer review. Both Super Administrators accept the new texts at their next sign-in.
- **Checked 24 Nov:** the live sign-up page shows Continue with Google and it opens Google's account chooser with `redirect_to` the member site. The full sign-in, S01a and a `signed_in` row were not yet tried hosted.
- **Test with a Google account that is not a staff email.** Supabase links a Google identity to the account with the same confirmed email, so the two Super Administrator Gmail addresses would sign in to the staff accounts and still need the email code.

Related: [[hosted-test-environment]], [[phone-sign-in-setup]].
