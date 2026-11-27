/** O19: reading public tenders and jobs. Each reader turns one source's answer into listings for the review queue. */

export type Listing = {
  external_id: string;
  title: string;
  employer?: string;
  summary?: string;
  details: Record<string, unknown>;
  original_url: string;
  language: "en" | "sw";
  opens_on?: string;
  closing_on?: string;
  closing_time?: string;
  fee_note?: string;
  region?: string;
  district?: string;
  sector?: string;
  translated_title?: string;
  translated_summary?: string;
};

export const NEST_URL = "https://nest.go.tz/gateway/nest-app/graphql";
export const NEST_ENTITY_URL = "https://nest.go.tz/gateway/nest-uaa/graphql";
export const NEST_PAGE = "https://nest.go.tz/tenders/published-tenders";
export const AJIRA_URL = "https://portal.ajira.go.tz/candidates/graphql";
export const AJIRA_PAGE = "https://portal.ajira.go.tz/vacancies";
export const CRDB_URL =
  "https://careers.crdbbank.co.tz/api/v1/requisitions/job-posts/open?pageNumber=0&pageSize=100&status=INTERVIEW";
export const CRDB_PAGE = "https://careers.crdbbank.co.tz/jobs";

export const TENDER_FEE_NOTE = "Fees or bid security may apply. See the official notice.";

export function nestQuery(page: number, pageSize = 100) {
  return {
    operationName: "getPublishedEntityViewData",
    variables: {
      input: {
        page,
        pageSize,
        fields: [{ fieldName: "invitationDate", isSortable: true, orderDirection: "DESC" }],
        mustHaveFilters: [{ fieldName: "entityStatus", operation: "IN", inValues: ["PUBLISHED"] }],
      },
    },
    query:
      "query getPublishedEntityViewData($input: DataRequestInputInput) { items: getPublishedEntityViewData(input: $input) { totalPages currentPage hasNext rows: data { descriptionOfTheProcurement entityNumber entityType entityUuid invitationDate procurementCategoryName entitySubCategoryName procuringEntityName procuringEntityUuid submissionOrOpeningDate } } }",
  };
}

export function nestEntityQuery(uuid: string) {
  return {
    operationName: "getProcuringEntityDetailsByUuid",
    variables: { uuid },
    query:
      "query getProcuringEntityDetailsByUuid($uuid: String) { getProcuringEntityDetailsByUuid(uuid: $uuid) { code data { uuid name region { areaName } district { areaName } } } }",
  };
}

export const AJIRA_QUERY = {
  query:
    "{ getVacancies { id openDate closeDate noOfPost scheme { codeNo emp { id name } } vacancyStatus { isClosed } } }",
};

const clean = (text: unknown) =>
  typeof text === "string" ? text.replace(/\s+/g, " ").trim() : undefined;
const datePart = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
const timePart = (value: unknown) =>
  typeof value === "string" && /T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : undefined;

type NestRow = {
  descriptionOfTheProcurement?: string;
  entityNumber?: string;
  entityType?: string;
  entityUuid?: string;
  invitationDate?: string;
  procurementCategoryName?: string;
  entitySubCategoryName?: string;
  procuringEntityName?: string;
  procuringEntityUuid?: string;
  submissionOrOpeningDate?: string;
};

/** NeST: one page of published tenders, and whether more pages follow. */
export function readNest(answer: unknown): {
  listings: Listing[];
  entities: string[];
  hasNext: boolean;
} {
  const items = (answer as { data?: { items?: { rows?: NestRow[]; hasNext?: boolean } } })?.data
    ?.items;
  if (!items || !Array.isArray(items.rows)) throw new Error("NeST answered in an unexpected shape");
  const listings: Listing[] = [];
  const entities = new Set<string>();
  for (const row of items.rows) {
    const title = clean(row.descriptionOfTheProcurement);
    if (!row.entityUuid || !title) continue;
    if (row.procuringEntityUuid) entities.add(row.procuringEntityUuid);
    const summary = [clean(row.procurementCategoryName), clean(row.entitySubCategoryName)]
      .filter(Boolean)
      .join(", ");
    listings.push({
      external_id: row.entityUuid,
      title,
      employer: clean(row.procuringEntityName),
      summary: summary || undefined,
      details: {
        reference_no: clean(row.entityNumber),
        type: row.entityType,
        procuring_entity: row.procuringEntityUuid,
      },
      original_url: NEST_PAGE,
      language: "en",
      opens_on: datePart(row.invitationDate),
      closing_on: datePart(row.submissionOrOpeningDate),
      closing_time: timePart(row.submissionOrOpeningDate),
      fee_note: TENDER_FEE_NOTE,
      sector: guessSector(`${title} ${summary}`),
    });
  }
  return { listings, entities: [...entities], hasNext: items.hasNext === true };
}

/** NeST: the region and district of a procuring body, for the suggested location. */
export function readNestEntity(answer: unknown): { region?: string; district?: string } {
  const data = (
    answer as {
      data?: {
        getProcuringEntityDetailsByUuid?: {
          data?: { region?: { areaName?: string }; district?: { areaName?: string } };
        };
      };
    }
  )?.data?.getProcuringEntityDetailsByUuid?.data;
  return { region: clean(data?.region?.areaName), district: clean(data?.district?.areaName) };
}

