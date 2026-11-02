import {
  createStaffClient,
  type InviteResult,
  type NewStaff,
  type StaffRole,
} from "@kingdom-connect/shared";
import { anonKey, supabase, url } from "./supabase";

export type StaffMember = { id: string; fullName: string; role: StaffRole; active: boolean };
export type ActiveResult = "done" | "refused" | "failed";

export type SettingsApi = {
  cap: () => Promise<number | null>;
  saveCap: (cap: number | null) => Promise<boolean>;
  staff: () => Promise<StaffMember[]>;
  invite: (staff: NewStaff) => Promise<InviteResult>;
  setActive: (id: string, active: boolean) => Promise<ActiveResult>;
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
};
