import { supabase } from "./supabase";

export type TicketBand = "under_10m" | "10m_to_50m" | "over_50m";

export type Investor = {
  memberId: string;
  name: string;
  username: string;
  route: "invitation" | "application";
  sectorEn: string | null;
  sectorSw: string | null;
  band: TicketBand | null;
  grantedAt: Date;
  grantedBy: string | null;
};

export type InvestorApplication = {
  id: string;
  memberId: string;
  name: string;
  username: string;
  sectorEn: string | null;
  sectorSw: string | null;
  band: TicketBand | null;
  note: string;
  appliedAt: Date;
};

export type InviteCandidate = {
  memberId: string;
  name: string;
  username: string;
  isInvestor: boolean;
};

export type InvestorsApi = {
  investors: () => Promise<Investor[]>;
  applications: () => Promise<InvestorApplication[]>;
  search: (query: string) => Promise<InviteCandidate[]>;
  invite: (memberId: string, band: TicketBand | null) => Promise<string>;
  decide: (applicationId: string, approve: boolean) => Promise<string>;
  revoke: (memberId: string) => Promise<string>;
};

async function call(fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as string;
}

/** A10: investor flag holders, applications and invitations, for staff only (I06). */
export const investorsApi: InvestorsApi = {
  async investors() {
    const { data, error } = await supabase.rpc("investor_list");
    if (error) throw error;
    return (
      data as {
        member_id: string;
        full_name: string | null;
        username: string;
        route: Investor["route"];
        sector_en: string | null;
        sector_sw: string | null;
        ticket_band: TicketBand | null;
        granted_at: string;
        granted_by_name: string | null;
      }[]
    ).map((r) => ({
      memberId: r.member_id,
      name: r.full_name ?? "",
      username: r.username,
      route: r.route,
      sectorEn: r.sector_en,
      sectorSw: r.sector_sw,
      band: r.ticket_band,
      grantedAt: new Date(r.granted_at),
      grantedBy: r.granted_by_name,
    }));
  },

  async applications() {
    const { data, error } = await supabase.rpc("investor_application_queue");
    if (error) throw error;
    return (
      data as {
        application_id: string;
        member_id: string;
        full_name: string | null;
        username: string;
        sector_en: string | null;
        sector_sw: string | null;
        ticket_band: TicketBand | null;
        note: string;
        applied_at: string;
      }[]
    ).map((r) => ({
      id: r.application_id,
      memberId: r.member_id,
      name: r.full_name ?? "",
      username: r.username,
      sectorEn: r.sector_en,
      sectorSw: r.sector_sw,
      band: r.ticket_band,
      note: r.note,
      appliedAt: new Date(r.applied_at),
    }));
  },

  async search(query) {
    const { data, error } = await supabase.rpc("investor_invite_search", { query });
    if (error) throw error;
    return (
      data as {
        member_id: string;
        full_name: string | null;
        username: string;
        is_investor: boolean;
      }[]
    ).map((r) => ({
      memberId: r.member_id,
      name: r.full_name ?? "",
      username: r.username,
      isInvestor: r.is_investor,
    }));
  },

  invite: (memberId, band) => call("invite_investor", { member: memberId, sector: null, band }),
  decide: (applicationId, approve) =>
    call("decide_investor_application", { application: applicationId, approve }),
  revoke: (memberId) => call("revoke_investor_flag", { member: memberId }),
};