type AjiraRow = {
  id?: number;
  openDate?: string;
  closeDate?: string;
  noOfPost?: number;
  scheme?: { codeNo?: string; emp?: { name?: string } };
  vacancyStatus?: { isClosed?: boolean };
};

/** The district a council's name points to: "Halmashauri ya Wilaya ya Siha" is Siha. */
export function councilDistrict(employer: string | undefined): string | undefined {
  const match = employer?.match(
    /Halmashauri ya (?:Wilaya|Mji|Manispaa|Jiji)(?: ya| la)? ([A-Za-z'-]+(?: [A-Z][a-z]+)?)/,
  );
  return match?.[1];
}

/** Ajira: open public-service vacancies. Closed ones are left out. */
export function readAjira(answer: unknown): Listing[] {
  const rows = (answer as { data?: { getVacancies?: AjiraRow[] } })?.data?.getVacancies;
  if (!Array.isArray(rows)) throw new Error("Ajira answered in an unexpected shape");
  return rows
    .filter(
      (row) => row.id !== undefined && clean(row.scheme?.codeNo) && !row.vacancyStatus?.isClosed,
    )
    .map((row) => {
      const title = clean(row.scheme?.codeNo)!;
      const employer = clean(row.scheme?.emp?.name);
      return {
        external_id: String(row.id),
        title,
        employer,
        details: { posts: row.noOfPost },
        original_url: AJIRA_PAGE,
        language: "sw" as const,
        opens_on: datePart(row.openDate),
        closing_on: datePart(row.closeDate),
        district: councilDistrict(employer),
        sector: guessSector(`${title} ${employer ?? ""}`),
      };
    });
}

type CrdbRow = {
  id?: number;
  title?: string;
  location?: string;
  businessUnit?: string;
  creationDate?: string;
  deadline?: string;
  status?: string;
};

/** CRDB Bank: open vacancies from its careers site. */
export function readCrdb(answer: unknown): Listing[] {
  const rows = (answer as { data?: { content?: CrdbRow[] } })?.data?.content;
  if (!Array.isArray(rows)) throw new Error("CRDB answered in an unexpected shape");
  return rows
    .filter((row) => row.id !== undefined && clean(row.title) && (row.status ?? "OPEN") === "OPEN")
    .map((row) => {
      const title = clean(row.title)!;
      const unit = clean(row.businessUnit);
      return {
        external_id: String(row.id),
        title,
        employer: "CRDB Bank",
        summary: [unit, clean(row.location)].filter(Boolean).join(", ") || undefined,
        details: { location: clean(row.location) },
        original_url: CRDB_PAGE,
        language: "en" as const,
        opens_on: datePart(row.creationDate),
        closing_on: datePart(row.deadline),
        sector: guessSector(`${title} ${unit ?? ""}`) ?? "Finance",
      };
    });
}

const SECTOR_WORDS: [string, RegExp][] = [
  [
    "Health",
    /\b(health|hospital|medical|clinical|nurs|pharma|afya|hospitali|muuguzi|daktari|tabibu)/i,
  ],
  ["Education", /\b(teacher|school|education|university|college|mwalimu|shule|elimu|chuo)/i],
  ["ICT", /\b(ict|software|computer|network|data|system|digital|wan|lan|kompyuta|tehama)\b/i],
  ["Energy", /\b(electric|energy|power|solar|umeme|nishati)/i],
  ["Construction", /\b(construct|works|building|road|bridge|ujenzi|barabara|jengo)/i],
  ["Agriculture", /\b(agricultur|livestock|fisher|irrigation|veterinar|kilimo|mifugo|uvuvi)/i],
  ["Transport and logistics", /\b(transport|logistic|vehicle|fleet|driver|usafiri|dereva)/i],
  ["Finance", /\b(financ|account|audit|bank|tax|fedha|mhasibu|ukaguzi)/i],
  [
    "Professional services",
    /\b(consult|legal|lawyer|secretary|human resource|office management|sheria|katibu|mwandishi)/i,
  ],
  ["Tourism and hospitality", /\b(touris|hotel|hospitality|utalii)/i],
  ["Mining", /\b(mining|mineral|madini)/i],
  ["Manufacturing", /\b(manufactur|factory|kiwanda)/i],
];

/** A first guess at the sector from the advert's words, for staff to accept or change. */
export function guessSector(text: string): string | undefined {
  return SECTOR_WORDS.find(([, words]) => words.test(text))?.[0];
}

export const AJIRA_ADVERTS_URL =
  "https://www.ajira.go.tz/api/v1/archive?page=1&limit=20&category=vacancies";
export const AJIRA_ADVERTS_PAGE = "https://www.ajira.go.tz/archive?type=vacancies";
export const ajiraAdvertPdf = (token: string) =>
  `https://www.ajira.go.tz/api/v1/vacancies/attachment/token/${token}/download`;

export type Advert = { id: string; title: string; published_on?: string; token: string };

/** Ajira adverts: the newest public-service vacancy notices, each a PDF. */
export function readAjiraAdverts(answer: unknown): Advert[] {
  const items = (answer as { data?: { items?: Record<string, unknown>[] } })?.data?.items;
  if (!Array.isArray(items)) throw new Error("Ajira adverts answered in an unexpected shape");
  return items
    .filter(
      (i) =>
        typeof i.id === "string" &&
        typeof i.download_token === "string" &&
        i.attachment_ext === "pdf",
    )
    .map((i) => ({
      id: i.id as string,
      title: clean(i.title) ?? "",
      published_on: datePart(i.published_at),
      token: i.download_token as string,
    }));
}

export const GEMINI_MODEL = "gemini-3.1-flash-lite";
export const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const POSTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    posts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          employer: { type: "STRING", nullable: true },
          number_of_posts: { type: "INTEGER", nullable: true },
          closing_date: { type: "STRING", nullable: true },
          region: { type: "STRING", nullable: true },
          district: { type: "STRING", nullable: true },
          language: { type: "STRING", enum: ["en", "sw"] },
          summary: { type: "STRING", nullable: true },
          title_translated: { type: "STRING", nullable: true },
          summary_translated: { type: "STRING", nullable: true },
        },
        required: ["title", "language"],
      },
    },
  },
  required: ["posts"],
};

