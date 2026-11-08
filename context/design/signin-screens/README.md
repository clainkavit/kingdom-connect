# Sign-in and registration screens

The member app's screens from landing to "Under review", on a phone and on a computer, drawn on 8 November 2026. They follow PRD section 6 and docs/screens.md S01 to S06. The live, clickable version is the "Kingdom Connect sign-in screens" design canvas on claude.ai. These files are a copy of it.

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

## Not decided yet

These screens show proposals that still need Champion's answer. Build from the PRD until they are decided.

- **Categories (#161).** Step 2 offers Professional, Businessperson and Other, tick all that apply. Entrepreneur and Student are removed. Proof for each category comes after sign-up.
- **Other (#161).** Ticking Other opens a page asking what the member hopes to find: they have a business idea, they are looking for investors, or something else, with a few words. The PRD today asks Other for a short description only. There is no "I want to invest" choice, because the investor flag stays private and is granted by an administrator (PRD section 11).
- **Under review (#180).** S06 says "You will get a notification when the review is done", with no expected review time.
- **Forgot password.** Not in the PRD yet. It needs a story or a ticket before it is built.

The names, ID number and business on the screens are made-up examples. The sector list on step 3 is a placeholder for the 16 starter sectors.
