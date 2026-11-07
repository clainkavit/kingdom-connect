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

export type IdeasApi = {
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

/** S27: the member's own ideas, and sharing or editing one (I01). */
export const ideasApi: IdeasApi = {
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
