# Kingdom Connect screens

The member app's screens from landing to "Under review", on a phone and on a computer, drawn on 8 November 2026. They follow PRD section 6 and docs/screens.md S01 to S06. The live, clickable version is the "Kingdom Connect sign-in screens" design canvas on claude.ai. These files are a copy of it.

There are 94 screens: sign-in and registration, the admin console, the member and business dashboards with People and profiles, and Ideas, each on a computer and a phone.

Open any `.dc.html` file in a browser to see that screen, and click its buttons to move through the flow. The copies show only the layout. The language switch on the legal pages works on the canvas only, so a copy shows the English and Kiswahili texts one after the other.

## Joining

| Screen | Phone | Computer |
|---|---|---|
| S01 Landing | `Phone-Landing` | `Web-Landing` |
| S02 Sign up (username, email, phone, password twice) | `Phone-Signup` | `Main` |
| S04 Email code | `Phone-Code` | `Web-Code` |
| S05 Step 1: About you (name, region, district, optional studies) | `Phone-Details` | `Web-Details` |
| S05 Step 2: Category | `Phone-Category` | `Web-Category` |
| S05 Step 3: Category details (Professional, Businessperson) | `Phone-CatDetails` | `Web-CatDetails` |
| S05 Step 3 when Other is ticked | `Phone-CatOther` | `Web-CatOther` |
| S05 Step 4: ID and photos (ID type and number, ID photo, face photo) | `Phone-ID` | `Web-ID` |
| S05 Step 5: Terms and privacy (two separate tick boxes) | `Phone-Legal` | `Web-Legal` |
| Terms of use, draft 0.1 from `legal/terms.*.md` | `Phone-Terms` | `Web-Terms` |
| Privacy notice, draft 0.1 from `legal/privacy.*.md` | `Phone-Privacy` | `Web-Privacy` |
| S05 Step 6: Check and send | `Phone-Review` | `Web-Review` |
| S06 Registration status, Under review | `Phone-Status` | `Web-Status` |

## Coming back

| Screen | Phone | Computer |
|---|---|---|
| S03 Log in | `Phone-Login` | `Web-Login` |
| S03 Log in, locked after failed attempts | `Phone-Locked` | `Web-Locked` |
| Forgot password | `Phone-Forgot` | `Web-Forgot` |
| Choose a new password | `Phone-Reset` | `Web-Reset` |
| S04 Can't get the code? (recover a lost email) | `Phone-Recover` | `Web-Recover` |

## Admin console

Staff do not sign themselves up. A Super Administrator invites them (PRD section 18, 3 November, R04).

