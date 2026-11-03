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

export type DashboardApi = {
  welcome: () => Promise<Welcome | null>;
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
};
