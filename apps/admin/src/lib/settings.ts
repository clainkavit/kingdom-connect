import {
  createStaffClient,
  MAX_SKILL_LENGTH,
  normalizeSkill,
  type InviteResult,
  type NewStaff,
  type StaffRole,
} from "@kingdom-connect/shared";
import { anonKey, supabase, url } from "./supabase";

export type StaffMember = { id: string; fullName: string; role: StaffRole; active: boolean };
export type ActiveResult = "done" | "refused" | "failed";
export type Synonym = { id: string; fromName: string; skillName: string };
export type SynonymResult = "done" | "same" | "exists" | "invalid" | "failed";

export type PlatformSettings = {
  platformName: string;
  legalEntityName: string;
  featuredSlotLimit: number;
};
export type PlatformKey = "platform_name" | "legal_entity_name" | "featured_slot_limit";
export type PlatformResult = "ok" | "unchanged" | "invalid_value" | "not_super_admin" | "failed";

export type MatchingFeature = "scan" | "people";
export type Weight = { feature: MatchingFeature; signal: string; points: number };
export type WeightResult = "ok" | "invalid_points" | "not_super_admin" | "not_found" | "failed";

export type LegalKind = "terms" | "privacy" | "nda" | "ip" | "handoff";
export type LegalVersion = {
  kind: LegalKind;
  version: string;
  approvedAt: Date | null;
  effectiveAt: Date | null;
  current: boolean;
};

export type SettingsApi = {
  cap: () => Promise<number | null>;
  saveCap: (cap: number | null) => Promise<boolean>;
  staff: () => Promise<StaffMember[]>;
  invite: (staff: NewStaff) => Promise<InviteResult>;
  setActive: (id: string, active: boolean) => Promise<ActiveResult>;
  synonyms: () => Promise<Synonym[]>;
  addSynonym: (variant: string, skill: string) => Promise<SynonymResult>;
  removeSynonym: (id: string) => Promise<boolean>;
  platform: () => Promise<PlatformSettings>;
  savePlatform: (key: PlatformKey, value: string | number) => Promise<PlatformResult>;
  weights: () => Promise<Weight[]>;
  saveWeight: (weight: Weight) => Promise<WeightResult>;
  legalVersions: () => Promise<LegalVersion[]>;
};

const staffClient = createStaffClient({ url, anonKey });

export const settingsApi: SettingsApi = {
  async cap() {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "daily_application_cap")
      .maybeSingle();
    if (error) throw error;
    return typeof data?.value === "number" ? data.value : null;
  },

  async saveCap(cap) {
    const { data, error } = await supabase
      .from("platform_settings")
      .update({ value: cap })
      .eq("key", "daily_application_cap")
      .select("key");
    return !error && data.length === 1;
  },

  async staff() {
    const { data, error } = await supabase
      .from("staff")
      .select("id, full_name, role, active")
      .order("full_name");
    if (error) throw error;
    return data.map((s) => ({ id: s.id, fullName: s.full_name, role: s.role, active: s.active }));
  },

  async invite(staff) {
    const { data } = await supabase.auth.getSession();
    return staffClient.invite(data.session?.access_token ?? "", staff);
  },

  async setActive(id, active) {
    const { data, error } = await supabase
      .from("staff")
      .update({ active })
      .eq("id", id)
      .select("id");
    if (error) return error.code === "42501" ? "refused" : "failed";
    return data.length === 1 ? "done" : "refused";
  },

  async synonyms() {
    const { data, error } = await supabase
      .from("skill_synonyms")
      .select("id, from_name, skill:skills(name)")
      .order("from_name");
    if (error) throw error;
    return data.map((s) => ({
      id: s.id,
      fromName: s.from_name,
      skillName: (s.skill as unknown as { name: string } | null)?.name ?? "",
    }));
  },

  async addSynonym(variant, skill) {
    const from = normalizeSkill(variant);
    const to = normalizeSkill(skill);
    if (!from || !to || from.length > MAX_SKILL_LENGTH || to.length > MAX_SKILL_LENGTH)
      return "invalid";
    if (from === to) return "same";
    const { data: chained } = await supabase
      .from("skill_synonyms")
      .select("skill_id")
      .eq("from_name", to)
      .maybeSingle();
    if (!chained)
      await supabase
        .from("skills")
        .upsert({ name: to }, { onConflict: "name", ignoreDuplicates: true });
    const { data: target } = chained
      ? { data: { id: chained.skill_id as string } }
      : await supabase.from("skills").select("id").eq("name", to).maybeSingle();
    if (!target) return "failed";
    const { error } = await supabase
      .from("skill_synonyms")
      .insert({ from_name: from, skill_id: target.id });
    if (!error) return "done";
    if (error.code === "23505") return "exists";
    if (error.code === "22023") return "same";
    return "failed";
  },

  async removeSynonym(id) {
    const { data, error } = await supabase
      .from("skill_synonyms")
      .delete()
      .eq("id", id)
      .select("id");
    return !error && data.length === 1;
  },

  async platform() {
    const { data, error } = await supabase.rpc("platform_settings_list");
    if (error) throw error;
    const value = (key: string) =>
      (data as { key: string; value: unknown }[]).find((row) => row.key === key)?.value;
    return {
      platformName: String(value("platform_name") ?? ""),
      legalEntityName: String(value("legal_entity_name") ?? ""),
      featuredSlotLimit: Number(value("featured_slot_limit") ?? 0),
    };
  },

  async savePlatform(key, value) {
    const { data, error } = await supabase.rpc("set_platform_setting", {
      setting: key,
      new_value: value,
    });
    return error ? "failed" : (data as PlatformResult);
  },

  async weights() {
    const { data, error } = await supabase.rpc("matching_settings_list");
    if (error) throw error;
    return data as Weight[];
  },

  async saveWeight({ feature, signal, points }) {
    const { data, error } = await supabase.rpc("set_matching_setting", { feature, signal, points });
    return error ? "failed" : (data as WeightResult);
  },

  async legalVersions() {
    const { data, error } = await supabase.rpc("legal_text_versions");
    if (error) throw error;
    return (
      data as {
        kind: LegalKind;
        version: string;
        approved_at: string | null;
        effective_at: string | null;
        is_current: boolean;
      }[]
    ).map((v) => ({
      kind: v.kind,
      version: v.version,
      approvedAt: v.approved_at ? new Date(v.approved_at) : null,
      effectiveAt: v.effective_at ? new Date(v.effective_at) : null,
      current: v.is_current,
    }));
  },
};
