import { supabase } from "./supabase";

export const STATS_REFRESH_MS = 15 * 60 * 1000;

export type AdminStats = {
  verifiedMembers: number;
  pendingSubmittedAt: Date[];
  rejectedMembers: number;
  openReportCases: number;
  signUpsToday: number;
  dailyCap: number | null;
};

export type AdminStatsApi = { stats: () => Promise<AdminStats> };

type StatsRow = {
  verified_members: number;
  pending_submitted_at: string[];
  rejected_members: number;
  open_report_cases: number;
  sign_ups_today: number;
  daily_cap: number | null;
};

export const adminStatsApi: AdminStatsApi = {
  async stats() {
    const { data, error } = await supabase.rpc("admin_dashboard_stats");
    if (error) throw error;
    const row = (data as StatsRow[])[0]!;
    return {
      verifiedMembers: row.verified_members,
      pendingSubmittedAt: row.pending_submitted_at.map((at) => new Date(at)),
      rejectedMembers: row.rejected_members,
      openReportCases: row.open_report_cases,
      signUpsToday: row.sign_ups_today,
      dailyCap: row.daily_cap,
    };
  },
};
