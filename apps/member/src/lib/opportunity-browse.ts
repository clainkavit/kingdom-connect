import type { EmploymentType, Language, OpportunityType } from "@kingdom-connect/shared";
import { regionOptions, sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export const OPPORTUNITY_PAGE = 20;

export type PostKind = OpportunityType | "tender";

export type OpportunityFilters = {
  kind?: PostKind;
  region?: string;
  remoteOnly?: boolean;
  sector?: string;
  employment?: EmploymentType;
  postedWithin?: number;
};

type Named = { en: string; sw: string };

export type OpportunityCard = {
  id: string;
  type: PostKind;
  title: string;
  role: string | null;
  employmentType: EmploymentType | null;
  remote: boolean;
  region: Named | null;
  district: Named | null;
  sector: Named;
  closingAt: string;
  featured: boolean;
  posterId: string | null;
  posterName: string;
  isMine: boolean;
  skills: string[];
};

export type OpportunityDetail = OpportunityCard & {
  description: string;
  status: string;
  readOnly: boolean;
};

export type TenderDetails = {
  issuingOrg: string;
  referenceNo: string | null;
  scope: string;
  eligibility: string | null;
  requiredDocuments: string[];
  closingTime: string | null;
  estimatedValue: number | null;
  documentPath: string | null;
};

export type OpportunityBrowseApi = {
  list: (filters: OpportunityFilters, page: number) => Promise<OpportunityCard[]>;
  detail: (id: string) => Promise<OpportunityDetail | null>;
  tender: (id: string) => Promise<TenderDetails | null>;
  documentLink: (path: string) => Promise<string | null>;
  sectors: (language: Language) => Promise<Option[]>;
  regions: (language: Language) => Promise<Option[]>;
};

type CardRow = {
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
  is_mine: boolean;
  skills: string[] | null;
};

const named = (en: string | null, sw: string | null): Named | null =>
  en ? { en, sw: sw ?? en } : null;

const card = (r: CardRow): OpportunityCard => ({
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
  isMine: r.is_mine,
  skills: r.skills ?? [],
});

/** S16 and S17 (O02): published open posts, featured first; one post with its tender fields (O04). */
export const opportunityBrowseApi: OpportunityBrowseApi = {
  async list(filters, page) {
    const { data, error } = await supabase.rpc("opportunity_list", {
      kind: filters.kind ?? null,
      region: filters.region ?? null,
      remote_only: filters.remoteOnly ?? false,
      sector: filters.sector ?? null,
      employment: filters.employment ?? null,
      posted_within: filters.postedWithin ?? null,
      page,
    });
    if (error) throw error;
    return (data as CardRow[]).map(card);
  },

  async detail(id) {
    const { data, error } = await supabase.rpc("opportunity_detail", { opportunity: id });
    if (error) throw error;
    const row = (
      data as (CardRow & { description: string; status: string; read_only: boolean })[]
    )[0];
    if (!row) return null;
    return {
      ...card(row),
      description: row.description,
      status: row.status,
      readOnly: row.read_only,
    };
  },

  async tender(id) {
    const { data, error } = await supabase.rpc("opportunity_tender", { opportunity: id });
    if (error) throw error;
    const row = (
      data as {
        issuing_org: string;
        reference_no: string | null;
        scope: string;
        eligibility: string | null;
        required_documents: string[] | null;
        closing_time: string | null;
        estimated_value_tzs: number | null;
        document_path: string | null;
      }[]
    )[0];
    if (!row) return null;
    return {
      issuingOrg: row.issuing_org,
      referenceNo: row.reference_no,
      scope: row.scope,
      eligibility: row.eligibility,
      requiredDocuments: row.required_documents ?? [],
      closingTime: row.closing_time,
      estimatedValue: row.estimated_value_tzs,
      documentPath: row.document_path,
    };
  },

  async documentLink(path) {
    const { data } = await supabase.storage.from("tender-documents").createSignedUrl(path, 300);
    return data?.signedUrl ?? null;
  },

  sectors: sectorOptions,
  regions: regionOptions,
};
