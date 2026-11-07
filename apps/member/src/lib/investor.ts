import type { IdeaStage, Language } from "@kingdom-connect/shared";
import { type IdeaSummary, POOL_PAGE, type SummaryRow, toSummary } from "./ideas";
import { regionOptions } from "./registration";
import { supabase } from "./supabase";

export type InvestorStatus = "investor" | "can_apply" | "applied" | "declined" | "none";
export type TicketBand = "under_10m" | "10m_to_50m" | "over_50m";
export type Option = { value: string; label: string };

export type InvestorFilters = {
  sectorId: string | null;
  stage: IdeaStage | null;
  min: number | null;
  max: number | null;
  regionId: string | null;
};
export const NO_FILTERS: InvestorFilters = {
  sectorId: null,
  stage: null,
  min: null,
  max: null,
  regionId: null,
};

export type SavableIdea = IdeaSummary & { saved: boolean };

export type InvestorApi = {
  /** Only ever about the signed-in member. */
  status: () => Promise<InvestorStatus>;
  apply: (sectorId: string | null, band: TicketBand | null, note: string) => Promise<string>;
  pool: (filters: InvestorFilters, savedOnly: boolean, page: number) => Promise<SavableIdea[]>;
  setSaved: (ideaId: string, saved: boolean) => Promise<string>;
  regions: (language: Language) => Promise<Option[]>;
};

/** S22 investor filters, S29 Saved and applying for the flag (I06). */
export const investorApi: InvestorApi = {
  async status() {
    const { data, error } = await supabase.rpc("my_investor_status");
    if (error) throw error;
    return (data as InvestorStatus) ?? "none";
  },

  async apply(sectorId, band, note) {
    const { data, error } = await supabase.rpc("apply_for_investor_flag", {
      sector: sectorId,
      band,
      note,
    });
    if (error) throw error;
    return data as string;
  },

  async pool(filters, savedOnly, page) {
    const { data, error } = await supabase.rpc("investor_ideas", {
      sector: filters.sectorId,
      stage: filters.stage,
      min_tzs: filters.min,
      max_tzs: filters.max,
      region: filters.regionId,
      saved_only: savedOnly,
      page,
    });
    if (error) throw error;
    return (data as (SummaryRow & { saved: boolean })[]).map((r) => ({
      ...toSummary(r),
      saved: r.saved,
    }));
  },

  async setSaved(ideaId, saved) {
    const { data, error } = await supabase.rpc("set_idea_saved", { idea: ideaId, saved });
    if (error) throw error;
    return data as string;
  },

  regions: regionOptions,
};

export { POOL_PAGE };
