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

export type SecurityAlert = { id: string; summary: string; raisedAt: Date };

/** One week, Monday to Sunday in Tanzania time; weekStart is the Monday as YYYY-MM-DD. */
export type WeekCount = { weekStart: string; newMembers: number };

export type AdminStatsApi = {
  stats: () => Promise<AdminStats>;
  alerts: () => Promise<SecurityAlert[]>;
  acknowledge: (id: string) => Promise<boolean>;
  weeklyNewMembers: () => Promise<WeekCount[]>;
};

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

  async alerts() {
    const { data, error } = await supabase
      .from("security_alerts")
      .select("id, summary, created_at")
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data.map((a) => ({
      id: a.id as string,
      summary: a.summary as string,
      raisedAt: new Date(a.created_at as string),
    }));
  },

  async acknowledge(id) {
    const { error } = await supabase.rpc("acknowledge_security_alert", { alert: id });
    return !error;
  },

  async weeklyNewMembers() {
    const { data, error } = await supabase.rpc("weekly_new_members", { weeks: 8 });
    if (error) throw error;
    return (data as { week_start: string; new_members: number }[]).map((w) => ({
      weekStart: w.week_start,
      newMembers: w.new_members,
    }));
  },
};
