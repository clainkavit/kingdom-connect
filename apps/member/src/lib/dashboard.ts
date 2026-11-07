import { supabase } from "./supabase";

type BilingualName = { en: string; sw: string };

type DashboardRow = {
  full_name: string;
  region_en: string | null;
  region_sw: string | null;
  district_en: string | null;
  district_sw: string | null;
  level: number;
  posting_paused: boolean;
};

export type Welcome = {
  fullName: string;
  region: BilingualName | null;
  district: BilingualName | null;
  level: number;
  postingPaused: boolean;
};

/** A training or event the member registered for, or waits for (T01). */
export type MyRegistration = {
  kind: "training" | "event";
  id: string;
  title: string;
  startsAt: string | null;
  status: "registered" | "waitlisted";
  waitlistPosition: number | null;
};

export type DashboardApi = {
  welcome: () => Promise<Welcome | null>;
  registrations: () => Promise<MyRegistration[]>;
};

const bilingual = (en: string | null, sw: string | null): BilingualName | null =>
  en && sw ? { en, sw } : null;

export const dashboardApi: DashboardApi = {
  async welcome() {
    const { data, error } = await supabase.rpc("member_dashboard");
    if (error) throw error;
    const row = (data as DashboardRow[] | null)?.[0];
    if (!row) return null;
    return {
      fullName: row.full_name,
      region: bilingual(row.region_en, row.region_sw),
      district: bilingual(row.district_en, row.district_sw),
      level: row.level,
      postingPaused: row.posting_paused,
    };
  },

  async registrations() {
    const { data, error } = await supabase.rpc("my_registrations");
    if (error) throw error;
    return (
      data as {
        kind: MyRegistration["kind"];
        item_id: string;
        title: string;
        starts_at: string | null;
        status: MyRegistration["status"];
        waitlist_position: number | null;
      }[]
    ).map((r) => ({
      kind: r.kind,
      id: r.item_id,
      title: r.title,
      startsAt: r.starts_at,
      status: r.status,
      waitlistPosition: r.waitlist_position,
    }));
  },
};
