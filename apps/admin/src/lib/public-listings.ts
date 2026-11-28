import { tanzaniaDate, type EmploymentType, type Language } from "@kingdom-connect/shared";
import { featuredApi, type FeatureResult } from "./featured";
import { opportunityModerationApi, type Option } from "./opportunities";
import { supabase } from "./supabase";

export type SourceKind = "tenders" | "jobs";

export type PublicListing = {
  id: string;
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  title: string;
  employer: string | null;
  summary: string | null;
  referenceNo: string | null;
  posts: number | null;
  originalUrl: string;
  language: Language;
  closingOn: string | null;
  feeNote: string | null;
  translatedTitle: string | null;
  translatedSummary: string | null;
  suggestedRegionId: string | null;
  suggestedDistrictId: string | null;
  suggestedSectorId: string | null;
};

export type ListingSource = {
  id: string;
  name: string;
  kind: SourceKind;
  pageUrl: string;
  active: boolean;
  readerReady: boolean;
  lastRunAt: Date | null;
  lastFound: number | null;
  lastError: string | null;
};

export type ApproveInput = {
  regionId: string;
  districtId: string;
  remote: boolean;
  sectorId: string;
  skills: string[];
  closingOn: string;
  employmentType: EmploymentType | "";
  translatedTitle: string;
  translatedSummary: string;
  feeNote: string;
  feature: boolean;
};

export type ApproveResult =
  | "ok"
  | "not_staff"
  | "not_found"
  | "already_decided"
  | "closing_date"
  | "place_and_sector"
  | "employment_type"
  | "too_many_skills"
  | "failed";

export type SourceResult = "ok" | "not_staff" | "not_found" | "no_reader" | "failed";
export type AddSourceResult = "ok" | "not_staff" | "invalid" | "exists" | "failed";

export type PublicListingsApi = {
  waiting: () => Promise<PublicListing[]>;
  waitingCount: () => Promise<number>;
  sources: () => Promise<ListingSource[]>;
  options: (language: Language) => Promise<{ sectors: Option[]; regions: Option[] }>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
  slots: () => Promise<{ used: number; limit: number }>;
  /** Approves, then features the new post when asked; `featured` is the featuring outcome. */
  approve: (
    id: string,
    input: ApproveInput,
  ) => Promise<{ result: ApproveResult; featured: FeatureResult | null }>;
  /** O22: approves each listing with its own suggestions, a job as Full-time; the rest still need details. */
  approveMany: (ids: string[]) => Promise<{ approved: string[]; needsDetails: number }>;
  /** How many of the listings were discarded. */
  discard: (ids: string[]) => Promise<number>;
  setActive: (id: string, active: boolean) => Promise<SourceResult>;
  addSource: (source: {
    name: string;
    pageUrl: string;
    kind: SourceKind;
  }) => Promise<AddSourceResult>;
};

type ListingRow = {
  id: string;
  source_id: string;
  title: string;
  employer: string | null;
  summary: string | null;
  details: { reference_no?: string; posts?: number } | null;
  original_url: string;
  language: Language;
  closing_on: string | null;
  fee_note: string | null;
  translated_title: string | null;
  translated_summary: string | null;
  suggested_region_id: string | null;
  suggested_district_id: string | null;
  suggested_sector_id: string | null;
  source: { name: string; kind: SourceKind } | null;
};

const LISTING_COLUMNS =
  "id, source_id, title, employer, summary, details, original_url, language, closing_on, fee_note, translated_title, translated_summary, suggested_region_id, suggested_district_id, suggested_sector_id, source:public_listing_sources(name, kind)";

/** Waiting listings still on their source and not yet closed; gone and past ones stay in the database, unseen. */
const stillOpen = () => `closing_on.is.null,closing_on.gte.${tanzaniaDate()}`;