/** Ask Gemini to list every vacant post in one advert PDF (text or scanned), with a translation of each. */
export function geminiAdvertRequest(pdfBase64: string, advertTitle: string) {
  return {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          {
            text:
              `This is a Tanzanian public-service vacancy advert titled "${advertTitle}". ` +
              "List every vacant post it advertises. For each post give: the post title as written; the employer; " +
              "the number of posts; the closing date for applications as YYYY-MM-DD; the region and district of the " +
              "duty station if stated; the language of the advert (en or sw); a one-line summary (under 200 characters) " +
              "of the main requirement in the advert's language; and the title and summary translated into the other " +
              "language (English if the advert is Swahili, Swahili if it is English). Use null for anything not stated. " +
              "Do not invent details.",
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: POSTS_SCHEMA,
      temperature: 0,
    },
  };
}

/** The text Gemini returned, or nothing if it answered with no candidate. */
export function geminiText(answer: unknown): string | undefined {
  const parts = (answer as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    ?.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? "").join("");
  return text || undefined;
}

type GeminiPost = {
  title?: string;
  employer?: string | null;
  number_of_posts?: number | null;
  closing_date?: string | null;
  region?: string | null;
  district?: string | null;
  language?: string;
  summary?: string | null;
  title_translated?: string | null;
  summary_translated?: string | null;
};

/** The listings from Gemini's reading of one advert. Each post is "<advert id>#<n>". */
export function readAdvertPosts(answer: unknown, advert: Advert): Listing[] {
  const text = geminiText(answer);
  if (!text) throw new Error("Gemini gave no answer for an advert");
  const posts = (JSON.parse(text) as { posts?: GeminiPost[] }).posts;
  if (!Array.isArray(posts)) throw new Error("Gemini answered an advert in an unexpected shape");
  return posts
    .filter((p) => clean(p.title))
    .map((p, n) => {
      const title = clean(p.title)!;
      const employer = clean(p.employer ?? undefined);
      const summary = clean(p.summary ?? undefined);
      return {
        external_id: `${advert.id}#${n + 1}`,
        title,
        employer,
        summary,
        details: { posts: p.number_of_posts ?? undefined, advert: advert.title },
        original_url: AJIRA_ADVERTS_PAGE,
        language: p.language === "en" ? "en" : "sw",
        opens_on: advert.published_on,
        closing_on: datePart(p.closing_date ?? undefined),
        region: clean(p.region ?? undefined),
        district: clean(p.district ?? undefined) ?? councilDistrict(employer),
        sector: guessSector(`${title} ${summary ?? ""} ${employer ?? ""}`),
        translated_title: clean(p.title_translated ?? undefined),
        translated_summary: clean(p.summary_translated ?? undefined),
      };
    });
}

/** Ask Gemini to translate short texts: Swahili into English, English into Swahili, in the same order. */
export function geminiTranslateRequest(items: { text: string; language: "en" | "sw" }[]) {
  return {
    contents: [
      {
        parts: [
          {
            text:
              "Translate each item: Swahili (sw) into English, English (en) into Swahili. These are titles and short " +
              "summaries of Tanzanian job and tender adverts. Keep names, numbers and acronyms as they are. Return " +
              "the translations in the same order, one per item.\n" +
              JSON.stringify(items),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "STRING" } },
      temperature: 0,
    },
  };
}

/** The translations from Gemini's answer, matched to the inputs by position; nothing where it did not answer. */
export function readTranslations(answer: unknown, count: number): (string | undefined)[] {
  let list: unknown = [];
  try {
    list = JSON.parse(geminiText(answer) ?? "[]");
  } catch {
    list = [];
  }
  const rows = Array.isArray(list) && list.length === count ? list : [];
  return Array.from({ length: count }, (_, i) => clean(rows[i]) || undefined);
}
