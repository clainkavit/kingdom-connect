/** Posting form rules, PRD section 10 and docs/screens.md S20. The database checks the same rules. */

export const opportunityTypes = ["job", "partnership", "collaboration", "investment"] as const;
export type OpportunityType = (typeof opportunityTypes)[number];

/** Every type a post can be; a tender has its own fields (O04). */
export const postTypes = [...opportunityTypes, "tender"] as const;
export type PostType = (typeof postTypes)[number];

export const employmentTypes = ["full_time", "part_time", "contract", "internship"] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const opportunityLimits = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 100,
  descriptionMax: 5000,
  maxSkills: 5,
  maxClosingDays: 90,
} as const;

/** The tender fields' limits, as the database checks them (O04). */
export const tenderLimits = {
  referenceMin: 2,
  referenceMax: 60,
  scopeMin: 30,
  scopeMax: 3000,
  eligibilityMax: 2000,
  maxDocuments: 10,
  documentMax: 120,
  fileMaxBytes: 10 * 1024 * 1024,
} as const;

/** A tender's own fields. The issuing organisation is the poster's business, or the platform for an admin post. */
export type TenderInput = {
  referenceNo: string;
  scope: string;
  eligibility: string;
  /** One required document per line. */
  requiredDocuments: string;
  /** HH:MM, Tanzania time, on the closing date. */
  closingTime: string;
  /** Whole Tanzanian shillings, as typed; empty for none. */
  estimatedValue: string;
  documentPath: string | null;
};

export const emptyTender: TenderInput = {
  referenceNo: "",
  scope: "",
  eligibility: "",
  requiredDocuments: "",
  closingTime: "17:00",
  estimatedValue: "",
  documentPath: null,
};

export const documentLines = (text: string) =>
  text
    .split("\n")
    .map((d) => d.trim())
    .filter(Boolean);

/** The tender object save_opportunity() takes. */
export function tenderPayload(input: { tender: TenderInput }) {
  const value = input.tender.estimatedValue.replace(/[\s,]/g, "");
  return {
    reference_no: input.tender.referenceNo.trim(),
    scope: input.tender.scope.trim(),
    eligibility: input.tender.eligibility.trim(),
    required_documents: documentLines(input.tender.requiredDocuments),
    closing_time: input.tender.closingTime,
    estimated_value_tzs: value === "" ? null : Number(value),
    document_path: input.tender.documentPath,
  };
}

/** Whether a tender's fields pass the server's checks. */
export function tenderValid(tender: TenderInput): boolean {
  const ref = tender.referenceNo.trim();
  const scope = tender.scope.trim();
  const docs = documentLines(tender.requiredDocuments);
  const value = tender.estimatedValue.replace(/[\s,]/g, "");
  return (
    ref.length >= tenderLimits.referenceMin &&
    ref.length <= tenderLimits.referenceMax &&
    scope.length >= tenderLimits.scopeMin &&
    scope.length <= tenderLimits.scopeMax &&
    tender.eligibility.trim().length <= tenderLimits.eligibilityMax &&
    docs.length <= tenderLimits.maxDocuments &&
    docs.every((d) => d.length <= tenderLimits.documentMax) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(tender.closingTime) &&
    (value === "" || /^\d{1,13}$/.test(value))
  );
}

export type OpportunityInput = {
  type: PostType | "";
  title: string;
  role: string;
  employmentType: EmploymentType | "";
  remote: boolean;
  regionId: string;
  districtId: string;
  sectorId: string;
  description: string;
  closingOn: string;
  skills: string[];
  noFee: boolean;
  tender: TenderInput;
};

export type OpportunityProblem =
  | "invalid_type"
  | "invalid_title"
  | "invalid_employment"
  | "invalid_location"
  | "invalid_sector"
  | "too_short"
  | "too_long"
  | "invalid_closing"
  | "skills_required"
  | "too_many_skills"
  | "no_fee_required"
  | "invalid_tender";

export type OpportunityResult =
  | "ok"
  | OpportunityProblem
  | "level3_required"
  | "posting_paused"
  | "not_editable"
  | "contact_details"
  | "invalid_tender_file"
  | "failed";

export const skillsRequired = (type: PostType | "") => type === "job" || type === "collaboration";

const DAY_MS = 86_400_000;

/** The first problem with the form, checked in the order the server checks it; null when it can be sent. */
export function opportunityProblem(
  input: OpportunityInput,
  { staff, today }: { staff: boolean; today: string },
): OpportunityProblem | null {
  const title = input.title.trim();
  const description = input.description.trim();
  const closingDays = (Date.parse(input.closingOn) - Date.parse(today)) / DAY_MS;
  if (!input.type) return "invalid_type";
  if (title.length < opportunityLimits.titleMin || title.length > opportunityLimits.titleMax)
    return "invalid_title";
  if ((input.type === "job") !== (input.employmentType !== "")) return "invalid_employment";
  if (!input.remote && !input.regionId) return "invalid_location";
  if (!input.sectorId) return "invalid_sector";
  if (description.length < opportunityLimits.descriptionMin) return "too_short";
  if (description.length > opportunityLimits.descriptionMax) return "too_long";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.closingOn) ||
    !(closingDays > 0 && closingDays <= opportunityLimits.maxClosingDays)
  )
    return "invalid_closing";
  if (input.skills.length > opportunityLimits.maxSkills) return "too_many_skills";
  if (input.skills.length === 0 && skillsRequired(input.type)) return "skills_required";
  if (input.type === "tender" && !tenderValid(input.tender)) return "invalid_tender";
  if (!staff && !input.noFee) return "no_fee_required";
  return null;
}

/**
 * The first problem with a draft, which needs only a type and a title. Whatever else it holds is checked the way
 * the server checks it; the rest waits until the post is sent.
 */
export function draftProblem(
  input: OpportunityInput,
  { today }: { today: string },
): OpportunityProblem | null {
  const title = input.title.trim();
  const tender = input.tender;
  if (!input.type) return "invalid_type";
  if (title.length < opportunityLimits.titleMin || title.length > opportunityLimits.titleMax)
    return "invalid_title";
  if (input.type !== "job" && input.employmentType !== "") return "invalid_employment";
  if (input.description.trim().length > opportunityLimits.descriptionMax) return "too_long";
  if (input.closingOn !== "") {
    const closingDays = (Date.parse(input.closingOn) - Date.parse(today)) / DAY_MS;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.closingOn) ||
      !(closingDays > 0 && closingDays <= opportunityLimits.maxClosingDays)
    )
      return "invalid_closing";
  }
  if (input.skills.length > opportunityLimits.maxSkills) return "too_many_skills";
  if (
    input.type === "tender" &&
    (tender.referenceNo.trim().length > tenderLimits.referenceMax ||
      tender.scope.trim().length > tenderLimits.scopeMax ||
      tender.eligibility.trim().length > tenderLimits.eligibilityMax)
  )
    return "invalid_tender";
  return null;
}

const problemStep: Record<OpportunityProblem, number> = {
  invalid_type: 0,
  invalid_title: 0,
  invalid_employment: 0,
  invalid_location: 1,
  invalid_sector: 1,
  too_short: 2,
  too_long: 2,
  invalid_closing: 2,
  skills_required: 2,
  too_many_skills: 2,
  invalid_tender: 2,
  no_fee_required: 3,
};

/** Which step of the posting form (0 to 3) holds the field a problem is about. */
export const postStepOf = (problem: OpportunityProblem): number => problemStep[problem];

/** Skill tags typed as a comma-separated list: lowercased, trimmed, without repeats. */
export function parseSkills(text: string): string[] {
  const tags = text
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(tags)];
}
