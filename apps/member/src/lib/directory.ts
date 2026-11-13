import type { Language } from "@kingdom-connect/shared";
import { districtOptions, regionOptions, sectorOptions, type Option } from "./registration";
import { photoLinks } from "./avatars";
import type { Relation } from "./connections";
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
  relation: Relation;
  /** R25: in the reader's own region, named here; only when no search words were typed. */
  near?: string | null;
};

export type ResultPage<C> = { cards: C[]; more: boolean };

export type DirectoryPage = ResultPage<DirectoryCard>;

export type BusinessLevel = 2 | 3;

export type BusinessFilters = {
  q: string;
  sector: string | null;
  level: BusinessLevel | null;
  region: string | null;
};

export const noBusinessFilters: BusinessFilters = {
  q: "",
  sector: null,
  level: null,
  region: null,
};

export type BusinessCard = {
  businessId: string;
  memberId: string;
  name: string;
  description: string;
  size: "micro" | "small" | "medium" | "large";
  level: BusinessLevel;
  sector: string;
  ownerName: string;
  location: string;
};

export type BusinessPage = ResultPage<BusinessCard>;

export type DirectoryApi = {
  search: (filters: DirectoryFilters, page: number, language: Language) => Promise<DirectoryPage>;
  regions: (language: Language) => Promise<Option[]>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
  sectors: (language: Language) => Promise<Option[]>;
  searchBusinesses: (
    filters: BusinessFilters,
    page: number,
    language: Language,
  ) => Promise<BusinessPage>;
};

type BusinessRow = PlaceNames & {
  business_id: string;
  member_id: string;
  name: string;
  description: string | null;
  size: BusinessCard["size"];
  level: BusinessLevel;
  sector_en: string;
  sector_sw: string;
  owner_name: string | null;
};

const placeOf = (row: PlaceNames, language: Language) =>
  [
    language === "sw" ? row.district_sw : row.district_en,
    language === "sw" ? row.region_sw : row.region_en,
  ]
    .filter(Boolean)
    .join(", ");

type PlaceNames = {
  region_en: string | null;
  region_sw: string | null;
  district_en: string | null;
  district_sw: string | null;
};

type Row = PlaceNames & {
  member_id: string;
  full_name: string | null;
  headline: string | null;
  top_skills: string[];
  verified_business: boolean;
  photo_path: string | null;
  relation: Relation;
  near: boolean;
};

const pageOf = <R, C>(rows: R[], toCard: (row: R) => C): ResultPage<C> => ({
  more: rows.length > PAGE_SIZE,
  cards: rows.slice(0, PAGE_SIZE).map(toCard),
});

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
    const urlFor = await photoLinks(rows.map((r) => r.photo_path));
    return pageOf(rows, (r) => ({
      memberId: r.member_id,
      fullName: r.full_name ?? "",
      headline: r.headline ?? "",
      location: placeOf(r, language),
      topSkills: r.top_skills,
      business: r.verified_business,
      photoUrl: (r.photo_path && urlFor.get(r.photo_path)) || null,
      relation: r.relation,
      near: r.near ? (language === "sw" ? r.region_sw : r.region_en) : null,
    }));
  },
  regions: regionOptions,
  districts: districtOptions,
  sectors: sectorOptions,

  async searchBusinesses(filters, page, language) {
    const { data, error } = await supabase.rpc("search_businesses", {
      q: filters.q.trim() || null,
      sector: filters.sector,
      level: filters.level,
      region: filters.region,
      page,
      page_size: PAGE_SIZE,
    });
    if (error) throw error;
    return pageOf((data ?? []) as BusinessRow[], (r) => ({
      businessId: r.business_id,
      memberId: r.member_id,
      name: r.name,
      description: r.description ?? "",
      size: r.size,
      level: r.level,
      sector: language === "sw" ? r.sector_sw : r.sector_en,
      ownerName: r.owner_name ?? "",
      location: placeOf(r, language),
    }));
  },
};
