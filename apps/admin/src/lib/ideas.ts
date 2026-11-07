import type { IdeaSeeking, IdeaStage } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type PendingIdea = {
  id: string;
  title: string;
  problem: string;
  sectorEn: string;
  sectorSw: string;
  stage: IdeaStage;
  seeking: IdeaSeeking;
  investmentMin: number | null;
  investmentMax: number | null;
  showOwner: boolean;
  description: string;
  businessModel: string | null;
  market: string | null;
  financials: string | null;
  team: string | null;
  ownerUsername: string;
};

export type IdeaModerationApi = {
  queue: () => Promise<PendingIdea[]>;
  decide: (id: string, approve: boolean, reason: string) => Promise<string>;
};

/** A04 ideas waiting for moderation, with their confidential details (I01). */
export const ideaModerationApi: IdeaModerationApi = {
  async queue() {
    const { data, error } = await supabase.rpc("idea_review_queue");
    if (error) throw error;
    return (
      data as {
        idea_id: string;
        title: string;
        problem: string;
        sector_en: string;
        sector_sw: string;
        stage: IdeaStage;
        seeking: IdeaSeeking;
        investment_min_tzs: number | null;
        investment_max_tzs: number | null;
        show_owner: boolean;
        description: string;
        business_model: string | null;
        market: string | null;
        financials: string | null;
        team: string | null;
        owner_username: string;
      }[]
    ).map((r) => ({
      id: r.idea_id,
      title: r.title,
      problem: r.problem,
      sectorEn: r.sector_en,
      sectorSw: r.sector_sw,
      stage: r.stage,
      seeking: r.seeking,
      investmentMin: r.investment_min_tzs,
      investmentMax: r.investment_max_tzs,
      showOwner: r.show_owner,
      description: r.description,
      businessModel: r.business_model,
      market: r.market,
      financials: r.financials,
      team: r.team,
      ownerUsername: r.owner_username,
    }));
  },

  async decide(id, approve, reason) {
    const { data, error } = await supabase.rpc("decide_idea", {
      idea: id,
      approve,
      reason: approve ? null : reason,
    });
    if (error) throw error;
    return data as string;
  },
};
