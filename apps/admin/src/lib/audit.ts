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
  kind: AuditKind;
  routine: boolean;
};

export const AUDIT_KINDS = [
  "people",
  "investors",
  "business",
  "opportunities",
  "ideas",
  "training",
  "moderation",
  "staff",
  "settings",
  "other",
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];

/** Names for the ids an entry mentions: staff, members, businesses, opportunities, ideas and trainings. */
export type AuditNames = Map<string, string>;

/** Where the next page starts: the exact server time and id of the last entry shown. */
export type AuditCursor = { createdAt: string; id: string };

export type AuditFilters = {
  staffId?: string;
  username?: string;
  systemOnly?: boolean;
  kinds?: AuditKind[];
  from?: string;
  to?: string;
  showRoutine?: boolean;
};

export type AuditApi = {
  page: (filters: AuditFilters, after: AuditCursor | null) => Promise<AuditEntry[]>;
  names: (ids: string[]) => Promise<AuditNames>;
  staff: () => Promise<{ id: string; name: string }[]>;
};

export const auditApi: AuditApi = {
  async page(filters, after) {
    const { data, error } = await supabase.rpc("audit_log", {
      actor_staff: filters.staffId ?? null,
      actor_username: filters.username ?? null,
      system_only: filters.systemOnly ?? false,
      kinds: filters.kinds?.length ? filters.kinds : null,
      show_routine: filters.showRoutine ?? false,
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
        kind: AuditKind;
        routine: boolean;
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
      kind: r.kind,
      routine: r.routine,
    }));
  },

  async names(ids) {
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.rpc("audit_names", { ids });
    if (error) throw error;
    return new Map((data as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  },

  async staff() {
    const { data, error } = await supabase.from("staff").select("id, full_name").order("full_name");
    if (error) throw error;
    return data.map((s) => ({ id: s.id as string, name: s.full_name as string }));
  },
};
