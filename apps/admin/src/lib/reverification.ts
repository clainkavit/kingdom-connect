import { addDays, tanzaniaDate } from "@kingdom-connect/shared";
import { supabase } from "./supabase";
import { hasRow } from "./utils";

export type LicenceItem = {
  businessId: string;
  name: string;
  ownerUsername: string;
  ownerName: string;
  level: 2 | 3;
  expired: boolean;
  expiresOn: string;
  renewal: { id: string; status: "pending" | "rejected" } | null;
};

export type ReverificationApi = { list: () => Promise<LicenceItem[]> };

const WINDOW_DAYS = 30;

type Row = {
  licence_expires_on: string;
  business: {
    id: string;
    name: string;
    level: 2 | 3;
    status: "approved" | "expired";
    member: { username: string; profile: { full_name: string } | null };
    requests: {
      id: string;
      status: string;
      submitted_at: string;
      renewal: object | object[] | null;
    }[];
  };
};

/** A08: licences that ended, then licences ending in the next 30 days, soonest first. */
export const reverificationApi: ReverificationApi = {
  async list() {
    const today = tanzaniaDate();
    const until = addDays(today, WINDOW_DAYS);
    const { data, error } = await supabase
      .from("business_private")
      .select(
        `licence_expires_on,
         business:businesses!inner(id, name, level, status,
           member:members!businesses_member_id_fkey(username, profile:profiles(full_name)),
           requests:verification_requests!verification_requests_business_id_fkey(id, status, submitted_at,
             renewal:licence_renewals(request_id)))`,
      )
      .lte("licence_expires_on", until)
      .in("business.status", ["approved", "expired"])
      .order("licence_expires_on");
    if (error) throw error;
    return (data as unknown as Row[]).map((row) => {
      const latest = row.business.requests
        .filter((r) => hasRow(r.renewal) && (r.status === "pending" || r.status === "rejected"))
        .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0];
      return {
        businessId: row.business.id,
        name: row.business.name,
        ownerUsername: row.business.member.username,
        ownerName: row.business.member.profile?.full_name ?? "",
        level: row.business.level,
        expired: row.business.status === "expired" || row.licence_expires_on <= today,
        expiresOn: row.licence_expires_on,
        renewal: latest ? { id: latest.id, status: latest.status as "pending" | "rejected" } : null,
      };
    });
  },
};
