import type { IdeaSeeking } from "@kingdom-connect/shared";
import { supabase } from "./supabase";

export type RequestStatus = "pending" | "approved" | "declined" | "nda_accepted" | "revoked";
export type TicketBand = "under_10m" | "10m_to_50m" | "over_50m";

export type MyRequest = { status: RequestStatus; role: IdeaSeeking; anonymous: boolean };

/** One card in the owner's access manager. An anonymous investor has no id or name before the NDA. */
export type RequestCard = {
  id: string;
  status: RequestStatus;
  role: IdeaSeeking;
  anonymous: boolean;
  requesterId: string | null;
  requesterName: string | null;
  requesterHeadline: string | null;
  sectorEn: string | null;
  sectorSw: string | null;
  ticketBand: TicketBand | null;
};

export type IdeaAccessApi = {
  isInvestor: () => Promise<boolean>;
  myRequest: (ideaId: string) => Promise<MyRequest | null>;
  express: (ideaId: string, role: IdeaSeeking, anonymous: boolean) => Promise<string>;
  recordView: (ideaId: string) => Promise<void>;
  requests: (ideaId: string) => Promise<RequestCard[]>;
  viewCount: (ideaId: string) => Promise<number>;
  decide: (requestId: string, approve: boolean) => Promise<string>;
  revoke: (requestId: string) => Promise<string>;
};

/** S24 and S28: interest in an idea and the owner's access manager (I03). */
export const ideaAccessApi: IdeaAccessApi = {
  async isInvestor() {
    const { data, error } = await supabase
      .from("investor_flags")
      .select("id")
      .is("revoked_at", null)
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async myRequest(ideaId) {
    const { data, error } = await supabase
      .from("idea_access_requests")
      .select("status, role, anonymous")
      .eq("idea_id", ideaId)
      .maybeSingle();
    if (error) throw error;
    return (data as MyRequest | null) ?? null;
  },

  async express(ideaId, role, anonymous) {
    const { data, error } = await supabase.rpc("express_interest", {
      idea: ideaId,
      role,
      anonymous,
    });
    if (error) throw error;
    return data as string;
  },

  async recordView(ideaId) {
    await supabase.rpc("record_idea_view", { idea: ideaId });
  },

  async requests(ideaId) {
    const { data, error } = await supabase.rpc("requests_for_my_idea", { idea: ideaId });
    if (error) throw error;
    return (
      data as {
        request_id: string;
        status: RequestStatus;
        role: IdeaSeeking;
        anonymous: boolean;
        requester_id: string | null;
        requester_name: string | null;
        requester_headline: string | null;
        sector_focus_en: string | null;
        sector_focus_sw: string | null;
        ticket_band: TicketBand | null;
      }[]
    ).map((r) => ({
      id: r.request_id,
      status: r.status,
      role: r.role,
      anonymous: r.anonymous,
      requesterId: r.requester_id,
      requesterName: r.requester_name,
      requesterHeadline: r.requester_headline,
      sectorEn: r.sector_focus_en,
      sectorSw: r.sector_focus_sw,
      ticketBand: r.ticket_band,
    }));
  },

  async viewCount(ideaId) {
    const { data, error } = await supabase.rpc("investor_view_count", { idea: ideaId });
    if (error) throw error;
    return (data as number) ?? 0;
  },

  async decide(requestId, approve) {
    const { data, error } = await supabase.rpc("decide_idea_request", {
      request: requestId,
      approve,
    });
    if (error) throw error;
    return data as string;
  },

  async revoke(requestId) {
    const { data, error } = await supabase.rpc("revoke_idea_access", { request: requestId });
    if (error) throw error;
    return data as string;
  },
};
