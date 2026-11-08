/** Checks for the idea form that need no database (I01). */

export const IDEA_STAGES = ["idea", "prototype", "early_revenue", "growing"] as const;
export type IdeaStage = (typeof IDEA_STAGES)[number];
export const IDEA_SEEKING = ["investor", "partner", "both"] as const;
export type IdeaSeeking = (typeof IDEA_SEEKING)[number];

export type IdeaDraft = {
  title: string;
  problem: string;
  sectorId: string;
  stage: IdeaStage | "";
  seeking: IdeaSeeking | "";
  /** Whole Tanzanian shillings, as typed; empty for none. */
  investmentMin: string;
  investmentMax: string;
  showOwner: boolean;
  description: string;
  businessModel: string;
  market: string;
  financials: string;
  team: string;
};

export type IdeaProblem =
  | "title"
  | "problem"
  | "sector"
  | "stage"
  | "seeking"
  | "range"
  | "description"
  | "detail_too_long";

/** A shilling amount typed with or without separators, or null when empty; NaN when it is not a number. */
export function parseTzs(value: string): number | null {
  const clean = value.replace(/[\s,._]/g, "");
  if (clean === "") return null;
  return /^\d{1,15}$/.test(clean) ? Number(clean) : Number.NaN;
}

export function checkIdea(draft: IdeaDraft): IdeaProblem | null {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 120) return "title";
  const problem = draft.problem.trim();
  if (problem.length < 20 || problem.length > 600) return "problem";
  if (!draft.sectorId) return "sector";
  if (!draft.stage) return "stage";
  if (!draft.seeking) return "seeking";
  const min = parseTzs(draft.investmentMin);
  const max = parseTzs(draft.investmentMax);
  if (Number.isNaN(min) || Number.isNaN(max)) return "range";
  if ((min !== null && min <= 0) || (max !== null && max <= 0)) return "range";
  if (min !== null && max !== null && min > max) return "range";
  const description = draft.description.trim();
  if (description.length < 50 || description.length > 5000) return "description";
  if (
    [draft.businessModel, draft.market, draft.financials, draft.team].some(
      (part) => part.trim().length > 3000,
    )
  ) {
    return "detail_too_long";
  }
  return null;
}
