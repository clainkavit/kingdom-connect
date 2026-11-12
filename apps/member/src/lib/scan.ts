import type { EmploymentType } from "@kingdom-connect/shared";
import type { OpportunityCard, PostKind } from "./opportunity-browse";
import { supabase } from "./supabase";

export type ScanReason =
  | { code: "skills"; skills: string[] }
  | { code: "sector" }
  | { code: "location"; kind: "district" | "region" | "remote" }
  | { code: "study" };

export type ScanMatch = OpportunityCard & { score: number; reasons: ScanReason[] };

export type MissingField = "skills" | "location" | "profession";

export type ScanApi = {
  matches: () => Promise<ScanMatch[]>;
  missing: () => Promise<MissingField[]>;
};

type Row = {
  id: string;
  type: PostKind;
  title: string;
  role: string | null;
  employment_type: EmploymentType | null;
  remote: boolean;
  region_en: string | null;
  region_sw: string | null;
  district_en: string | null;
  district_sw: string | null;
  sector_en: string;
  sector_sw: string;
  closing_at: string;
  featured: boolean;
  poster_id: string | null;
  poster_name: string;
  skills: string[] | null;
  score: number;
  reasons: { code: string; detail: { skills?: string[]; kind?: string } }[] | null;
};

const named = (en: string | null, sw: string | null) => (en ? { en, sw: sw ?? en } : null);

function reason(r: {
  code: string;
  detail: { skills?: string[]; kind?: string };
}): ScanReason | null {
  if (r.code === "skills") return { code: "skills", skills: r.detail.skills ?? [] };
  if (r.code === "sector") return { code: "sector" };
  if (r.code === "study") return { code: "study" };
  if (
    r.code === "location" &&
    (r.detail.kind === "district" || r.detail.kind === "region" || r.detail.kind === "remote")
  )
    return { code: "location", kind: r.detail.kind };
  return null;
}

/** S16's Scan for Opportunities (O07): up to 20 matches, best first, each with its top two reasons. */
export const scanApi: ScanApi = {
  async matches() {
    const { data, error } = await supabase.rpc("scan_opportunities", { max_rows: 20 });
    if (error) throw error;
    return (data as Row[]).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      role: r.role,
      employmentType: r.employment_type,
      remote: r.remote,
      region: named(r.region_en, r.region_sw),
      district: named(r.district_en, r.district_sw),
      sector: { en: r.sector_en, sw: r.sector_sw },
      closingAt: r.closing_at,
      featured: r.featured,
      posterId: r.poster_id,
      posterName: r.poster_name,
      isMine: false,
      skills: r.skills ?? [],
      score: r.score,
      reasons: (r.reasons ?? []).map(reason).filter((x): x is ScanReason => x !== null),
    }));
  },

  async missing() {
    const { data, error } = await supabase.rpc("scan_missing_fields");
    if (error) throw error;
    return ((data as string[] | null) ?? []).filter(
      (f): f is MissingField => f === "skills" || f === "location" || f === "profession",
    );
  },
};
