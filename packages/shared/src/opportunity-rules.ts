/** Posting form rules, PRD section 10 and docs/screens.md S20. The database checks the same rules. */

export const opportunityTypes = ["job", "partnership", "collaboration", "investment"] as const;
export type OpportunityType = (typeof opportunityTypes)[number];

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

export type OpportunityInput = {
  type: OpportunityType | "";
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
  | "no_fee_required";

export type OpportunityResult =
  | "ok"
  | OpportunityProblem
  | "level3_required"
  | "posting_paused"
  | "not_editable"
  | "contact_details"
  | "failed";

export const skillsRequired = (type: OpportunityType | "") =>
  type === "job" || type === "collaboration";

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
  if (!staff && !input.noFee) return "no_fee_required";
  return null;
}

/** Skill tags typed as a comma-separated list: lowercased, trimmed, without repeats. */
export function parseSkills(text: string): string[] {
  const tags = text
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(tags)];
}
