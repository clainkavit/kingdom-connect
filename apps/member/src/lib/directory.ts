import type { Language } from "@kingdom-connect/shared";
import { districtOptions, regionOptions, sectorOptions, type Option } from "./registration";
import { supabase } from "./supabase";

export const PAGE_SIZE = 20;

export type DirectoryFilters = {
  q: string;
  profession: string;
  skill: string;
  sector: string | null;
  region: string | null;
  district: string | null;
  studying: boolean | null;
};

export const noFilters: DirectoryFilters = {
  q: "",
  profession: "",
  skill: "",
  sector: null,
  region: null,
  district: null,
  studying: null,
};

export type DirectoryCard = {
  memberId: string;
  fullName: string;
  headline: string;
  location: string;
  topSkills: string[];
  business: boolean;
  photoUrl: string | null;
};

export type DirectoryPage = { cards: DirectoryCard[]; more: boolean };

export type DirectoryApi = {
  search: (filters: DirectoryFilters, page: number, language: Language) => Promise<DirectoryPage>;
  regions: (language: Language) => Promise<Option[]>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
  sectors: (language: Language) => Promise<Option[]>;
};

type Row = {
  member_id: string;
  full_name: string | null;
  headline: string | null;
  region_en: string | null;
  region_sw: string | null;
  district_en: string | null;
  district_sw: string | null;
  top_skills: string[];
  verified_business: boolean;
  photo_path: string | null;
};

export const directoryApi: DirectoryApi = {
  async search(filters, page, language) {
    const orNull = (v: string) => v.trim() || null;
    const { data, error } = await supabase.rpc("search_directory", {
      q: orNull(filters.q),
      profession: orNull(filters.profession),
      skill: orNull(filters.skill),
      sector: filters.sector,
      region: filters.region,
      district: filters.district,
      studying: filters.studying,
      page,
      page_size: PAGE_SIZE,
    });
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const paths = rows.flatMap((r) => (r.photo_path ? [r.photo_path] : []));
    const { data: links } = paths.length
      ? await supabase.storage.from("avatars").createSignedUrls(paths, 300)
      : { data: [] };
    const urlFor = new Map((links ?? []).map((l) => [l.path, l.signedUrl]));
    return {
      more: rows.length > PAGE_SIZE,
      cards: rows.slice(0, PAGE_SIZE).map((r) => ({
        memberId: r.member_id,
        fullName: r.full_name ?? "",
        headline: r.headline ?? "",
        location: [
          language === "sw" ? r.district_sw : r.district_en,
          language === "sw" ? r.region_sw : r.region_en,
        ]
          .filter(Boolean)
          .join(", "),
        topSkills: r.top_skills,
        business: r.verified_business,
        photoUrl: (r.photo_path && urlFor.get(r.photo_path)) || null,
      })),
    };
  },
  regions: regionOptions,
  districts: districtOptions,
  sectors: sectorOptions,
};
