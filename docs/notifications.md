# Kingdom Connect: notification copy

| Item | Detail |
|---|---|
| Version | 0.1 (draft), 22 October 2026 |
| Ticket | [Notification copy in English and Kiswahili](https://github.com/clainkavit/kingdom-connect/issues/14) |
| Built on | [docs/prd.md](prd.md) section 14 |
| Status | English is a first draft. **Every Kiswahili line needs native review** before release; Champion reviews it line by line |

The text of every notification in PRD section 14, in English and Kiswahili. Each event has a **Title** (also the email subject and the push title) and a **Message**.

## Rules

- **Friendly and short.** One or two sentences, and the next action named when there is one. Kiswahili is standard Tanzanian Kiswahili, informal "wewe".
- **Never name an anonymous investor.** The idea owner sees "A verified investor", the sector and the ticket band, and nothing else, until the NDA is accepted.
- **Never include contact details.** No phone numbers, emails or addresses, in any channel.
- **A new-message push says "You have a new message"** with no preview. The in-app line may name the sender, who is already a connection.
- **The platform name is never typed in.** Use `{platform_name}`, because the final name is decided late (PRD section 13, Legal texts).
- **Channels** follow PRD section 14: in-app bell, email, and push once the mobile apps ship. The weekly Scan digest is email only, and report outcomes are in-app only.

## Placeholders

| Placeholder | Filled with |
|---|---|
| `{platform_name}` | The platform name from `platform_settings` |
| `{name}` | The other member's display name |
| `{title}` | The title of the opportunity, training or event |
| `{idea_title}` | The title of the idea |
| `{role}` | Investor, Partner or Both |
| `{sector}`, `{band}` | Sector focus and ticket band (under TZS 10M, TZS 10 to 50M, over TZS 50M) |
| `{reason}` | The reason an admin wrote |
| `{item}` | The idea or opportunity a milestone plan belongs to |
| `{milestone}` | A milestone title |
| `{code}` | The 6-digit login code |
| `{level}`, `{days}` | Business level (2 or 3) and days until expiry |
| `{time}`, `{count}`, `{ref}` | Start time, a number, and a report reference number |

## 1. Account and registration

### A1 Registration received
To: applicant. Channels: in-app, email.
- **EN** Title: We got your application. Message: Thanks for joining {platform_name}. We are checking your details and will tell you the result soon.
- **SW** Title: Tumepokea ombi lako. Message: Asante kwa kujiunga na {platform_name}. Tunakagua taarifa zako na tutakujulisha matokeo hivi karibuni.

### A2 Registration approved
To: applicant. Channels: in-app, email, push.
- **EN** Title: Welcome to {platform_name}. Message: Your account is approved. Sign in to get started.
- **SW** Title: Karibu {platform_name}. Message: Akaunti yako imeidhinishwa. Ingia ili uanze.

### A3 Registration rejected (first time)
To: applicant. Channels: in-app, email, push.
- **EN** Title: We could not approve your application. Message: Reason: {reason}. You can fix this and send it again once.
- **SW** Title: Hatukuweza kuidhinisha ombi lako. Message: Sababu: {reason}. Unaweza kurekebisha na kutuma tena mara moja.

### A4 Registration rejected (final)
To: applicant. Channels: in-app, email, push.
- **EN** Title: Your application was not approved. Message: Reason: {reason}. This decision is final unless an admin reopens it.
- **SW** Title: Ombi lako halikuidhinishwa. Message: Sababu: {reason}. Uamuzi huu ni wa mwisho, isipokuwa msimamizi aufungue tena.

### A5 Login code
To: member. Channels: email only.
- **EN** Title: Your {platform_name} code. Message: Your code is {code}. It works for 10 minutes. Do not share it with anyone. If you did not try to sign in, ignore this email.
- **SW** Title: Msimbo wako wa {platform_name}. Message: Msimbo wako ni {code}. Unatumika kwa dakika 10. Usimpe mtu yeyote. Kama hukujaribu kuingia, puuza barua pepe hii.

## 2. Business levels

### B1 Business level approved
To: business member. Channels: in-app, email.
- **EN** Title: Your business is verified. Message: You now have Level {level}. Check what is new on your dashboard.
- **SW** Title: Biashara yako imethibitishwa. Message: Sasa uko Kiwango cha {level}. Angalia mambo mapya kwenye dashibodi yako.

### B2 Business level rejected
To: business member. Channels: in-app, email.
- **EN** Title: We could not approve your business. Message: Reason: {reason}. You can upload new documents and try again.
- **SW** Title: Hatukuweza kuidhinisha biashara yako. Message: Sababu: {reason}. Unaweza kupakia hati mpya na kujaribu tena.

### B3 Business licence expiring
To: business member (30 days and 7 days before). Channels: in-app, email.
- **EN** Title: Your licence expires soon. Message: It expires in {days} days. Upload a new one to keep your Level {level} rights.
- **SW** Title: Leseni yako inakaribia kuisha. Message: Inaisha baada ya siku {days}. Pakia mpya ili ubaki na haki za Kiwango cha {level}.

### B4 Business rights paused
To: business member. Channels: in-app, email.
- **EN** Title: Your Level {level} rights are paused. Message: Your licence has expired. Upload a new one and we will review it.
- **SW** Title: Haki zako za Kiwango cha {level} zimesitishwa. Message: Leseni yako imeisha muda. Pakia mpya nasi tutaipitia.

## 3. Connections and messages

### C1 Connection request received
To: member. Channels: in-app, email, push.
- **EN** Title: New connection request. Message: {name} wants to connect with you. Accept or decline.
- **SW** Title: Ombi jipya la kuunganishwa. Message: {name} anataka kuunganishwa nawe. Kubali au kataa.

### C2 Connection request accepted
To: requester. Channels: in-app, email, push.
- **EN** Title: You are connected. Message: {name} accepted your request. You can message each other now.
- **SW** Title: Mmeunganishwa. Message: {name} amekubali ombi lako. Sasa mnaweza kutumiana ujumbe.

### C3 New message
To: member. Channels: in-app, push, email digest.
- **EN** In-app: New message from {name}. Push: You have a new message. Email digest: You have {count} new messages on {platform_name}.
- **SW** In-app: Ujumbe mpya kutoka kwa {name}. Push: Una ujumbe mpya. Email digest: Una jumbe {count} mpya kwenye {platform_name}.

## 4. Opportunities

### O1 Application received
To: poster. Channels: in-app, email.
- **EN** Title: New application. Message: {name} applied for {title}. Take a look.
- **SW** Title: Ombi jipya. Message: {name} ametuma maombi ya {title}. Liangalie.

### O2 Interest received
To: poster (for partnerships, collaborations, investments and tenders). Channels: in-app, email.
- **EN** Title: New interest. Message: {name} is interested in {title}. Take a look.
- **SW** Title: Nia mpya. Message: {name} ameonyesha nia kwenye {title}. Angalia.

### O3 Response shortlisted
To: member who applied or showed interest. Channels: in-app, email, push.
- **EN** Title: Good news. Message: You are on the shortlist for {title}.
- **SW** Title: Habari njema. Message: Uko kwenye orodha fupi ya {title}.

### O4 Response declined
To: member who applied or showed interest. Channels: in-app, email, push.
- **EN** Title: Update on {title}. Message: This one did not work out. Keep looking, there are more opportunities.
- **SW** Title: Taarifa kuhusu {title}. Message: Safari hii haikufanikiwa. Endelea kutafuta, kuna fursa nyingine.

### O5 Post approved
To: poster. Channels: in-app, email, push.
- **EN** Title: Your post is live. Message: {title} is approved and members can see it now.
- **SW** Title: Tangazo lako limeanza kuonekana. Message: {title} limeidhinishwa na wanachama wanaweza kuliona sasa.

### O6 Post rejected
To: poster. Channels: in-app, email, push.
- **EN** Title: Your post was not approved. Message: {title}: {reason}. You can edit it and send it again.
- **SW** Title: Tangazo lako halikuidhinishwa. Message: {title}: {reason}. Unaweza kulihariri na kulituma tena.

### O7 Post hidden
To: poster. Channels: in-app, email.
- **EN** Title: Your post is hidden for now. Message: Someone reported {title}. Our team is reviewing it.
- **SW** Title: Tangazo lako limefichwa kwa muda. Message: Mtu ameripoti {title}. Timu yetu inalipitia.

### O8 Post removed
To: poster. Channels: in-app, email.
- **EN** Title: Your post was removed. Message: {title}: {reason}.
- **SW** Title: Tangazo lako limeondolewa. Message: {title}: {reason}.

## 5. Ideas

### I1 Interest in my idea (named)
To: idea owner. Channels: in-app, email.
- **EN** Title: Someone is interested in your idea. Message: {name} wants to see {idea_title} as {role}. Review the request.
- **SW** Title: Mtu anavutiwa na wazo lako. Message: {name} anataka kuona {idea_title} kama {role}. Pitia ombi lake.

### I2 Interest in my idea (anonymous)
To: idea owner. Channels: in-app, email. Never includes a name.
- **EN** Title: A verified investor is interested. Message: Interest in {idea_title}. Sector focus: {sector}. Range: {band}. Review the request.
- **SW** Title: Mwekezaji aliyethibitishwa anavutiwa. Message: Nia kwenye {idea_title}. Eneo analolenga: {sector}. Kiwango: {band}. Pitia ombi.

### I3 Idea access approved
To: requester. Channels: in-app, email, push.
- **EN** Title: Your request was approved. Message: Accept the NDA to open the details of {idea_title}.
- **SW** Title: Ombi lako limekubaliwa. Message: Kubali makubaliano ya usiri (NDA) ili kufungua maelezo ya {idea_title}.

### I4 Idea access declined
To: requester. Channels: in-app, email. Neutral wording, no reason.
- **EN** Title: Update on your request. Message: Your request for {idea_title} was not approved.
- **SW** Title: Taarifa kuhusu ombi lako. Message: Ombi lako la {idea_title} halikukubaliwa.

### I5 NDA accepted
To: owner and requester. Channels: in-app, email, push.
- **EN** Title: NDA accepted. Message: You can now see each other's profiles and message about {idea_title}.
- **SW** Title: Makubaliano ya usiri yamekubaliwa. Message: Sasa mnaweza kuona wasifu wa kila mmoja na kutumiana ujumbe kuhusu {idea_title}.

### I6 Idea access revoked
To: requester. Channels: in-app, email.
- **EN** Title: Access removed. Message: The owner has removed your access to {idea_title}.
- **SW** Title: Ufikiaji umeondolewa. Message: Mmiliki ameondoa ufikiaji wako wa {idea_title}.

## 6. Milestone plans

### P1 Plan proposed
To: the other member. Channels: in-app, email, push.
- **EN** Title: A plan is waiting for you. Message: {name} proposed a milestone plan for {item}. Review it and accept.
- **SW** Title: Mpango unakusubiri. Message: {name} amependekeza mpango wa hatua kwa {item}. Upitie na uukubali.

### P2 Plan reminder (day 7)
To: the other member. Channels: in-app, email.
- **EN** Title: Reminder: plan waiting. Message: {name}'s plan for {item} expires in 7 days.
- **SW** Title: Ukumbusho: mpango unasubiri. Message: Mpango wa {name} kwa {item} unaisha baada ya siku 7.

### P3 Plan accepted
To: the member who proposed. Channels: in-app, email.
- **EN** Title: Plan accepted. Message: {name} accepted the plan for {item}. Stage 1 is agreed. You can withdraw within 1 hour.
- **SW** Title: Mpango umekubaliwa. Message: {name} amekubali mpango wa {item}. Hatua ya 1 imekubaliwa. Unaweza kujitoa ndani ya saa 1.

### P4 Milestone done
To: the other member. Channels: in-app, email.
- **EN** Title: A milestone is done. Message: {name} marked {milestone} as done. Please confirm.
- **SW** Title: Hatua imekamilika. Message: {name} ameweka {milestone} kuwa imekamilika. Tafadhali thibitisha.

### P5 Milestone confirmed
To: the member responsible. Channels: in-app, email.
- **EN** Title: Milestone confirmed. Message: {name} confirmed {milestone}.
- **SW** Title: Hatua imethibitishwa. Message: {name} amethibitisha {milestone}.

### P6 Signed document uploaded
To: the other member. Channels: in-app, email.
- **EN** Title: Signed agreement uploaded. Message: {name} uploaded the signed agreement for {item}. Please upload yours.
- **SW** Title: Makubaliano yaliyosainiwa yamepakiwa. Message: {name} amepakia makubaliano yaliyosainiwa ya {item}. Tafadhali pakia yako.

### P7 Plan completed
To: both members. Channels: in-app, email.
- **EN** Title: Plan completed. Message: The plan for {item} is complete. Both signed agreements are saved.
- **SW** Title: Mpango umekamilika. Message: Mpango wa {item} umekamilika. Makubaliano yote mawili yaliyosainiwa yamehifadhiwa.

### P8 Plan lapsed
To: the member who proposed. Channels: in-app, email.
- **EN** Title: Your plan expired. Message: {name} did not respond to the plan for {item} in 14 days. You can start it again.
- **SW** Title: Mpango wako umeisha muda. Message: {name} hakujibu mpango wa {item} ndani ya siku 14. Unaweza kuuanzisha tena.

### P9 Plan withdrawn
To: both members. Channels: in-app, email.
- **EN** Title: Plan withdrawn. Message: The plan for {item} was withdrawn by {name}.
- **SW** Title: Mpango umefutwa. Message: Mpango wa {item} umefutwa na {name}.

## 7. Matches, training and events

### S1 Matches from Scan for Opportunities
To: member. Channels: in-app, weekly email digest.
- **EN** Title: New matches for you. Message: {count} new opportunities match your skills and location this week.
- **SW** Title: Fursa mpya kwa ajili yako. Message: Fursa {count} mpya zinaendana na ujuzi wako na eneo lako wiki hii.

### T1 Training or event reminder (1 day before)
To: registrant. Channels: in-app, email.
- **EN** Title: Tomorrow: {title}. Message: It starts at {time}. See you there.
- **SW** Title: Kesho: {title}. Message: Inaanza saa {time}. Tutaonana huko.

### T2 Training or event reminder (1 hour before)
To: registrant. Channels: in-app, email.
- **EN** Title: Starting soon: {title}. Message: It starts in 1 hour, at {time}.
- **SW** Title: Inaanza muda mfupi: {title}. Message: Inaanza baada ya saa 1, saa {time}.

### W1 Waitlist place confirmed
To: member who was waiting. Channels: in-app, email.
- **EN** Title: You got a place. Message: A spot opened up for {title}, and it is yours.
- **SW** Title: Umepata nafasi. Message: Nafasi imepatikana kwenye {title}, na ni yako.

## 8. Reports and investors

### R1 Report outcome: action taken
To: reporter. Channels: in-app only. No details of the case.
- **EN** Title: We reviewed your report. Message: Report {ref}: we took action. Thank you for helping keep {platform_name} safe.
- **SW** Title: Tumepitia ripoti yako. Message: Ripoti {ref}: tumechukua hatua. Asante kwa kusaidia kuweka {platform_name} salama.

### R2 Report outcome: no action
To: reporter. Channels: in-app only. No details of the case.
- **EN** Title: We reviewed your report. Message: Report {ref}: no action was needed. Thank you for helping keep {platform_name} safe.
- **SW** Title: Tumepitia ripoti yako. Message: Ripoti {ref}: hakuna hatua iliyohitajika. Asante kwa kusaidia kuweka {platform_name} salama.

### V1 Investor tools granted
To: the member who received the flag. Channels: in-app, email. Only that member ever sees this.
- **EN** Title: You now have investor tools. Message: You can show interest anonymously, browse without being seen, use investor filters and keep a saved list. Only you and admins can see this.
- **SW** Title: Sasa una zana za mwekezaji. Message: Unaweza kuonyesha nia bila kujulikana, kuvinjari kimya kimya, kutumia vichujio vya mwekezaji na kuhifadhi orodha yako. Ni wewe na wasimamizi pekee mnaoweza kuona hili.

## 9. Security and admin actions

### L1 Account locked after failed sign-ins
To: member. Channels: email only, because the member cannot open the app while locked.
- **EN** Title: Your account is locked for 15 minutes. Message: There were 5 failed sign-in attempts. Try again after 15 minutes. If this was not you, change your password afterwards.
- **SW** Title: Akaunti yako imefungwa kwa dakika 15. Message: Kumekuwa na majaribio 5 ya kuingia yaliyoshindwa. Jaribu tena baada ya dakika 15. Kama si wewe, badilisha nenosiri lako baadaye.

### X1 Account suspended
To: member. Channels: email only.
- **EN** Title: Your account is suspended. Message: Reason: {reason}. An admin will review it.
- **SW** Title: Akaunti yako imesimamishwa. Message: Sababu: {reason}. Msimamizi atalipitia.

### X2 Posting rights paused
To: poster. Channels: in-app, email.
- **EN** Title: Your posting is paused. Message: Reason: {reason}. You cannot post new items until an admin lifts this.
- **SW** Title: Kuchapisha kumesitishwa. Message: Sababu: {reason}. Huwezi kuchapisha mapya hadi msimamizi atakapoliondoa.

### H1 Idea hidden by an admin
To: idea owner. Channels: in-app, email.
- **EN** Title: Your idea is hidden for now. Message: An admin hid {idea_title} while a report is reviewed.
- **SW** Title: Wazo lako limefichwa kwa muda. Message: Msimamizi amelificha {idea_title} wakati ripoti inapitiwa.

### H2 Idea removed
To: idea owner. Channels: in-app, email.
- **EN** Title: Your idea was removed. Message: {idea_title}: {reason}.
- **SW** Title: Wazo lako limeondolewa. Message: {idea_title}: {reason}.

## Not covered

A profile has no separate "hidden" or "removed" state in the PRD: an admin's actions on a profile are a warning or an account suspension, and the suspension is X1. Two admin actions still have no notification: **Warn** and **Edit request to poster** (PRD section 13, criterion 4). Each needs a decision before copy is written.