| Screen | Computer | Phone |
|---|---|---|
| A16 Settings, Staff accounts: password resets and locked accounts (Send reset link, Refuse, Unlock); invite by name, email and role; the staff list with Deactivate, Reactivate and Send again | `Admin-Staff` | `Admin-Phone-Staff` |
| The invite email, with a set-password link that works for 24 hours | `Admin-Email` | |
| Set your password (typed twice), then "Your password is set", with the expired-link message | `Admin-SetPassword`, `Admin-PasswordSet` | `Admin-Phone-SetPassword`, `Admin-Phone-PasswordSet` |
| Log in to the admin console with email and password | `Admin-Login` | `Admin-Phone-Login` |
| Email code | `Admin-Code` | `Admin-Phone-Code` |
| Forgot password: ask for a reset, request sent, choose a new password from the Super Admin's link (Proposed, #182) | `Admin-Forgot`, `Admin-ForgotSent`, `Admin-NewPassword` | `Admin-Phone-Forgot`, `Admin-Phone-ForgotSent`, `Admin-Phone-NewPassword` |
| A01 Admin dashboard (PRD section 7), with charts | `Admin-Dashboard` | `Admin-Phone-Dashboard` |
| A02 Verification queue: oldest first, the 2-working-day mark, type tabs, duplicate and expired-ID flags | `Admin-Verify` | `Admin-Phone-Verify` |
| A03 Verification detail: face and ID photos side by side, the checks, Reveal ID number (logged), duplicate mark, Approve, Reject with the 7 preset reasons | `Admin-VerifyDetail` | `Admin-Phone-VerifyDetail` |
| Ideas overview for staff (Proposed, #186): counts, ideas by stage and industry, interest to NDA, waiting for moderation, all ideas | `Admin-Ideas` | `Admin-Phone-Ideas` |

The admin screens use the maroon and cream look of the member screens. The console as built today is navy and blue, so restyling it is a separate change. The chart colours (wine `#9B2C45`, gold `#B97A10`, teal `#0F8F7F`, indigo `#5B5BD6`) pass a colour-blindness and contrast check on white.

## Member, after approval

PRD section 7 has one member dashboard that changes with the member's level and categories (decided 15 October; tied to categories in the #161 proposal). Two members show how it changes. Members never see platform-wide counts.

| Screen | Computer | Phone |
|---|---|---|
| S08 Dashboard for Neema: Professional and Businessperson, Level 1. Profile ring, My profiles, people you may know, jobs for her skills, tenders for her business (locked until Level 2), latest, requests, activity, featured, news | `Member-Dashboard` | `Member-Phone-Dashboard` |
| S08 Dashboard for Rehema: business owner, Opportunity Poster (Level 3). My business with the licence date, responses to her posts as a ring chart, My posts (S21) with response bars, new responses with Shortlist and Decline, tenders she can respond to | `Business-Dashboard` | `Business-Phone-Dashboard` |
| S10 People: Professionals and Businesses tabs, filters, member cards | `Member-People` | `Member-Phone-People` |
| S11 A member's profile (Asha, not connected yet): About, Skills, Business, Ideas, Connect with a note; phone and email hidden | `Member-Profile` | `Member-Phone-Profile` |

The profile pictures are illustrated placeholders, not photos of real people. Emmanuel keeps his initials, to show a member without a photo.

## Opportunities and business verification

| Screen | Computer | Phone |
|---|---|---|
| S16 Opportunities: type tabs, filters, Scan for opportunities, cards with the top reasons, tenders locked at Level 1 | `Opp-List` | `Opp-Phone-List` |
| S17 A tender: the 8 tender fields and the document; "Verify your business to respond" at Level 1 | `Opp-Detail` | `Opp-Phone-Detail` |
| S18 Apply for a job: optional CV (PDF, 5 MB) and note; apply once, withdraw while New | `Opp-Apply` | `Opp-Phone-Apply` |
| S19 My responses: New, Shortlisted, Declined, Withdrawn | `Opp-Responses` | |
| S20 Post an opportunity (Rehema, Level 3): type, title, place, sector, 1 to 5 skills, description of 100 characters or more, closing date, the no-fee tick; first 3 posts reviewed | `Opp-Post` | `Opp-Phone-Post` |
| S40 Business verification (Neema): Level 1 approved, the Level 2 form and three documents, Level 3 locked, the investor application from Level 2 | `Biz-Verify` | `Biz-Phone-Verify` |

## Ideas

PRD section 11 and S22 to S29, as Neema sees them. She does not hold the investor flag, so the investor filters and the Saved list (S29) do not appear.

| Screen | Computer | Phone |
|---|---|---|
| S22 Ideas pool: cards with industry, stage, looking for, range, the owner or "A verified member", interest count | `Ideas-Pool` | `Ideas-Phone-Pool` |
| S23 and S24 Someone's idea: the summary, details locked, I'm interested as Investor, Partner or Both | `Ideas-Summary` | `Ideas-Phone-Summary` |
| S28 My idea: "Viewed by N investors", request cards (named, and "A verified investor" with sector and band), Approve, Decline, people with access and Remove access | `Ideas-Manage` | `Ideas-Phone-Manage` |
| S25 and S26 Details after the NDA, as the approved requester sees them: watermarked with her name and the date, files, Message the owner | `Ideas-Details` | `Ideas-Phone-Details` |
| S27 Share an idea: the Summary every member sees, with "Show my name and profile", and the Details only approved people see | `Ideas-Share` | `Ideas-Phone-Share` |

**As an investor sees them** (flag holders only; the flag is never shown to anyone else):

| Screen | Computer | Phone |
|---|---|---|
| S22 and S29 The pool with investor tools: focus (sectors and ticket band), filters, Matching, All and Saved tabs, my requests, silent browsing | `Investor-Pool` | `Investor-Phone-Pool` |
| S24 Ask anonymously: the owner sees "A verified investor" with sector focus and ticket band | `Investor-Interest` | `Investor-Phone-Interest` |

The "Your focus" setting and the Matching tab are Proposed in #186.

The ideas, names and figures are samples.

## Not decided yet

These screens show proposals that still need Champion's answer. Build from the PRD until they are decided.

- **Categories (#161).** Step 2 offers Professional, Businessperson and Other, tick all that apply. Entrepreneur and Student are removed. Proof for each category comes after sign-up.
- **Other (#161).** Ticking Other opens a page asking what the member hopes to find: they have a business idea, they are looking for investors, or something else, with a few words. The PRD today asks Other for a short description only. There is no "I want to invest" choice, because the investor flag stays private and is granted by an administrator (PRD section 11).
- **Under review (#180).** S06 says "You will get a notification when the review is done", with no expected review time.
- **Forgot password (#182).** Not in the PRD yet. Members reset with an email code. Staff ask for a reset and a Super Administrator approves it after checking it is really them; nobody approves their own, so the pilot needs at least two Super Administrators. Locked staff accounts can be unlocked by a Super Administrator.
- **Dashboard by category (#161).** The jobs and tenders cards, the My profiles card and the Certified professional badge follow the #161 proposal.
- **Weekly new members chart.** The admin dashboard's line chart needs a history of approvals per week. PRD section 7 has current counts only, so the chart is Proposed in PR #179.
- **Maroon look for the admin console.** Agreed on 8 Nov for the designs. The built console is still navy and blue.

The names, ID number and business on the screens are made-up examples. The sector list on step 3 is a placeholder for the 16 starter sectors.
