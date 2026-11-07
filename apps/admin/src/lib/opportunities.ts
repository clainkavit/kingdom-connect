import type {
  EmploymentType,
  Language,
  OpportunityInput,
  OpportunityType,
} from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type PostStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "closed"
  | "expired"
  | "hidden"
  | "removed";

export type PendingPost = {
  id: string;
  title: string;
  type: OpportunityType | "tender";
  /** Null for a post by an administrator. */
  posterName: string | null;
  /** How many of the poster's posts have been approved: under 3, the poster is still new. */
  approvedPosts: number;
  submittedAt: Date;
};

export type PostDetail = {
  id: string;
  title: string;
  type: OpportunityType | "tender";
  role: string | null;
  employmentType: EmploymentType | null;
  remote: boolean;
  region: string | null;
  district: string | null;
  sector: string;
  description: string;
  closingOn: string;
  skills: string[];
  status: PostStatus;
  posterName: string | null;
  approvedPosts: number;
  reason: string | null;
};

export type PostReason = { code: string; label: string; needsNote: boolean };
export type Option = { value: string; label: string };
export type ModerationAction = "approve" | "reject" | "remove";

export type OpportunityModerationApi = {
  pending: () => Promise<PendingPost[]>;
  load: (id: string, language?: Language) => Promise<PostDetail | null>;
  reasons: (language: Language) => Promise<PostReason[]>;
  moderate: (
    id: string,
    action: ModerationAction,
    reasonCode: string | null,
    note: string,
  ) => Promise<string>;
  options: (language: Language) => Promise<{ sectors: Option[]; regions: Option[] }>;
  districts: (regionId: string, language: Language) => Promise<Option[]>;
  post: (input: OpportunityInput) => Promise<string>;
};

type Named = { name_en: string; name_sw: string } | null;
const named = (n: Named, language: Language) =>
  n ? (language === "sw" ? n.name_sw : n.name_en) : null;

/** Names and approved-post counts for the members who posted, read by staff. */
async function posters(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0)
    return { names: new Map<string, string>(), approved: new Map<string, number>() };
  const [profiles, members, approvals] = await Promise.all([
    supabase.from("profiles").select("member_id, full_name").in("member_id", unique),
    supabase.from("members").select("id, username").in("id", unique),
    supabase
      .from("opportunities")
      .select("poster_member_id")
      .in("poster_member_id", unique)
      .not("approved_at", "is", null),
  ]);
  const names = new Map<string, string>();
  for (const m of (members.data ?? []) as { id: string; username: string }[])
    names.set(m.id, m.username);
  for (const p of (profiles.data ?? []) as { member_id: string; full_name: string | null }[])
    if (p.full_name) names.set(p.member_id, p.full_name);
  const approved = new Map<string, number>();
  for (const a of (approvals.data ?? []) as { poster_member_id: string }[])
    approved.set(a.poster_member_id, (approved.get(a.poster_member_id) ?? 0) + 1);
  return { names, approved };
}

/** A04, A05 and A15 for opportunities (O01). */
export const opportunityModerationApi: OpportunityModerationApi = {
  async pending() {
    const { data, error } = await supabase
      .from("opportunities")
      .select("id, title, type, poster_member_id, updated_at")
      .eq("status", "pending_review")
      .order("updated_at");
    if (error) throw error;
    const rows = data as {
      id: string;
      title: string;
      type: PendingPost["type"];
      poster_member_id: string | null;
      updated_at: string;
    }[];
    const who = await posters(
      rows.flatMap((r) => (r.poster_member_id ? [r.poster_member_id] : [])),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      posterName: r.poster_member_id ? (who.names.get(r.poster_member_id) ?? "") : null,
      approvedPosts: r.poster_member_id ? (who.approved.get(r.poster_member_id) ?? 0) : 0,
      submittedAt: new Date(r.updated_at),
    }));
  },

  async load(id, language = "en") {
    const { data, error } = await supabase
      .from("opportunities")
      .select(
        "id, title, type, role, employment_type, remote, description, closing_at, status, reason, poster_member_id, sector:sectors(name_en, name_sw), region:regions(name_en, name_sw), district:districts(name_en, name_sw), skills:opportunity_skills(skill:skills(name))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as {
      id: string;
      title: string;
      type: PostDetail["type"];
      role: string | null;
      employment_type: EmploymentType | null;
      remote: boolean;
      description: string;
      closing_at: string;
      status: PostStatus;
      reason: string | null;
      poster_member_id: string | null;
      sector: Named;
      region: Named;
      district: Named;
      skills: { skill: { name: string } | null }[];
    };
    const who = await posters(row.poster_member_id ? [row.poster_member_id] : []);
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      role: row.role,
      employmentType: row.employment_type,
      remote: row.remote,
      region: named(row.region, language),
      district: named(row.district, language),
      sector: named(row.sector, language) ?? "",
      description: row.description,
      closingOn: row.closing_at,
      skills: row.skills.flatMap((s) => (s.skill ? [s.skill.name] : [])),
      status: row.status,
      posterName: row.poster_member_id ? (who.names.get(row.poster_member_id) ?? "") : null,
      approvedPosts: row.poster_member_id ? (who.approved.get(row.poster_member_id) ?? 0) : 0,
      reason: row.reason,
    };
  },

  async reasons(language) {
    const { data, error } = await supabase
      .from("rejection_reasons")
      .select("code, label_en, label_sw, needs_note")
      .eq("for_post", true)
      .order("sort");
    if (error) throw error;
    return (
      data as { code: string; label_en: string; label_sw: string; needs_note: boolean }[]
    ).map((r) => ({
      code: r.code,
      label: language === "sw" ? r.label_sw : r.label_en,
      needsNote: r.needs_note,
    }));
  },

  async moderate(id, action, reasonCode, note) {
    const { data, error } = await supabase.rpc("moderate_opportunity", {
      opportunity: id,
      action,
      reason_code: reasonCode,
      note: note.trim() || null,
    });
    if (error) throw error;
    return data as string;
  },

  async options(language) {
    const [sectors, regions] = await Promise.all([
      supabase.from("sectors").select("id, name_en, name_sw").order("name_en"),
      supabase.from("regions").select("id, name_en, name_sw").order("name_en"),
    ]);
    if (sectors.error) throw sectors.error;
    if (regions.error) throw regions.error;
    const toOptions = (rows: { id: string; name_en: string; name_sw: string }[]) =>
      rows.map((r) => ({ value: r.id, label: language === "sw" ? r.name_sw : r.name_en }));
    return { sectors: toOptions(sectors.data), regions: toOptions(regions.data) };
  },

  async districts(regionId, language) {
    const { data, error } = await supabase
      .from("districts")
      .select("id, name_en, name_sw")
      .eq("region_id", regionId)
      .order("name_en");
    if (error) throw error;
    return data.map((r) => ({ value: r.id, label: language === "sw" ? r.name_sw : r.name_en }));
  },

  async post(input) {
    const { data, error } = await supabase.rpc("save_opportunity", {
      opportunity: null,
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
      no_fee: false,
      send: true,
    });
    if (error) throw error;
    return (data as { result: string }[] | null)?.[0]?.result ?? "failed";
  },
};
