# Feature Map

Every screen in both apps: where it lives, how a person reaches it, who may open it and which end-to-end test proves it. The `/check-app` skill and `pnpm app map` read this file. A unit test (`tools/app/feature-map.test.ts`) fails when a screen exists in `apps/member/app` or `apps/admin/src/app` without a row here, or a row names a screen or test that does not exist.

Screen IDs (S.., A..) are the ones in [docs/screens.md](screens.md), which traces each screen to its PRD stories. Accounts are the `pnpm app accounts` names. "Look" means a signed-in person who is not verified yet may open it read-only (R27, `lookAllows` in `packages/shared/src/navigation.ts`).

When you add a screen, add its row in the same pull request.

## Member app (`http://localhost:8081`)

| Route | Screen | What it is | How to get there | Who can see it | Proved by |
|---|---|---|---|---|---|
| `/welcome` | S01 | First page for visitors: what the platform is, sign-in ways, Log in | Open the app signed out | Anyone | member.perf-audit.spec.ts |
| `/sign-up` | S01 | Create an account: each enabled sign-in way, or the email form | Welcome > Create an account | Anyone | member.registration.spec.ts |
| `/login` | S03 | Log in with username, phone or email and password | Welcome > Log in | Anyone | member.login.spec.ts |
| `/verify` | S03 | Email code after the password | Log in > after the password | Anyone mid sign-in | member.login.spec.ts |
| `/phone-sign-in` | S04b | Sign in with a phone number and SMS code | Welcome > Continue with phone number | Anyone, when `EXPO_PUBLIC_PHONE_SIGN_IN` is on | member.phone-sign-in.spec.ts |
| `/first-sign-in` | S01a | Choose a username and accept both texts after a first Google sign-in | Continue with Google, first time | Signed in, no account yet | member.first-sign-in.spec.ts |
| `/forgot-password` | A19 | Ask for a password reset | Log in > Forgot password | Anyone | member.forgot-password.spec.ts |
| `/recover` | S04, S04a | Recover an account when the email is lost | Log in > Lost access to your email | Anyone | member.recovery.spec.ts |
| `/terms` | | Terms of use | Welcome or Sign up > Terms of use link | Anyone | member.legal.spec.ts |
| `/privacy` | | Privacy notice | Welcome or Sign up > Privacy notice link | Anyone | member.legal.spec.ts |
| `/demo` | | Opens a one-time demo sign-in link (test sites only) | A demo link `/demo#t=...` | Anyone, only when `EXPO_PUBLIC_DEMO_LINKS` is on | |
| `/wrong-app` | | Tells staff to use the admin console | Staff signs in to the member app | Staff | |
| `/registration` | S05 | The five identity steps and Send to staff | Home > Verify your identity, or Profile > Verify | Look (applicant) | member.registration.spec.ts |
| `/profile/verify` | S05 | Verification status and the steps inside the profile | Account > My profile > Verify your identity | Look | member.look-not-act.spec.ts |
| `/` | S08 | Home | Home tab | Look | member.journey.spec.ts |
| `/[section]` | | Fallback for a menu section without its own screen: redirects Home | A menu link with no screen | Look | |
| `/more` | | Phone overflow menu | More tab (phone) | Look | |
| `/account` | | Account page: My profile, News, Reports & Safety, Settings, language, Log out | Person icon in the header | Look | member.registration.spec.ts |
| `/search` | | Search across people, opportunities and ideas | Search icon in the header | Verified Member | member.search.spec.ts |
| `/notifications` | | Notification list | Bell icon in the header | Verified Member | member.notifications.spec.ts |
| `/notifications/settings` | | Which notifications arrive by email or push | Notifications > Settings | Verified Member | member.notifications.spec.ts |
| `/people` | S10 | Member directory, People you may know, Near you | People tab | Verified Member (Look sees a locked page) | member.directory.spec.ts |
| `/connections` | S13 | My connections and requests | People > My connections | Verified Member | member.connections.spec.ts |
| `/profile` | S11 | My profile, skills and work references | Account > My profile | Verified Member | member.profile.spec.ts |
| `/profile/edit` | | Edit my profile | My profile > Edit | Verified Member | member.profile.spec.ts |
| `/profile/[id]` | S11 | Another member's profile, connect, message, report | People > a member | Verified Member | member.profile.spec.ts |
| `/business` | S40, S41 | Apply for Level 2 and 3 business verification | Account > My profile > Business | Verified Member | member.business.spec.ts |
| `/messages` | S14 | Message threads | Messages tab | Verified Member, connected people only | member.messaging.spec.ts |
| `/messages/[id]` | S15 | One conversation | Messages > a thread | Verified Member in the thread | member.messaging.spec.ts |
| `/opportunities` | S16 | Opportunity list, filters, Best matches | Opportunities tab | Look | member.browse-opportunities.spec.ts |
| `/opportunities/[id]` | S16 | One opportunity: apply or express interest, save, report | Opportunities > an opportunity | Look (acting needs verification) | member.respond.spec.ts |
| `/opportunities/new` | S20 | Post an opportunity | Opportunities > Post | Opportunity Poster (Level 3) | member.poster.spec.ts |
| `/opportunities/[id]/edit` | S20 | Edit my post | My posts > a post > Edit | The poster | member.picks.spec.ts |
| `/opportunities/[id]/responses` | S21 | Responses to my post, shortlist, Mark as hired | My posts > a post > Responses | The poster | member.work-references.spec.ts |
| `/opportunities/[id]/pick` | S50 | Let Kingdom Connect pick for my post | My posts > a post > Let Kingdom Connect pick | The poster | member.picks.spec.ts |
| `/opportunities/mine` | S21 | My posts | Opportunities > My posts | Opportunity Poster | member.respond.spec.ts |
| `/opportunities/responses` | | My responses: applications and interests I sent | Opportunities > My responses | Verified Member | member.respond.spec.ts |
| `/opportunities/saved` | S16 | Saved opportunities | Opportunities > Saved | Verified Member | member.saved.spec.ts |
| `/opportunities/scan` | | Scan: opportunities that fit my skills | Opportunities > Scan | Verified Member | member.scan.spec.ts |
| `/picked` | S51 | Posts Kingdom Connect picked me for | Home > Picked for you | Verified Member | member.picks.spec.ts |
| `/work` | S52 | Work I did or hired for: confirm work, rate it | Account > My profile > Work, or a notification | Verified Member | member.work-references.spec.ts |
| `/work/[id]` | S53 | Rate one piece of confirmed work | Work > Rate the work | Both sides of the work | member.work-references.spec.ts |
| `/growth` | | Growth hub: Ideas, Training, Events, Milestone plans | Growth tab | Look | member.journey.spec.ts |
| `/ideas` | S22 | Ideas pool | Growth > Ideas | Look | member.idea-access.spec.ts |
| `/ideas/[id]` | S23 | One idea's public summary, request access | Ideas > an idea | Look (requesting needs verification) | member.idea-access.spec.ts |
| `/ideas/[id]/details` | S26 | An idea's confidential details | Idea > Open details, after access and the email code | Owner, approved requesters | member.idea-access.spec.ts |
| `/ideas/new` | S27 | Share an idea | Ideas > Share an idea | Verified Member | member.idea-access.spec.ts |
| `/ideas/mine` | S27 | My ideas and access requests | Ideas > My ideas | Verified Member | member.idea-access.spec.ts |
| `/ideas/saved` | S29 | Saved ideas | Ideas > Saved | Verified Member | |
| `/ideas/investor` | S29 | Investor list and filters | Ideas > Investor view | Members with the investor flag only (`investor` account) | |
| `/training` | S35 | Training & Courses | Growth > Training | Look | member.training-waitlist.spec.ts |
| `/training/[id]` | S35 | One training: join or waitlist | Training > a training | Look (joining needs verification) | member.training-waitlist.spec.ts |
| `/training/new` | S37 | Post a training | Training > Post | Verified Member | |
| `/events` | S38 | Events | Growth > Events | Look | |
| `/events/[id]` | S38 | One event | Events > an event | Look | |
| `/events/new` | S38 | Post an event | Events > Post | Verified Member | |
| `/plans` | S30 | Milestone plans | Growth > Milestone plans | Verified Member | member.milestone-plan.spec.ts |
| `/plans/new` | S31 | Start a milestone plan | Milestone plans > New | Idea partners past the NDA | member.milestone-plan.spec.ts |
| `/plans/[id]` | S31 | One milestone plan | Milestone plans > a plan | The plan's members | member.milestone-plan.spec.ts |
| `/news` | S39 | News | Account > News | Look | member.journey.spec.ts |
| `/reports` | S43 | Reports & Safety: my reports | Account > Reports & Safety | Verified Member | member.reports.spec.ts |
| `/report` | S43 | Report a person, post or thread | Report on a profile, post or thread | Verified Member | member.report-opportunity.spec.ts |
| `/settings` | S44 | Settings | Account > Settings | Verified Member | member.my-data.spec.ts |
| `/settings/privacy` | S45 | Privacy and contact sharing, change email or phone | Settings > Privacy | Verified Member | member.contact-sharing.spec.ts |
| `/settings/alerts` | S16 | Job alerts | Settings > Job alerts | Verified Member | member.job-alerts.spec.ts |
| `/settings/data` | S49 | Download or delete my data | Settings > My data | Verified Member | member.my-data.spec.ts |

