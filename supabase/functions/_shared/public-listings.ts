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

export const AZURE_TRANSLATE_URL =
  "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en&to=sw";

type AzureAnswer = {
  detectedLanguage?: { language?: string };
  translations?: { text: string; to: string }[];
}[];

/**
 * The other-language text for each input, from Azure's answer: Swahili text gets English and the rest Swahili.
 * An input already in the target language, or missing from the answer, gets nothing.
 */
export function pickTranslations(
  answer: unknown,
  sourceLanguages: ("en" | "sw")[],
): (string | undefined)[] {
  const rows = Array.isArray(answer) ? (answer as AzureAnswer) : [];
  return sourceLanguages.map((fallback, i) => {
    const row = rows[i];
    const detected =
      row?.detectedLanguage?.language === "sw"
        ? "sw"
        : row?.detectedLanguage?.language === "en"
          ? "en"
          : fallback;
    const target = detected === "sw" ? "en" : "sw";
    const text = row?.translations?.find((t) => t.to === target)?.text?.trim();
    return text || undefined;
  });
}
