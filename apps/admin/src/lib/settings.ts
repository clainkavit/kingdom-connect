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

export type SettingsApi = {
  cap: () => Promise<number | null>;
  saveCap: (cap: number | null) => Promise<boolean>;
  staff: () => Promise<StaffMember[]>;
  invite: (staff: NewStaff) => Promise<InviteResult>;
  setActive: (id: string, active: boolean) => Promise<ActiveResult>;
  synonyms: () => Promise<Synonym[]>;
  addSynonym: (variant: string, skill: string) => Promise<SynonymResult>;
  removeSynonym: (id: string) => Promise<boolean>;
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
};
