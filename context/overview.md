# Kingdom Connect: one-page overview

Condensed from Plan v1.1 and PRD v0.1 (both 14 Oct 2026). Sources win on any difference.

## Roles (stack, private investor flag on top)
Applicant, Verified Member L1 (NIDA + manual review), Verified Business L2 (BRELA, TRA TIN, licence), Opportunity Poster L3 (director proof + address), Investor flag (private, by Admin/SuperAdmin invitation or approved L2 application), Administrator, SuperAdministrator. Full matrix: PRD section 3.

## Releases (12-month plan)
- **Release 1, months 5 to 7:** registration, NIDA verification, MFA login, approval workflow, dashboards (core), profiles and directories, connections and messaging, report/suspend.
- **Release 2, months 7 to 9:** business levels 2 and 3, opportunities, Scan for Opportunities, tenders, ideas pool, NDA flow, investor tools, training, events, news, fast takedown, annual re-verification, agreements (pending decision).

## Decided on 14 Oct 2026
NIDA manual admin review in Phase 1. Any verified member can post training, admin approves. Contact sharing optional. OTP by email in pilot. Investor invitations by Admin/SuperAdmin. Probation: first 3 posts reviewed, 2 upheld reports in 12 months suspend posting, 3 suspend account. Ticket bands: under TZS 10M, 10 to 50M, over 50M. Cloud hosting.

## Decided on 15 Oct 2026
- **Admins can post opportunities** (restores diagram UC16). Overrides the PRD section 3 matrix and Plan FR-15, which still say Level 3 posters only; update both in the next PRD/Plan revision. Admins can also post tenders. Admin posts publish directly (no probation review) and do not need the no-fee declaration tick.
- **"People you may know" widget on the Member dashboard** (from the mockup's professionals grid). Shows members whose skills or location match the viewer's, each with a Connect button. Add it to the PRD section 7 widget list in the next revision. Proposed: rule-based like Scan for Opportunities, excluding people already connected, pending, blocked or hidden from the directory.
- **No "No fee" chip on opportunity cards.** Considered and rejected as redundant noise; the no-fee declaration stays at posting time only.
- **Hosting path:** develop on managed Supabase with test data only. No real member data goes in until the hosting call is made. Choose between managed Supabase (nearest region outside Africa) and self-hosted in Tanzania, with a legal check against the Personal Data Protection Act 2022, before the pilot.

## Open (PRD section 18)
1. Agreements and e-signing (UC-24 to 27): keep in Phase 1 or drop, as contract management is out of scope.
2. Cloud provider and data region: managed vs self-hosted, decided before the pilot with a legal check (path agreed 15 Oct, see above).
3. Admin team size for the verification and moderation queues.

## Out of scope Phase 1
Payments, escrow, investment transactions, mentorship, e-commerce, social integrations, members outside Tanzania, public content beyond landing and sign-up.

## Known gaps in the sources
- Use case diagram is pre-v1.1 (21 use cases, Plan has 43). The Plan covers all 21 except: separate Professional and Business dashboards (UC11, UC12) are replaced by one Member dashboard (members and admins still have separate dashboards). Admin posting opportunities (UC16) was dropped in the Plan but restored by decision on 15 Oct. Status check (UC02), notifications (UC04) and viewing news/opportunities (UC13, UC14) exist as FRs, not as Plan use cases.
- PRD "Proposed" values (OTP 5 min/3 attempts, lockout 5 fails/15 min, 30 requests/day, 5-year log retention, etc.) are defaults, not decisions.
- No tech stack, budget or team named.
- The dashboard mockup ([design/dashboard-mockup.jpg](design/dashboard-mockup.jpg)) is the visual direction, not a spec. Where it conflicts with the PRD (admin counts on the member dashboard, Students tab, Kenyan locations, "ConnectPro" name), the PRD wins.
