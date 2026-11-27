# Public listing sources (27 Nov 2026)

How the O19 import reads each source. None offers a documented API; each reader calls the same public endpoint the source's own web page uses, with no sign-in. Saved answers for tests are in `supabase/functions/import-public-listings/fixtures/`.

- **NeST tenders:** `POST https://nest.go.tz/gateway/nest-app/graphql`, operation `getPublishedEntityViewData` with `entityStatus IN PUBLISHED`, paged (209 open tenders on 27 Nov). A procuring body's region and district come from `POST https://nest.go.tz/gateway/nest-uaa/graphql`, `getProcuringEntityDetailsByUuid`. A tender has no address of its own (`/tender-details` keeps it in page state), so listings link to `https://nest.go.tz/tenders/published-tenders` and carry the tender number. Fees and bid security sit in the tender documents, which need a NeST login, so tenders get the "Fees or bid security may apply" note.
- **Ajira:** `POST https://portal.ajira.go.tz/candidates/graphql`, query `getVacancies` (only 5 vacancies, 3 open, on 27 Nov). Most public-service adverts are PDF notices on www.ajira.go.tz, which the import does not read.
- **CRDB Bank:** `GET https://careers.crdbbank.co.tz/api/v1/requisitions/job-posts/open?pageNumber=0&pageSize=100&status=INTERVIEW` (9 open jobs on 27 Nov). The bank's own careers page links there.
- **Azure Translator (F0):** secrets `AZURE_TRANSLATOR_KEY` and, for a regional resource, `AZURE_TRANSLATOR_REGION`, set as Supabase function secrets only. Not set up yet.
- A first local run took under two minutes and saved 218 listings; a second run saved nothing new.