## Admin console (`http://localhost:3000`)

| Route | Screen | What it is | How to get there | Who can see it | Proved by |
|---|---|---|---|---|---|
| `/login` | | Staff log in with email and password | Open the console signed out | Anyone | admin.login.spec.ts |
| `/verify` | | Email code after the password | Log in > after the password | Staff mid sign-in | admin.login.spec.ts |
| `/forgot-password` | A19 | Ask a Super Admin for a password reset | Log in > Forgot password | Anyone | admin.staff-reset.spec.ts |
| `/set-password` | | Set a new password from an approved reset link | The link in the reset email | Staff with a reset link | admin.staff-reset.spec.ts |
| `/demo` | | Opens a one-time demo sign-in link (test sites only) | A demo link `/demo#t=...` | Anyone, only when `NEXT_PUBLIC_DEMO_LINKS` is on | |
| `/wrong-app` | | Tells members to use the member app | A member signs in to the console | Members | |
| `/` | A01 | Admin dashboard | Dashboard in the menu | Administrator, Super Administrator | admin.dashboard.spec.ts |
| `/more` | | Phone overflow menu | More tab (phone) | Administrator, Super Administrator | |
| `/verification` | A02 | Verification queue: identity and business | Verification in the menu | Administrator, Super Administrator | admin.verification.spec.ts |
| `/verification/[id]` | A02 | One identity application: approve, reject, duplicate | Verification > an applicant | Administrator, Super Administrator | admin.verification.spec.ts |
| `/verification/business/[id]` | A03 | One business application | Verification > Business > an application | Administrator, Super Administrator | admin.verification.spec.ts |
| `/re-verification` | A08 | Expiring licences and re-verification | Re-verification in the menu | Administrator, Super Administrator | |
| `/recoveries` | A02 | Email recovery requests | Verification > Recoveries | Administrator, Super Administrator | |
| `/moderation` | A04 | Moderation queue for posts, ideas, trainings, events | Moderation in the menu | Administrator, Super Administrator | admin.dashboard.spec.ts |
| `/moderation/[id]` | A05 | One item to approve or reject | Moderation > an item | Administrator, Super Administrator | |
| `/public-listings` | A21 | Public listings queue and sources: approve or discard imported tenders and jobs, switch sources, add a company | Public listings in the menu | Administrator, Super Administrator | admin.public-listings.spec.ts |
| `/picks` | A18 | Picks for posters | Picks in the menu | Administrator, Super Administrator | admin.picks.spec.ts |
| `/ideas` | | Ideas oversight | Ideas in the menu | Administrator, Super Administrator | admin.ideas.spec.ts |
| `/reports` | A06 | Reports queue | Reports in the menu | Administrator, Super Administrator | admin.reports.spec.ts |
| `/reports/[id]` | A07 | One report: uphold or dismiss | Reports > a report | Administrator, Super Administrator | admin.reports.spec.ts |
| `/members` | A10 | Member list, suspend, reinstate | Members in the menu | Administrator, Super Administrator | |
| `/news` | A11 | Publish news, feature items | News in the menu | Administrator, Super Administrator | admin.featured.spec.ts |
| `/milestone-plans` | A14 | Milestone plan oversight | Milestone plans in the menu | Administrator, Super Administrator | |
| `/post` | A15 | Post an opportunity as staff | Post in the menu | Administrator, Super Administrator | |
| `/audit-log` | A13 | Audit log | Audit log in the menu | Super Administrator only (`superadmin` account) | admin.audit.spec.ts |
| `/settings` | A16 | Platform settings and staff accounts | Settings in the menu | Administrator; staff accounts for Super Administrator | admin.platform-settings.spec.ts |
