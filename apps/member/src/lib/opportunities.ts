import type {
  EmploymentType,
  Language,
  OpportunityInput,
  OpportunityResult,
  OpportunityType,
} from "@kingdom-connect/shared";
import { districtOptions, regionOptions, sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export type PostStatus =
  "draft" | "pending_review" | "published" | "closed" | "expired" | "hidden" | "removed";

export type MyPost = {
  id: string;
  type: OpportunityType | "tender";
  title: string;
  status: PostStatus;
  reason: string | null;
  closingAt: string;
};

export type SavedPost = { result: OpportunityResult; status: PostStatus | null };

export type OpportunitiesApi = {
  mine: () => Promise<MyPost[]>;
  load: (id: string) => Promise<OpportunityInput | null>;
  save: (input: OpportunityInput, id: string | null, send: boolean) => Promise<SavedPost>;
  close: (id: string) => Promise<"ok" | "failed">;
  sectors: (language: Language) => Promise<Option[]>;
  regions: (language: Language) => Promise<Option[]>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
};

const results: OpportunityResult[] = [
  "invalid_type",
  "invalid_title",
  "invalid_employment",
  "invalid_location",
  "invalid_sector",
  "too_short",
  "too_long",
  "invalid_closing",
  "skills_required",
  "too_many_skills",
  "no_fee_required",
  "level3_required",
  "posting_paused",
  "not_editable",
  "contact_details",
];

type PostRow = {
  type: OpportunityType;
  title: string;
  role: string | null;
  employment_type: EmploymentType | null;
  remote: boolean;
  region_id: string | null;
  district_id: string | null;
  sector_id: string;
  description: string;
  closing_at: string;
  no_fee_declared: boolean;
  skills: { skill: { name: string } | null }[];
};

export const opportunitiesApi: OpportunitiesApi = {
  async mine() {
    const { data, error } = await supabase.rpc("my_opportunities");
    if (error) throw error;
    return (
      (data ?? []) as {
        id: string;
        type: MyPost["type"];
        title: string;
        status: PostStatus;
        reason: string | null;
        closing_at: string;
      }[]
    ).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      status: r.status,
      reason: r.reason,
      closingAt: r.closing_at,
    }));
  },

  async load(id) {
    const { data, error } = await supabase
      .from("opportunities")
      .select(
        "type, title, role, employment_type, remote, region_id, district_id, sector_id, description, closing_at, no_fee_declared, skills:opportunity_skills(skill:skills(name))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as PostRow;
    return {
      type: row.type,
      title: row.title,
      role: row.role ?? "",
      employmentType: row.employment_type ?? "",
      remote: row.remote,
      regionId: row.region_id ?? "",
      districtId: row.district_id ?? "",
      sectorId: row.sector_id,
      description: row.description,
      closingOn: row.closing_at,
      skills: row.skills.flatMap((s) => (s.skill ? [s.skill.name] : [])),
      noFee: row.no_fee_declared,
    };
  },

  async save(input, id, send) {
    const { data, error } = await supabase.rpc("save_opportunity", {
      opportunity: id,
      kind: input.type,
      title: input.title,
      role: input.role,
      employment_type: input.employmentType || null,
      region: input.remote ? null : input.regionId || null,
      district: input.remote ? null : input.districtId || null,
      remote: input.remote,
      sector: input.sectorId || null,
      description: input.description,
      closing_on: input.closingOn || null,
      skills: input.skills,
      no_fee: input.noFee,
      send,
    });
    if (error) return { result: "failed", status: null };
    const row = (data as { result: string; opportunity_id: string | null }[] | null)?.[0];
    if (!row) return { result: "failed", status: null };
    if (row.result !== "ok") {
      return { result: results.find((r) => r === row.result) ?? "failed", status: null };
    }
    const { data: saved } = await supabase
      .from("opportunities")
      .select("status")
      .eq("id", row.opportunity_id!)
      .maybeSingle();
    return { result: "ok", status: (saved?.status as PostStatus | undefined) ?? null };
  },

  async close(id) {
    const { data, error } = await supabase.rpc("close_opportunity", { opportunity: id });
    return !error && data === "ok" ? "ok" : "failed";
  },

  sectors: sectorOptions,
  regions: regionOptions,
  districts: districtOptions,
};
