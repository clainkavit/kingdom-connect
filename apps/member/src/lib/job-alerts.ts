import type { EmploymentType } from "@kingdom-connect/shared";
import type { OpportunityFilters, PostKind } from "./opportunity-browse";
import { supabase } from "./supabase";

type Named = { en: string; sw: string };

/** O13: one saved set of Opportunities filters that the daily alert checks. */
export type JobAlert = {
  id: string;
  kind: PostKind | null;
  region: string | null;
  regionName: Named | null;
  sector: string | null;
  sectorName: Named | null;
  employment: EmploymentType | null;
  remoteOnly: boolean;
};

export type AddAlertResult = "ok" | "limit" | "failed";

export type JobAlertsApi = {
  list: () => Promise<JobAlert[]>;
  add: (filters: OpportunityFilters) => Promise<AddAlertResult>;
  remove: (id: string) => Promise<boolean>;
};

/** Up to this many alerts per member, as the database holds them. */
export const MAX_ALERTS = 5;

/** Whether an alert is the same as the filters on screen (the posted-within filter is not part of an alert). */
export function sameFilters(alert: JobAlert, filters: OpportunityFilters): boolean {
  return (
    alert.kind === (filters.kind ?? null) &&
    alert.region === (filters.region ?? null) &&
    alert.sector === (filters.sector ?? null) &&
    alert.employment === (filters.employment ?? null) &&
    alert.remoteOnly === Boolean(filters.remoteOnly)
  );
}

type Row = {
  id: string;
  kind: PostKind | null;
  region: string | null;
  sector: string | null;
  employment: EmploymentType | null;
  remote_only: boolean;
  region_name: { name_en: string; name_sw: string } | null;
  sector_name: { name_en: string; name_sw: string } | null;
};

const named = (n: { name_en: string; name_sw: string } | null): Named | null =>
  n ? { en: n.name_en, sw: n.name_sw } : null;

export const jobAlertsApi: JobAlertsApi = {
  async list() {
    const { data, error } = await supabase
      .from("job_alerts")
      .select(
        "id, kind, region, sector, employment, remote_only, region_name:regions(name_en, name_sw), sector_name:sectors(name_en, name_sw)",
      )
      .order("created_at");
    if (error) throw error;
    return (data as unknown as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      region: r.region,
      regionName: named(r.region_name),
      sector: r.sector,
      sectorName: named(r.sector_name),
      employment: r.employment,
      remoteOnly: r.remote_only,
    }));
  },

  async add(filters) {
    const { error } = await supabase.from("job_alerts").insert({
      kind: filters.kind ?? null,
      region: filters.region ?? null,
      sector: filters.sector ?? null,
      employment: filters.employment ?? null,
      remote_only: Boolean(filters.remoteOnly),
    });
    if (!error || error.code === "23505") return "ok";
    if (error.code === "42501") return "limit";
    return "failed";
  },

  async remove(id) {
    const { error } = await supabase.from("job_alerts").delete().eq("id", id);
    return !error;
  },
};
