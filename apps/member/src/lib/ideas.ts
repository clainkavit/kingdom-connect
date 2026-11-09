import {
  parseTzs,
  type IdeaDraft,
  type IdeaSeeking,
  type IdeaStage,
  type Language,
} from "@kingdom-connect/shared";
import { sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export type MyIdea = {
  id: string;
  title: string;
  status: "draft" | "pending_moderation" | "published" | "archived" | "hidden" | "removed";
  reviewReason: string | null;
  showOwner: boolean;
  draft: IdeaDraft;
};

/** A published idea as every verified member sees it: never the details (I02). */
export type IdeaSummary = {
  id: string;
  title: string;
  problem: string;
  sectorEn: string;
  sectorSw: string;
  stage: IdeaStage;
  seeking: IdeaSeeking;
  investmentMin: number | null;
  investmentMax: number | null;
  /** Empty when the idea was shared without a name. */
  ownerId: string | null;
  ownerName: string | null;
  interestCount: number;
  isMine: boolean;
};

export const POOL_PAGE = 20;

export type IdeasApi = {
  pool: (page: number) => Promise<IdeaSummary[]>;
  summary: (id: string) => Promise<IdeaSummary | null>;
  byOwner: (memberId: string) => Promise<IdeaSummary[]>;
  mine: () => Promise<MyIdea[]>;
  sectors: (language: Language) => Promise<Option[]>;
  save: (
    id: string | null,
    draft: IdeaDraft,
    submit: boolean,
  ) => Promise<{ result: string; ideaId: string | null }>;
  archive: (id: string) => Promise<string>;
};

type Row = {
  id: string;
  title: string;
  problem: string;
  sector_id: string;
  stage: IdeaStage;
  seeking: IdeaSeeking;
  investment_min_tzs: number | null;
  investment_max_tzs: number | null;
  show_owner: boolean;
  status: MyIdea["status"];
  review_reason: string | null;
  idea_details: {
    description: string;
    business_model: string | null;
    market: string | null;
    financials: string | null;
    team: string | null;
  } | null;
};

export type SummaryRow = {
  id: string;
  title: string;
  problem: string;
  sector_en: string;
  sector_sw: string;
  stage: IdeaStage;
  seeking: IdeaSeeking;
  investment_min_tzs: number | null;
  investment_max_tzs: number | null;
  owner_id: string | null;
  owner_name: string | null;
  interest_count: number;
  is_mine: boolean;
};

const SUMMARY_COLUMNS =
  "id, title, problem, sector_en, sector_sw, stage, seeking, investment_min_tzs, investment_max_tzs, owner_id, owner_name, interest_count, is_mine";

export const toSummary = (r: SummaryRow): IdeaSummary => ({
  id: r.id,
  title: r.title,
  problem: r.problem,
  sectorEn: r.sector_en,
  sectorSw: r.sector_sw,
  stage: r.stage,
  seeking: r.seeking,
  investmentMin: r.investment_min_tzs,
  investmentMax: r.investment_max_tzs,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  interestCount: r.interest_count,
  isMine: r.is_mine,
});

/** S22 and S23: the ideas pool (I02). S27: the member's own ideas, and sharing or editing one (I01). */
export const ideasApi: IdeasApi = {
  async pool(page) {
    const { data, error } = await supabase
      .from("idea_summaries")
      .select(SUMMARY_COLUMNS)
      .order("published_at", { ascending: false })
      .order("id")
      .range(page * POOL_PAGE, page * POOL_PAGE + POOL_PAGE - 1);
    if (error) throw error;
    return (data as SummaryRow[]).map(toSummary);
  },

  async summary(id) {
    const { data, error } = await supabase
      .from("idea_summaries")
      .select(SUMMARY_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toSummary(data as SummaryRow) : null;
  },

  async byOwner(memberId) {
    const { data, error } = await supabase
      .from("idea_summaries")
      .select(SUMMARY_COLUMNS)
      .eq("owner_id", memberId)
      .order("published_at", { ascending: false });
    if (error) throw error;
    return (data as SummaryRow[]).map(toSummary);
  },

  async mine() {
    const { data, error } = await supabase
      .from("ideas")
      .select(
        "id, title, problem, sector_id, stage, seeking, investment_min_tzs, investment_max_tzs, show_owner, status, review_reason, idea_details (description, business_model, market, financials, team)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as Row[]).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      reviewReason: r.review_reason,
      showOwner: r.show_owner,
      draft: {
        title: r.title,
        problem: r.problem,
        sectorId: r.sector_id,
        stage: r.stage,
        seeking: r.seeking,
        investmentMin: r.investment_min_tzs === null ? "" : String(r.investment_min_tzs),
        investmentMax: r.investment_max_tzs === null ? "" : String(r.investment_max_tzs),
        showOwner: r.show_owner,
        description: r.idea_details?.description ?? "",
        businessModel: r.idea_details?.business_model ?? "",
        market: r.idea_details?.market ?? "",
        financials: r.idea_details?.financials ?? "",
        team: r.idea_details?.team ?? "",
      },
    }));
  },

  sectors: sectorOptions,

  async save(id, draft, submit) {
    const { data, error } = await supabase.rpc("save_idea", {
      idea: id,
      title: draft.title,
      problem: draft.problem,
      sector: draft.sectorId || null,
      stage: draft.stage || null,
      seeking: draft.seeking || null,
      investment_min: parseTzs(draft.investmentMin),
      investment_max: parseTzs(draft.investmentMax),
      show_owner: draft.showOwner,
      description: draft.description,
      business_model: draft.businessModel,
      market: draft.market,
      financials: draft.financials,
      team: draft.team,
      submit,
    });
    if (error) throw error;
    const row = (data as { result: string; idea_id: string | null }[])[0];
    return { result: row?.result ?? "error", ideaId: row?.idea_id ?? null };
  },

  async archive(id) {
    const { data, error } = await supabase.rpc("archive_idea", { idea: id });
    if (error) throw error;
    return data as string;
  },
};
