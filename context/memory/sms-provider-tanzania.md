---
name: sms-provider-tanzania
description: Which SMS providers reach Tanzanian networks, what one SMS costs, TCRA sender ID rules, and how Supabase Auth can send phone sign-in codes through any of them (ticket #272)
metadata:
  type: reference
---

# SMS provider for phone sign-in in Tanzania (#272)

Findings dated 14 November 2026. Every price below was read on that date from the provider's own page. Prices change without notice, so re-check before paying. Sources are numbered at the end. Anything marked UNVERIFIED could not be confirmed from a primary source.

Context: the PRD lets a member sign in with a phone number and a 6-digit SMS code, valid 10 minutes, 3 attempts, resend after 60 seconds (docs/prd.md section 6, criterion 9; REG-7).

## Answer in short

- **Recommend Africa's Talking, with Beem as the fallback.** Both are local-route providers at TZS 20 per SMS, list all Tanzanian networks, and are cheap enough that cost does not decide it. Twilio and Bird cost roughly 40 to 55 times more per SMS for the same message (rough: uses an unchecked rate of about TZS 2,500 per USD).
- **A registered alphanumeric sender ID is required on every route**, local or international. Plan 1 to 4 weeks for it and start it first. It needs a signed, stamped letter from an organisation, which is the real blocker while Kingdom Connect is not a registered company.
- **Supabase fits any provider** through the Send SMS hook (Free and Pro plans), or through the existing custom OTP edge functions with SMS as a second sender.

## Volume estimate (assumption, not measured)

Sessions stay signed in through refresh tokens, so most members do not need a code every visit. Assumed 2 to 4 phone sign-ins per member per month, plus about 20% resends.

| Members | Codes per month | Note |
|---|---|---|
| 300 | about 700 | low end of the pilot |
| 1,000 | about 2,500 to 5,000 | |
| 3,000 | about 7,000 to 15,000 | high end, every member on phone sign-in |

The PRD also lists an SMS confirmation on registration submit (section 6, step 4). That adds one SMS per applicant if it is switched on.

## Providers and price per SMS to Tanzania

All read 14 Nov 2026. One SMS is 160 GSM characters; longer or with special characters it splits and is charged per part [3][7].

| Provider | Price per SMS | Setup or monthly fee | Networks named | Source |
|---|---|---|---|---|
| NextSMS (local) | TZS 16.00 (1 to 5,000 per month), TZS 15.00 (5,001 to 50,000) | none listed, "No hidden fees" | "All networks" | [1] |
| Beem Africa (local) | TZS 20 (1 to 10,000), TZS 18 (10,001 to 25,000) | none listed for bulk SMS | "All networks" | [2] |
| Africa's Talking (local) | TZS 20 (Basic plan, spend TZS 0 to 499,999), TZS 19 (Plus plan) | Tanzania sender ID fee not shown, UNVERIFIED | Vodacom, Airtel, Zantel, Halotel, TTCL, Tigo | [3] |
| FastHub (local) | not published, UNVERIFIED | not published | Vodacom, Airtel, Yas, Halotel, TTCL | [4] |
| Bird (formerly MessageBird) | USD 0.32 per segment, alphanumeric sender | none on pay as you go; carrier and registration fees "separate" | not listed per network | [5] |
| Twilio | USD 0.4336 per segment, alphanumeric or international number | failed message fee USD 0.001; optional SMS pumping protection USD 0.025 per SMS | registration required for Tigo, Zantel, Vodacom, Airtel | [6][7] |
| Vonage | UNVERIFIED. The pricing page showed USD 0.0086 with Tanzania selected, but that is the same as its US price, so the widget probably did not update | | | [8] |

Monthly cost at the volume estimate:

| Codes per month | NextSMS | Beem or Africa's Talking | Bird | Twilio |
|---|---|---|---|---|
| 700 | TZS 11,200 | TZS 14,000 | USD 224 | USD 304 |
| 5,000 | TZS 80,000 | TZS 100,000 | USD 1,600 | USD 2,168 |
| 15,000 | about TZS 225,000 | about TZS 270,000 to 300,000 | USD 4,800 | USD 6,504 |

Whether a volume tier applies to the whole month or only to messages above the threshold is not stated on the pages. UNVERIFIED. No exact USD conversion is given for TZS prices, because no exchange rate was checked.

**Delivery reliability.** No provider publishes delivery rates for Tanzania, and I found no independent primary source that measures them. Reliability is UNVERIFIED for every provider. The only way to know is a test send to a Vodacom, Airtel, Yas (Tigo) and Halotel number before choosing.

## TCRA and sender ID rules

- **The law.** The Electronic and Postal Communications (Tele-Traffic) (Amendment) Regulations 2023, GN 425 of 23 June 2023, add regulation 9A. Network licensees must set rules for "originators and sender IDs of A2P SMS traffic", must "ensure that all A2P SMS traffic sender IDs are mapped to official company names or identification of the originator", must detect and block grey routes for international and national A2P SMS, and must give TCRA all agreements with aggregators [9]. So the obligation sits on the networks, and they push it onto every provider.
- **Is a registered alphanumeric sender ID required?** Yes, in practice on all routes. Twilio: registration required for Tigo, Zantel, Vodacom and Airtel, and since 16 June 2025 messages with unregistered sender IDs to those networks are blocked [7]. Vonage: pre-registration is mandatory for Tigo, Zantel and Airtel, unregistered IDs are overwritten [10]. Bird, Beem, NextSMS and Africa's Talking all list "Sender ID registration required" [1][2][3][11].
- **Do international routes replace sender IDs?** They do not avoid registration. Twilio blocks unregistered senders on the four networks and says numeric sender IDs are not supported by Tanzanian operators [7]. Vonage overwrites unregistered and dynamic IDs, and does not support numeric IDs [10]. An overwritten ID means members see an unknown sender on their sign-in code.
- **Name rules.** The ID must carry the brand name; generic IDs such as INFO, SMS, Verify or Notify are refused [7][10]. Operators want the sample message to contain the sender ID, for example "[KingdomConn] Your code is 123456" [12][11]. Alphanumeric IDs are up to 11 characters (Twilio glossary, not re-read here, UNVERIFIED), so "Kingdom Connect" (15) will not fit. A shorter name is a decision for the team.
- **How long.** Africa's Talking: 3 working days per network for Vodacom, Airtel, Tigo and Halotel, from an Africa's Talking staff post in its own community forum, Feb 2026 [13]. FastHub: 3 to 7 working days [4]. Bird: about 10 business days [11]. Twilio: 3 weeks domestic, 4 weeks international [7]. No TCRA page states a time for sender IDs. UNVERIFIED from the regulator.
- **Documents.**
  - Africa's Talking: a consent letter on company letterhead, stamped and signed, naming the sender ID and its purpose [14][15].
  - Twilio: business registration certificate in English, two sender ID authorisation letters, a letter of authorisation to Twilio, all on letterhead with stamp and signature [12].
  - Bird: "supporting business documents" uploaded in the dashboard [11].
  - FastHub: businesses give TIN, business licence and incorporation certificate; NGOs give BRELA and TIN; faith-based organisations give their constitution (Katiba); individuals give an authorisation letter [4].
  - Beem and NextSMS: documents not published. UNVERIFIED.
- **Content rules.** Vonage's Tanzania page says "No political, religious, unsolicited promotion, or gambling content" [10]. Sign-in codes are not religious content, but a church-piloted brand could draw questions on that route. Another reason not to pick Vonage.

**Unregistered company.** Kingdom Connect is not yet a registered company. Every provider asks for a stamped letter from an organisation, and TCRA wants IDs mapped to "official company names or identification of the originator" [9]. Options, for Champion and the collaborator to decide: register through the church (Mkuyuni Community) if it is a registered faith-based organisation, which FastHub accepts by its constitution [4]; or register as an individual where the provider allows it (FastHub says it does [4], the others are UNVERIFIED). Whether TCRA or the networks accept an individual originator for a platform is UNVERIFIED.

## Supabase Auth and phone sign-in

- **Native providers.** The hosted docs list MessageBird, Twilio, Vonage and Textlocal (community supported) [16]. The CLI config adds Twilio Verify, so the full list is `twilio`, `twilio_verify`, `messagebird`, `textlocal`, `vonage` [17]. The native MessageBird sender calls the old `https://rest.messagebird.com` API [18]; whether a new Bird account still works with it is UNVERIFIED. None of the three local Tanzanian providers is native.
- **Send SMS hook.** It "replaces Supabase's built-in SMS sending" and is meant for a regional provider, a fallback provider, or WhatsApp [19]. Available on Free and Pro [20]. It can be a Postgres function or an HTTP endpoint such as an edge function; HTTP hooks should finish in 5 seconds, Postgres hooks in 2 [20]. The payload carries `user.phone` and `sms.otp` (6 digits); a 200 with an empty body means sent [19]. The docs name Africa's Talking as an example of an alternate provider [19]. The edge function verifies the webhook signature with `SEND_SMS_HOOK_SECRET`, then calls the provider's API [19]. For Africa's Talking that is `POST https://api.africastalking.com/version1/messaging/bulk` with an `apiKey` header and `senderId` [21]; its sandbox for this endpoint is marked "coming soon" [21]. Beem's endpoint is `https://apisms.beem.africa/v1/send` [22].
- **Fallback inside the hook.** Because the hook is our own code, it can try the primary provider and call the fallback when the first returns an error, within the 5-second limit [19][20].
- **Native phone OTP behaviour.** One code request per user every 60 seconds by default [16][23]. The docs say codes expire after 1 hour [16] and also that the code must be verified "within 60 seconds" [16]; the source defaults `Sms.OtpExp` to 60 seconds and code length to 6 [18]. The expiry is configurable, so 10 minutes is possible. There is no per-code attempt counter, only an IP limit on `/verify` of 30 requests per 5 minutes [23], so the PRD's 3-attempt rule is not native (same finding as [supabase-auth-login-flow](supabase-auth-login-flow.md)).
- **Rate limits that matter for SMS** [23]: 30 SMS per hour per project by default (configurable, raise it before the pilot); sign-in requests 30 per 5 minutes per IP; verify 30 per 5 minutes per IP. Supabase advises CAPTCHA and tight rate limits to control SMS cost [16]. Twilio sells SMS pumping protection for the same reason [6].
- **Two ways to build it (a decision for the build ticket, not made here).** (a) Native phone sign-in with the Send SMS hook pointed at Africa's Talking; the 3-attempt limit then needs its own code. (b) Reuse the existing custom code path (`supabase/functions/login`, `verify-otp`, `resend-otp`, `_shared/otp.ts`), which already counts attempts, and add SMS as a second sender beside email. (b) keeps one set of code rules; (a) gets Supabase's phone identity for free.
- **Testing without SMS.** Supabase supports test phone numbers with fixed codes (`auth.sms.test_otp`) [16][17]. Development uses test data only, so no real SMS is needed until the pilot.

## Recommendation for the pilot

**Primary: Africa's Talking.**
- Cost: TZS 20 per SMS [3]. About TZS 14,000 to 300,000 a month across the estimate.
- Tanzania: per-network price list covers Vodacom, Airtel, Tigo, Halotel, Zantel and TTCL [3].
- Sender ID: 3 working days per network in its own staff post [13], and the only document named is a one-page consent letter [15].
- Supabase: named in the Send SMS hook docs [19], public REST API with API-key auth [21].
- Unregistered company: the letter still needs a letterhead and stamp [15], so it needs an organisation behind it.

**Fallback: Beem Africa.**
- Cost: TZS 20, dropping to TZS 18 above 10,000 a month [2].
- A separate company and route, so a fault at one provider does not take down sign-in.
- Public send API [22]. Its document list for sender IDs is not published (UNVERIFIED).

**If documents block both:** FastHub is the one provider that states it accepts a faith-based organisation's constitution or an individual's letter [4]. Its prices are not published.

**Cheapest:** NextSMS at TZS 16 [1]. Not chosen as primary because its sender ID documents and API docs were not checked.

**Not recommended:** Twilio (USD 0.4336) and Bird (USD 0.32), roughly 40 to 55 times the local price for the same registered sender ID (same unchecked exchange rate). Vonage: price unverified and a no-religious-content rule.

## Before anyone pays

1. Decide the sender name (11 characters or fewer) and which organisation signs the letter.
2. Open accounts with Africa's Talking and Beem, ask each in writing for the Tanzania sender ID fee, documents and time, and whether an unregistered platform or an individual can register.
3. Send test codes to a Vodacom, Airtel, Yas and Halotel number on each, and time delivery.
4. Record the choice in #272 and docs/prd.md.

## Sources

All read 14 November 2026.

1. NextSMS pricing: https://nextsms.co.tz/pricing
2. Beem coverage and pricing (full SMS table in the page HTML): https://beem.africa/coverage/
3. Africa's Talking pricing (Tanzania bulk SMS table): https://africastalking.com/pricing
4. FastHub Bulk SMS: https://www.bulksms.tz/
5. Bird SMS pricing, Tanzania: https://bird.com/pricing/sms/tz
6. Twilio SMS pricing, Tanzania ("Pricing current as of November 2026"): https://www.twilio.com/en-us/sms/pricing/tz
7. Twilio SMS guidelines, Tanzania: https://www.twilio.com/en-us/guidelines/tz/sms
8. Vonage SMS pricing: https://www.vonage.com/communications-apis/sms/pricing/
9. TCRA, Electronic and Postal Communications (Tele-Traffic) (Amendment) Regulations 2023, GN 425, regulation 9A: https://www.tcra.go.tz/tcra-tovuti/2023/mamlaka-website/documents/regulations/en_1688028305_The_Electronic_and_Postal_Communications_Tele_Traffic_Amendment_Regulations_2023_56cb38723d.pdf
10. Vonage, Tanzania SMS Features and Restrictions (23 Jul 2025): https://api.support.vonage.com/hc/en-us/articles/204017283-Tanzania-SMS-Features-and-Restrictions
11. Bird, SMS to Tanzania (policy updated 13 Jul 2026): https://bird.com/sms-api/features/destinations/tanzania
12. Twilio, documents to register an alphanumeric sender ID in Tanzania: https://help.twilio.com/articles/360042501534-Document-s-Required-and-Instructions-to-Register-Your-Alphanumeric-Sender-ID-in-Tanzania
13. Africa's Talking community, "AT HELP: Comprehensive" (staff post, 24 Feb 2026): https://community.africastalking.com/forum/help-18238/topic/at-help-comprehensive-94/
14. Africa's Talking help, Tanzania Sender ID Registration (16 Jun 2025): https://help.africastalking.com/en/articles/11581672-tanzania-sender-id-registration
15. Africa's Talking consent letter template (PDF attached to [14])
16. Supabase, Phone sign-in (updated 26 Oct 2026): https://supabase.com/docs/guides/auth/phone-login
17. Supabase CLI config (`auth.sms.*`, `auth.hook.*`, `auth.rate_limit.sms_sent`): https://supabase.com/docs/guides/local-development/cli/config
18. Supabase Auth source, SMS defaults and provider config: https://github.com/supabase/auth/blob/master/internal/conf/configuration.go and MessageBird sender: https://github.com/supabase/auth/blob/master/internal/api/sms_provider/messagebird.go
19. Supabase, Send SMS Hook: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
20. Supabase, Auth Hooks (plan table, hook types, timeouts): https://supabase.com/docs/guides/auth/auth-hooks
21. Africa's Talking SMS API docs: https://developers.africastalking.com/docs/sms/sending/bulk
22. Beem SMS page (API example): https://beem.africa/sms/
23. Supabase, Auth rate limits (updated 26 Oct 2026): https://supabase.com/docs/guides/auth/rate-limits
