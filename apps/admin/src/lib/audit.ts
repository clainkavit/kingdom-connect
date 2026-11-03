import { supabase } from "./supabase";

export const AUDIT_PAGE_SIZE = 50;

type RowValues = Record<string, unknown> | null;

export type AuditEntry = {
  id: string;
  at: Date;
  cursor: AuditCursor;
  actorKind: "staff" | "member" | "system";
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: RowValues;
  after: RowValues;
  ip: string | null;
};

/** Where the next page starts: the exact server time and id of the last entry shown. */
export type AuditCursor = { createdAt: string; id: string };

export type AuditFilters = {
  staffId?: string;
  username?: string;
  systemOnly?: boolean;
  action?: string;
  from?: string;
  to?: string;
};

export type AuditApi = {
  page: (filters: AuditFilters, after: AuditCursor | null) => Promise<AuditEntry[]>;
  actions: () => Promise<string[]>;
  staff: () => Promise<{ id: string; name: string }[]>;
};

/** One changed field. `from` or `to` is absent when the field did not exist on that side. */
export type FieldChange = { field: string; from?: string; to?: string };

const TIMESTAMPS = new Set(["created_at", "updated_at"]);

const asText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** The fields an entry changed, leaving out row timestamps. A new row lists every field. */
export function changedFields(before: RowValues, after: RowValues): FieldChange[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return fields
    .filter((field) => !TIMESTAMPS.has(field))
    .filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]))
    .map((field) => {
      const change: FieldChange = { field };
      if (before && field in before) change.from = asText(before[field]);
      if (after && field in after) change.to = asText(after[field]);
      return change;
    });
}

export const auditApi: AuditApi = {
  async page(filters, after) {
    const { data, error } = await supabase.rpc("audit_log", {
      actor_staff: filters.staffId ?? null,
      actor_username: filters.username ?? null,
      system_only: filters.systemOnly ?? false,
      action_name: filters.action ?? null,
      from_date: filters.from ?? null,
      to_date: filters.to ?? null,
      before_at: after?.createdAt ?? null,
      before_id: after?.id ?? null,
      page_size: AUDIT_PAGE_SIZE,
    });
    if (error) throw error;
    return (
      data as {
        id: string;
        created_at: string;
        actor_kind: AuditEntry["actorKind"];
        actor_id: string | null;
        actor_name: string;
        action: string;
        target_type: string;
        target_id: string | null;
        before: RowValues;
        after: RowValues;
        ip_address: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      at: new Date(r.created_at),
      cursor: { createdAt: r.created_at, id: r.id },
      actorKind: r.actor_kind,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      before: r.before,
      after: r.after,
      ip: r.ip_address,
    }));
  },

  async actions() {
    const { data, error } = await supabase.rpc("audit_actions");
    if (error) throw error;
    return data as string[];
  },

  async staff() {
    const { data, error } = await supabase.from("staff").select("id, full_name").order("full_name");
    if (error) throw error;
    return data.map((s) => ({ id: s.id as string, name: s.full_name as string }));
  },
};
