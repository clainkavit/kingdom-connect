# Kingdom Connect: one-page overview

Condensed from Plan v1.1 and PRD v0.1 (both 14 Oct 2026). Sources win on any difference.

## Roles (stack, private investor flag on top)
Applicant, Verified Member L1 (NIDA + manual review), Verified Business L2 (BRELA, TRA TIN, licence), Opportunity Poster L3 (director proof + address), Investor flag (private, by Admin/SuperAdmin invitation or approved L2 application), Administrator, SuperAdministrator. Full matrix: PRD section 3.

## Releases (12-month plan)
- **Release 1, months 5 to 7:** registration, NIDA verification, MFA login, approval workflow, dashboards (core), profiles and directories, connections and messaging, report/suspend.
- **Release 2, months 7 to 9:** business levels 2 and 3, opportunities, Scan for Opportunities, tenders, ideas pool, NDA flow, investor tools, training, events, news, fast takedown, annual re-verification, agreements (pending decision).

## Decided on 14 Oct 2026
NIDA manual admin review in Phase 1. Any verified member can post training, admin approves. Contact sharing optional. OTP by email in pilot. Investor invitations by Admin/SuperAdmin. Probation: first 3 posts reviewed, 2 upheld reports in 12 months suspend posting, 3 suspend account. Ticket bands: under TZS 10M, 10 to 50M, over 50M. Cloud hosting.

## Open (PRD section 18)
1. Agreements and e-signing (UC-24 to 27): keep in Phase 1 or drop, as contract management is out of scope.
2. Cloud provider and data region, checked against the Personal Data Protection Act 2022. Before pilot.
3. Admin team size for the verification and moderation queues.

## Out of scope Phase 1
Payments, escrow, investment transactions, mentorship, e-commerce, social integrations, members outside Tanzania, public content beyond landing and sign-up.

## Known gaps in the sources
- Use case diagram is pre-v1.1 (21 use cases, Plan has 43). The Plan covers all 21 except: separate Professional and Business dashboards (UC11, UC12) are replaced by one Member dashboard, and Admin posting opportunities (UC16) is gone, only Level 3 posters post. Status check (UC02), notifications (UC04) and viewing news/opportunities (UC13, UC14) exist as FRs, not as Plan use cases.
- PRD "Proposed" values (OTP 5 min/3 attempts, lockout 5 fails/15 min, 30 requests/day, 5-year log retention, etc.) are defaults, not decisions.
- No tech stack, budget or team named.
