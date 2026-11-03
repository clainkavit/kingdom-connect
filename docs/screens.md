# Kingdom Connect: screen list with states

| Item | Detail |
|---|---|
| Version | 0.1 (draft), 22 October 2026 |
| Ticket | [Screen list with states](https://github.com/clainkavit/kingdom-connect/issues/13) |
| Built on | [docs/prd.md](prd.md) sections 3 to 14, [docs/schema.md](schema.md) and the dashboard prototype in [context/design/](../context/design/) |
| Status | Design. The build tickets in [#16](https://github.com/clainkavit/kingdom-connect/issues/16) are cut from this list |

Every screen the product needs, who can open it, what it shows, and the states that differ from the normal case. It replaces the 16-screen list in PRD section 5, which predates several decisions (milestone plans, the nationwide sign-up, legal texts and the notification centre).

## How to read it

**Roles.** Visitor (signed out), Applicant (registered, not yet approved), Member (Level 1 and up), Business (Level 2), Poster (Level 3), Investor (a member with the private flag), Admin, Super Admin. Rights stack as in PRD section 3.

**Screen IDs.** `S` is a member-side screen, `A` is an admin-side screen. They are the reference for the build tickets and the access-rule tests.

### Five states every screen is checked for

| State | What the screen does |
|---|---|
| Loading | Shows a skeleton of the final layout, not a blank page or a spinner alone. Lists show skeleton rows. |
| Empty | Says what will appear here and how to add the first item (for example "No connection requests yet. Find people to connect with."). Never a blank area. |
| Error | Says what failed in plain words, offers Try again, and keeps anything the person typed. No technical codes. |
| Locked for this role | A signed-in member who lacks the level sees the screen's name, one line of reason and the path forward (for example "Verify your business to respond"). Screens that must not reveal that they exist (admin screens, investor tools) show nothing at all to people without them, as if they were not there. |
| Slow or offline | The PRD targets 3G. A screen keeps showing what it already loaded, shows a small "Slow connection" banner, queues sends (a message, a request) and retries, and never shows an empty state because the network failed. |

The tables below list only a screen's **special states**: the ones beyond these five.

### Everywhere

- **Languages.** Every screen is English and Kiswahili, in both apps. Visitors switch from the sign-in header or the landing footer; signed-in members from Settings. Until Settings is built, the switch is in the member top bar, the phone More screen and the admin sidebar. A Member's choice is saved to their account; everyone else's to the device.
- **Phone layout.** The menu becomes a bottom tab bar (member: Home, People, Opportunities, Messages, More, as icons; admin: Home, Verify, Moderate, Reports, More). Tables become cards and filters open in a sheet.
- **The investor flag is never visible.** An investor's menu looks the same as any member's. Investor tools (filters, Saved ideas, anonymous interest) appear inside Ideas only, and are absent, not locked, for everyone else.
- **Report.** Profiles, opportunities, ideas and message threads each carry a Report action that opens S42.

## 1. Entry and account

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S01 | Landing | Visitor | What the platform is, Sign up, Log in, language switch | Signed-in people go straight to the dashboard |
| S02 | Sign up | Visitor | Username, email, +255 phone, password | **Cap reached:** "We're reviewing a high number of applications, please try again tomorrow" (Super Admin setting). **Duplicate:** an already used ID or email is stopped with a plain message |
| S03 | Log in | Visitor | Username and password | **Locked:** 5 failed attempts lock the account for 15 minutes, with a countdown. A wrong username or password gets the same message, so nobody can test who exists. **Pending or rejected:** after the right password and email code, an Applicant reaches S06 Registration status and nothing else (decided 2 Nov 2026, F09 #47). An unknown username and a wrong password still get the same message. **Suspended:** after the password is right, "Your account is suspended. An admin will review it" |
| S04 | Email code | Visitor | 6-digit code, valid 10 minutes | Wrong code (3 attempts), expired code, resend available after 60 seconds, too many attempts |
| S05 | Registration wizard | Applicant | Steps: personal details (with a Tanzanian address from the region and district lists), category, category details, photos (face photo and one accepted ID with its type and number), legal acceptance, review | **Legal acceptance:** terms of use and privacy notice are two separate tick boxes, each with the text in English and Kiswahili. **Validation:** a NIDA number must be 20 digits, phone must start with +255. **Duplicate ID:** blocked. **Interrupted:** each step is saved when it is completed, so the applicant signs in again and continues where they stopped, on any device. A draft is not an application until Submit; the admin queue never shows drafts |
| S06 | Registration status | Applicant | Where the application is | **Under review:** "Your application is being reviewed", with the expected time. **Rejected first time:** the reason and Fix and resubmit (once). **Rejected final:** the reason and "This decision is final unless an administrator reopens it". **Approved:** moves on to the dashboard. The expected time comes from the queue (PRD section 18, R02); Fix and resubmit opens S05 on the review step |
| S07 | Accept updated text | Member | A changed terms of use or privacy notice, in both languages | Blocks the app until accepted at next login. An NDA already accepted never prompts again. Since R05b the database also refuses every member table until both are accepted, so skipping the screen gets no data |

## 2. Home and notifications

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S08 | Member dashboard | Member | Welcome, People you may know, my connection requests, my activity, featured opportunities, latest opportunities and more (tabs), quick actions, news | **Each widget has its own empty state.** People you may know and Scan results: "Complete your profile to see matches" with the missing fields. **Locked quick actions** are hidden with a path to upgrade ("Verify your business to post opportunities"). No platform-wide figures at all: the community counts are admin-only (PRD section 7). Built in R14 at `/`: Welcome (name, date, district and region), connection requests with Accept and Decline, My activity (requests sent and still waiting), quick actions (Share an idea, Scan for opportunities, Post training; Post an opportunity at Level 3, otherwise "Verify your business to post opportunities"; the posting actions are hidden while posting is paused). People you may know (O08), featured and latest opportunities and news arrive with their tickets |
| S09 | Notification centre | Member | The bell: every notification, newest first, read and unread | Empty: "Nothing new". Opens the screen the notification is about (see the table at the end) |

## 3. People, connections and messages

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S10 | Directory | Member | Professionals and Businesses tabs; cards with photo, name, headline, location, top 3 skills, badge, Connect; filters for profession, skills, sector, region, studying, level | **No results:** suggests clearing filters. **Businesses tab** lists approved Level 2 and up only. Hidden and blocked profiles are not listed. Built in R07 at `/people`: one tab (Businesses arrives with Release 2), a daily shuffle with no search, 20 cards a page with Load more. Each card shows Connect (opens the profile with the note box), Request sent, Answer their request (to S13) or Connected (R09) |
| S11 | Member profile | Member | About, Skills, Business, Ideas tab, Milestone plans; Connect, Message, Report | **Hidden profile:** visible to existing connections and the owner only. **Blocked:** shown as not found. **Contact details:** masked unless the owner shares them with a connection. **Own profile:** Edit. Reached at `/profile` (yours) and `/profile/<member id>`; a profile you cannot see reads "Profile not found". The Ideas tab is a placeholder until Release 2. **Connect (R09):** Connect opens an optional note (300 characters) and Send request; then Request sent. Asked by them: Answer their request, to S13. Connected: Remove, after a confirm. Block, after a confirm, then the profile reads "Profile not found". A hidden member who sends you a request is visible to you while it is open |
| S12 | Edit profile | Member | Headline, bio, skills (tag entry with suggestions), experience, certifications, study, photo | Skill tags are lowercased and matched to the synonym list. Empty skills show a nudge ("Add skills to get matched"). The full name is shown but locked. Links to Profile privacy and contact sharing (S45), where the hide switch is |
| S13 | Connections and requests | Member | Requests received (accept or decline), requests sent, my connections | **A declined request looks "sent"** to the sender for 30 days, then expires. **Daily limit:** "You have sent 30 requests today. Try again tomorrow". Empty: "No requests yet. Find people to connect with". Built in R09 at `/connections`: Accept or Decline with the note shown, Withdraw, Remove after a confirm. Declining and removing send no notice |
| S14 | Messages inbox | Connected members | Threads, newest first, with the idea or opportunity label where there is one | Empty: "No messages yet". Built in R10 at `/messages`: name, photo, the last message and an unread dot. Opened from Message on a connection's profile (S11) or in My connections (S13) |
| S15 | Message thread | The two members | Messages, text and attachments (PDF, images, up to 10 MB), Report | **Blocked:** no sending. **Reported:** a notice that admins can read this thread. **Attachment too large or wrong type:** stated before sending. Admins cannot see the thread unless it is reported. Built in R10 at `/messages/<thread id>`: live updates; delete your own message, after a confirm, until the thread is reported ("This message was deleted"); Report opens S42 (R11). **Not connected or blocked:** "You can't send messages in this conversation" in place of the box. No read receipts |

## 4. Opportunities

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S16 | Opportunities list | Member | Filters (type, location, sector, employment type, posted date); Scan for Opportunities results with the top two reasons for each match | **Scan empty:** "Complete your profile to see matches". Types: Job, Partnership, Collaboration, Investment, Tender. Reported posts disappear at once |
| S17 | Opportunity detail | Member | The post, the poster, the closing date; tender extra fields (issuing organisation, reference number, scope, eligibility, required documents, closing date and time, estimated value, tender document) | **Level 1 on a tender:** "Verify your business to respond". **Closed or expired:** read-only. **Already responded:** shows my response status instead of the button |
| S18 | Apply or express interest | Member | Jobs: apply with an optional CV (PDF, 5 MB) and note. Other types: express interest with a note and attachment | Applied once only. Withdraw while New |
| S19 | My responses | Member | My applications and expressions of interest with status (New, Shortlisted, Declined, Withdrawn) | Empty: "You haven't responded to anything yet" |
| S20 | Post an opportunity | Poster, Admin | The posting form: type, title, location, sector, skills wanted (1 to 5), description (100 characters minimum), closing date, no-fee tick for Poster posts | **Draft, Pending review, Published.** A new Poster's first 3 posts are reviewed. Admin posts publish at once with no no-fee tick. Phone numbers and emails in the text are blocked; a link sends the post to review |
| S21 | My posts and their responses | Poster, Admin | My posts with status; each post's responses as New, Shortlisted, Declined | **Hidden by a report:** shown with "Our team is reviewing it". Empty: "You haven't posted anything yet" |

## 5. Ideas and investors

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S22 | Ideas pool | Member | Idea summary cards with an interest count; Investor filters (sector, stage, range, region) and Saved | **Investor tools exist only for the flag holder.** Ideas posted without a name show "A verified member". Empty: "No ideas yet. Share yours" |
| S23 | Idea summary | Member | Title, problem, industry, stage, seeking, range, owner (unless hidden), Interest | **Own idea:** shows Edit and the access manager. Details stay locked until the owner approves and the NDA is accepted |
| S24 | Express interest | Member | Named: choose Investor, Partner or Both. Anonymous: flag holders only, shows sector focus and ticket band | **Anonymous never shows a name** to the owner. The option is absent for members without the flag |
| S25 | Accept NDA and IP terms | Requester | Both texts in English and Kiswahili, Accept | Needs approval first. After acceptance, identities are revealed to each other and a thread opens |
| S26 | Idea details | Approved member, Owner | Full description, business model, market, financials, team, attachments (20 MB total) | **Watermarked** with the viewer's name and date; every view and download is logged. Revoked access shows "The owner has removed your access" |
| S27 | Submit or edit an idea | Member | The idea form, with a choice to post named or without a name | **Draft, Pending moderation, Published, Archived, Hidden, Removed** |
| S28 | Access manager | Idea owner | Request cards (approve or decline), everyone with access (Revoke), "Viewed by N investors" | **Anonymous request card:** "A verified investor", sector, band. **Declined:** the requester gets a neutral notice. Empty: "No requests yet" |
| S29 | Saved ideas | Investor | The private saved list | Absent for non-flag holders. Empty: "Nothing saved yet" |

## 6. Milestone plans

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S30 | My plans | Member | All my plans with status, shown also on each party's profile | Empty: "No plans yet. A plan starts from a connection made through an idea or opportunity" |
| S31 | Propose a plan | Member | Choose the idea or opportunity; add 1 to 10 milestones (title, description, target date, who is responsible); stage 1 is always Agreed in principle | Only possible with an accepted connection from that idea or opportunity |
| S32 | Review and accept a plan | The other member | The proposed plan; the hand-off disclaimer (version shown) with Accept | **Pending:** a 14-day countdown. **Lapsed:** "This plan expired. You can start it again". **Withdrawn:** read-only |
| S33 | Plan overview | The two members | Status; milestones (open, done, confirmed); mark done, confirm; a "Withdraw" button in the first hour and an "End plan" button after it | **First hour after both accept:** banner "You can withdraw for 1 more hour". After that no withdrawal for stage 1; "End plan" asks for a reason, tells the other member, and leaves the plan on record as Ended. A confirmed milestone is never editable. **Completed**, **Withdrawn** and **Ended** are read-only |
| S34 | Upload the signed agreement | The two members | Upload a PDF (up to 10 MB), see whether the other side has uploaded | Only after the earlier milestones are confirmed. **Too large or not a PDF:** stated before sending |

## 7. Learning, events and news

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S35 | Training list and detail | Member | Title, provider, format, date or self-paced, seats; Register | **Full:** Join the waitlist. **Waitlisted:** shows position; the first person moves up automatically. Materials appear after registering |
| S36 | Learning materials | Registered member | PDFs, video links, slides, inside the platform | **Downloads** only if the poster allowed them. Not registered: locked with Register |
| S37 | Post a training | Member, Admin | The training form | Member posts go to **Pending review** before they are live |
| S38 | Events list and detail | Member | Title, date and time, venue or link, capacity; Register; Add to calendar | Full: waitlist. Posting is for Admins and Level 2 and up (**locked** with a reason for others) |
| S39 | News | Member | News and updates, pinned item first | Empty: "No news yet" |

## 8. Business levels, safety and settings

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| S40 | Business verification and upgrade | Member | Level 2 and Level 3 documents, the investor application (Level 2 and up), status per level | **Status:** Not started, Pending, Approved, Rejected (with reason), Expired. Level 3 locked until Level 2 is approved |
| S41 | Re-verification | Business | Licence expiry date, upload new documents | **Reminders** at 30 and 7 days. **Expired:** Level 2 and 3 rights paused until approved |
| S42 | Report form | Member | Reason (Asked for money, Fake job or business, Harassment, Impersonation, Spam, Other), optional note and screenshot | Success shows a reference number. Built in R11 at `/report?type=…&id=…` for a profile (Report on S11) and a thread (Report on S15): note up to 1000 characters, one screenshot (JPEG, PNG or WebP, up to 5 MB) only staff can open. The success screen offers "Block this member" after a confirm. **Already reported and still open:** "You already reported this" with that reference. **Daily limit:** 10 reports a day, then "Try again tomorrow" |
| S43 | My reports | Member | Each report with its reference number and outcome only (Action taken or No action) | Empty: "You haven't reported anything". Built in R11 at `/reports`: reference, date and Being reviewed, Action taken or No action |
| S44 | Settings | All signed in | Entry to the subpages below | `/settings`. Lists only the subpages built so far: S45 (R08) |
| S45 | Profile privacy and contact sharing | Member | Hide from the directory; three switches for phone, email and address, all off by default, each showing the value it would share | `/settings/privacy`. Each switch saves at once; if saving fails it turns back and says so. Hiding keeps existing connections' view. The values themselves cannot be changed here ("You can't change these here yet."). **Shown on S11:** a Contact section with only the shared fields, for a connection; no section for anyone else. **Blocked members (R09):** the list with Unblock; unblocking does not restore a connection |
| S46 | Notification settings | Member | Email for non-critical notifications; push master switch and one per category | **Push not yet permitted by the phone:** shows how to allow it. Web pilot: push section hidden |
| S47 | Password and sign-in | Member | Change password; the email code is always required | Errors never reveal whether an account exists |
| S48 | Language | All | English or Kiswahili | |
| S49 | Download or delete my data | Member | Download my data; request deletion | **Deletion confirmation** is a full screen with what is removed and what is kept (audit entries are kept, PRD section 13) |

## 9. Admin

| ID | Screen | Who | What it shows | Special states |
|---|---|---|---|---|
| A01 | Admin dashboard | Admin | The community counts (verified members, registered businesses, open opportunities, ideas in the pool), queue counts and the age of the oldest item, alerts, featured slots, investor activity, re-verifications due in 30 days | **Alert:** an application waiting 2 working days. Each count links to its filtered queue. The daily-cap switch is shown to Super Admins. Built in R15 at `/`: verified members, waiting for verification (with the age of the oldest), rejected members and open reports (cases), each linking to its queue; the 2-working-day alert links to A02; sign-ups today against the daily limit, with "Change in Settings" for Super Admins. Counts reload every 15 minutes. Registered businesses, open opportunities, ideas in the pool, re-verifications, featured slots and investor activity arrive with their tickets |
| A02 | Verification queue | Admin | Members, businesses and investors waiting, oldest first, with the queue size and the age of the oldest. Members only until the business and investor tickets | Empty: "Nothing waiting". **Overdue:** a banner and a row mark at 2 working days (Monday to Friday). A suspected duplicate is marked on its row |
| A03 | Verification detail | Admin | The profile, face photo and ID photo side by side, name and ID number check (the number hidden until revealed), ID expiry, a duplicate flag from the ID fingerprint, Approve, Reject (a preset reason, plus a note) | **Suspected duplicate:** staff mark it by the other member's username and compare both face photos. Decrypting an ID number is logged. **Expired ID:** a warning. **Decided elsewhere:** "Another Administrator has already decided this application". **Decided:** the decision and the reason sent. **Rejected final:** Reopen, with a note for the audit log |
| A04 | Moderation queue | Admin | Pending and hidden items: opportunities, ideas, training, events, tenders | Empty: "Nothing to review". Built in R12 at `/moderation` as the empty shell; the items arrive with Release 2 |
| A05 | Moderation item | Admin | The item and its history; Restore, Edit request, Remove, Warn, Suspend posting, Suspend account | **A note is required** for each action |
| A06 | Reports queue | Admin | Open and under-review reports, with the reference number | Empty: "No open reports". Built in R12 at `/reports`: one row per case (an item and the reported member), oldest first, with the first reference, the target, the reasons, the report count and "Under review" |
| A07 | Report detail | Admin | The report, the target and its thread (readable only because it was reported), decision and note | The signed document of a reported plan becomes visible to staff here. Built in R12 at `/reports/<report id>`: opening it starts the review; every report in the case with reporter, note and screenshot; the reported member, their state and the upheld decisions the repeat rule counts; a warning before a decision that will also pause posting or suspend the account; the conversation with attachments; No action, Warn, Suspend posting or Suspend account with a staff note, and a message to the member for all but No action; Lift posting pause and Reinstate account, each with a note. **Closed:** "This report is closed" |
| A08 | Re-verification | Admin | Licences expiring soon and expired | |
| A09 | Members | Admin | Search and open a member; suspend; invite for the investor flag | Staff cannot connect or message, and have no member profile |
| A10 | Investors | Admin | Flag holders, invitations and applications (staff only) | The investor list is never visible outside staff |
| A11 | News editor | Admin | Create, publish, pin | Draft and Published |
| A12 | Featured | Admin | Up to 5 featured opportunities, remove | Slot count shown; full: remove one first |
| A13 | Audit log | Super Admin | Read-only list of actions with before and after values | Cannot be edited by anyone. Filterable by actor, action and date. Built in R13 at `/audit-log`, in the menu for Super Admins only: filters for a staff account, a member username, system entries, the action and a date range; each entry shows the time, actor, action, target, the changed fields and the IP, with "Show full record" for the whole before and after; Load more adds 50. **Administrator:** "Only Super Admins can open the audit log". **No match:** "No entries match these filters" |
| A14 | Milestone plans (admin view) | Admin | Names, the idea or opportunity, stage statuses, dates, notes; add an annotation | Never shows contact details or the investor flag. Annotations cannot be deleted |
| A15 | Post as admin | Admin | Post an opportunity, tender or news | Publishes at once; no no-fee tick; marked as an admin post |
| A16 | Settings (`/settings`) | Admin; some sections Super Admin | Matching weights and minimum scores, the daily application cap, platform settings (name, entity name, featured slots), staff accounts, legal text versions | **In every Administrator's menu.** The cap, staff accounts, matching weights, platform settings and legal text versions are Super Administrators only; an Administrator sees "Only Super Administrators can change these settings" in their place. Built so far: the daily application cap and staff accounts (invite, deactivate, reactivate) for Super Administrators (R04), and the skill synonym list for any Administrator (R06). Every change is written to the audit log |

## Notification to screen

Each notification in [docs/notifications.md](notifications.md) opens the screen that fits it.

| Notification | Opens |
|---|---|
| A1 to A4, A6 Registration | S06 |
| A5 Login code | S04 |
| B1 to B4 Business levels | S40 or S41 |
| C1, C2 Connection | S13 |
| C3 New message | S15 |
| O1, O2 Response received | S21 |
| O3, O4 Response status | S19 |
| O5 to O8 Post status | S21 |
| I1, I2 Interest in my idea | S28 |
| I3 to I6 Idea access | S25 or S26 |
| L1 Account locked | S03 |
| X1 Account suspended | S03 |
| X2 Posting rights paused | S20 or S21 |
| X3 Warning | S08 |
| H1, H2 Idea hidden or removed | S27 |
| P1 to P10 Milestone plans | S32, S33 or S34 |
| S1 Scan matches | S16 |
| T1, T2, W1 Training and events | S35 or S38 |
| R1, R2 Report outcome | S43 |
| V1 Investor tools | S22 |

## Checks against the PRD

- **Every one of the 16 screens in PRD section 5 is covered.** 1 Landing, sign-up, login, OTP is S01 to S04. 2 Registration wizard is S05. 3 Registration status is S06. 4 Member dashboard is S08. 5 Directory is S10. 6 Member profile is S11 and S12. 7 Connections is S13. 8 Messages is S14 and S15. 9 Opportunities is S16 to S21. 10 Ideas is S22 to S29. 11 Training is S35 to S37. 12 Events is S38. 13 Business verification is S40. 14 Report form, my reports is S42 and S43. 15 Admin is A01 to A16. 16 Settings is S44 to S49.
- **Added since PRD section 5:** S07, S09, S30 to S34, S41, S45 to S49, A14 to A16, plus the sign-up states.

## Open questions

1. **Warn and Edit request notices.** Two admin actions (PRD section 13) still have no notification and no screen state (also listed in docs/notifications.md).
2. **Unfinished registrations.** How long a saved, unsubmitted registration (with its uploaded ID photo) is kept before it is deleted. For the lawyer's retention review (PRD section 13).

Final English and Kiswahili wording for every empty and error state is written during the build (agreed 22 Oct).
