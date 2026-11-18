import type { IdeaStage, Language } from "@kingdom-connect/shared";
import { type IdeaSummary, POOL_PAGE, type SummaryRow, toSummary } from "./ideas";
import { regionOptions } from "./registration";
import { myId, supabase } from "./supabase";

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

/** The investor's own sector focus and ticket band, from their flag. Nobody else ever reads it. */
export type InvestorFocus = {
  sectorEn: string | null;
  sectorSw: string | null;
  band: TicketBand | null;
};

export type MyIdeaRequest = {
  ideaId: string;
  title: string;
  anonymous: boolean;
  status: "pending" | "approved" | "declined" | "nda_accepted" | "revoked";
};

export async function myInvestorFocus(): Promise<InvestorFocus | null> {
  const { data, error } = await supabase
    .from("investor_flags")
    .select("sector_focus, ticket_band")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let sector: { name_en: string; name_sw: string } | null = null;
  if (data.sector_focus) {
    const found = await supabase
      .from("sectors")
      .select("name_en, name_sw")
      .eq("id", data.sector_focus)
      .maybeSingle();
    if (found.error) throw found.error;
    sector = found.data;
  }
  return {
    sectorEn: sector?.name_en ?? null,
    sectorSw: sector?.name_sw ?? null,
    band: (data.ticket_band as TicketBand | null) ?? null,
  };
}

export type InvestorApi = {
  /** Only ever about the signed-in member. */
  status: () => Promise<InvestorStatus>;
  apply: (sectorId: string | null, band: TicketBand | null, note: string) => Promise<string>;
  pool: (filters: InvestorFilters, savedOnly: boolean, page: number) => Promise<SavableIdea[]>;
  setSaved: (ideaId: string, saved: boolean) => Promise<string>;
  regions: (language: Language) => Promise<Option[]>;
  focus: () => Promise<InvestorFocus | null>;
  /** The investor's own interest requests, newest first (S22 My requests). */
  myRequests: () => Promise<MyIdeaRequest[]>;
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

  focus: myInvestorFocus,

  async myRequests() {
    const me = await myId();
    const { data, error } = await supabase
      .from("idea_access_requests")
      .select("idea_id, anonymous, status")
      .eq("requester_id", me ?? "")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const titles = await supabase
      .from("idea_summaries")
      .select("id, title")
      .in(
        "id",
        rows.map((r) => r.idea_id),
      );
    if (titles.error) throw titles.error;
    const titleOf = new Map((titles.data ?? []).map((r) => [r.id as string, r.title as string]));
    return rows.map((r) => ({
      ideaId: r.idea_id as string,
      title: titleOf.get(r.idea_id as string) ?? "",
      anonymous: Boolean(r.anonymous),
      status: r.status as MyIdeaRequest["status"],
    }));
  },
};

export { POOL_PAGE };