const listing = (r: ListingRow): PublicListing => ({
  id: r.id,
  sourceId: r.source_id,
  sourceName: r.source?.name ?? "",
  kind: r.source?.kind ?? "jobs",
  title: r.title,
  employer: r.employer,
  summary: r.summary,
  referenceNo: r.details?.reference_no ?? null,
  posts: typeof r.details?.posts === "number" ? r.details.posts : null,
  originalUrl: r.original_url,
  language: r.language,
  closingOn: r.closing_on,
  feeNote: r.fee_note,
  translatedTitle: r.translated_title,
  translatedSummary: r.translated_summary,
  suggestedRegionId: r.suggested_region_id,
  suggestedDistrictId: r.suggested_district_id,
  suggestedSectorId: r.suggested_sector_id,
});

const blank = (text: string) => text.trim() || null;

/** O20: the review queue and sources for public listings (O19). */
export const publicListingsApi: PublicListingsApi = {
  async waiting() {
    const { data, error } = await supabase
      .from("public_listings")
      .select(LISTING_COLUMNS)
      .eq("status", "waiting")
      .is("gone_at", null)
      .or(stillOpen())
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data as unknown as ListingRow[]).map(listing);
  },

  async waitingCount() {
    const { count, error } = await supabase
      .from("public_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .is("gone_at", null)
      .or(stillOpen());
    if (error) throw error;
    return count ?? 0;
  },

  async sources() {
    const { data, error } = await supabase
      .from("public_listing_sources")
      .select("id, name, kind, page_url, active, reader_ready, last_run_at, last_found, last_error")
      .order("name");
    if (error) throw error;
    return data.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as SourceKind,
      pageUrl: r.page_url as string,
      active: r.active as boolean,
      readerReady: r.reader_ready as boolean,
      lastRunAt: r.last_run_at ? new Date(r.last_run_at as string) : null,
      lastFound: (r.last_found as number | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
    }));
  },

  options: (language) => opportunityModerationApi.options(language),
  districts: (regionId, language) => opportunityModerationApi.districts(regionId, language),
  slots: () => featuredApi.slots(),

  async approve(id, input) {
    const { data, error } = await supabase.rpc("approve_public_listing", {
      listing: id,
      region: input.remote ? null : blank(input.regionId),
      district: input.remote ? null : blank(input.districtId),
      remote: input.remote,
      sector: blank(input.sectorId),
      skills: input.skills,
      closing: blank(input.closingOn),
      employment_type: blank(input.employmentType),
      translated_title: blank(input.translatedTitle),
      translated_summary: blank(input.translatedSummary),
      fee_note: blank(input.feeNote),
    });
    if (error) return { result: "failed", featured: null };
    const row = (data as { result: ApproveResult; opportunity_id: string | null }[] | null)?.[0];
    const result = row?.result ?? "failed";
    if (result !== "ok" || !input.feature || !row?.opportunity_id)
      return { result, featured: null };
    return { result, featured: await featuredApi.setFeatured(row.opportunity_id, true) };
  },

  async approveMany(ids) {
    const { data, error } = await supabase.rpc("approve_public_listings", { listings: ids });
    if (error) throw error;
    const rows = (data as { listing_id: string; outcome: string }[] | null) ?? [];
    return {
      approved: rows.filter((r) => r.outcome === "ok").map((r) => r.listing_id),
      needsDetails: rows.filter((r) => r.outcome !== "ok").length,
    };
  },

  async discard(ids) {
    const { data, error } = await supabase.rpc("discard_public_listings", { listings: ids });
    if (error) throw error;
    return (data as number | null) ?? 0;
  },

  async setActive(id, active) {
    const { data, error } = await supabase.rpc("set_public_listing_source_active", {
      source: id,
      active,
    });
    return error ? "failed" : ((data as SourceResult | null) ?? "failed");
  },

  async addSource(source) {
    const { data, error } = await supabase.rpc("add_public_listing_source", {
      name: source.name.trim(),
      page_url: source.pageUrl.trim(),
      kind: source.kind,
    });
    return error ? "failed" : ((data as AddSourceResult | null) ?? "failed");
  },
};
