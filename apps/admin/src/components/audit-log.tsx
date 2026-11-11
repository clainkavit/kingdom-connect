"use client";

import { formatDateTime } from "@kingdom-connect/shared";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import {
  AUDIT_PAGE_SIZE,
  changedFields,
  type AuditApi,
  type AuditEntry,
  type AuditFilters,
} from "@/lib/audit";
import { Notice } from "./cards";
import { Field, Select } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

type Draft = {
  staffId: string;
  username: string;
  systemOnly: boolean;
  action: string;
  from: string;
  to: string;
};

const emptyDraft: Draft = {
  staffId: "",
  username: "",
  systemOnly: false,
  action: "",
  from: "",
  to: "",
};

function filtersOf(draft: Draft): AuditFilters {
  const filters: AuditFilters = {};
  if (draft.staffId) filters.staffId = draft.staffId;
  if (draft.username.trim()) filters.username = draft.username.trim();
  if (draft.systemOnly) filters.systemOnly = true;
  if (draft.action) filters.action = draft.action;
  if (draft.from) filters.from = draft.from;
  if (draft.to) filters.to = draft.to;
  return filters;
}

function FilterBar({ api, onApply }: { api: AuditApi; onApply: (filters: AuditFilters) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [listsFailed, setListsFailed] = useState(false);

  useEffect(() => {
    api.staff().then(setStaff, () => setListsFailed(true));
    api.actions().then(setActions, () => setListsFailed(true));
  }, [api]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="grid gap-3 min-[881px]:grid-cols-3">
        <Select
          id="audit-staff"
          label={t.auditStaff}
          value={draft.staffId}
          onChange={(v) => set("staffId", v)}
          options={[
            { value: "", label: t.auditAnyStaff },
            ...staff.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Field
          id="audit-username"
          label={t.auditUsername}
          value={draft.username}
          onChange={(v) => set("username", v)}
        />
        <Select
          id="audit-action"
          label={t.auditAction}
          value={draft.action}
          onChange={(v) => set("action", v)}
          options={[
            { value: "", label: t.auditAnyAction },
            ...actions.map((a) => ({ value: a, label: a })),
          ]}
        />
        <Field
          id="audit-from"
          label={t.auditFrom}
          type="date"
          value={draft.from}
          onChange={(v) => set("from", v)}
        />
        <Field
          id="audit-to"
          label={t.auditTo}
          type="date"
          value={draft.to}
          onChange={(v) => set("to", v)}
        />
        <label className="flex min-h-[44px] items-center gap-3 self-end text-sm text-foreground">
          <input
            type="checkbox"
            checked={draft.systemOnly}
            onChange={(e) => set("systemOnly", e.target.checked)}
            className="size-4 accent-[var(--kc-blue)]"
          />
          {t.auditSystemOnly}
        </label>
      </div>
      <Notice tone="warn" text={listsFailed ? t.auditListsFailed : null} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply(filtersOf(draft))}
          className={buttonVariants({ variant: "default" })}
        >
          {t.auditApply}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft);
            onApply({});
          }}
          className={buttonVariants({ variant: "ghost" })}
        >
          {t.auditClear}
        </button>
      </div>
    </section>
  );
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const { t, language } = useLanguage();
  const [full, setFull] = useState(false);
  const changes = changedFields(entry.before, entry.after);
  const actor =
    entry.actorKind === "system"
      ? t.auditSystem
      : !entry.actorName
        ? t.auditDeletedActor(entry.actorId ?? "")
        : entry.actorKind === "member"
          ? t.auditMember(entry.actorName)
          : entry.actorName;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] font-semibold text-foreground">{entry.action}</span>
        <span className="text-ink-2">
          {actor} · {formatDateTime(entry.at, language)}
          {entry.ip ? ` · ${t.auditIp(entry.ip)}` : ""}
        </span>
      </div>
      <span className="font-mono text-[12px] break-all text-ink-2">
        {entry.targetType}
        {entry.targetId ? ` ${entry.targetId}` : ""}
      </span>
      {changes.length === 0 ? (
        <span className="text-ink-2">{t.auditNoChange}</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {changes.map((c) => (
            <li key={c.field} className="font-mono text-[13px] break-all text-foreground">
              {c.from === undefined
                ? `${c.field}: ${c.to}`
                : `${c.field}: ${c.from} → ${c.to ?? t.auditRemoved}`}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {full ? t.auditHideFull : t.auditShowFull}
        </button>
      </div>
      {full ? (
        <div className="grid gap-2 min-[881px]:grid-cols-2">
          {(
            [
              [t.auditBefore, entry.before],
              [t.auditAfter, entry.after],
            ] as const
          ).map(([label, values]) => (
            <figure key={label} className="flex flex-col gap-1">
              <figcaption className="text-[13px] font-semibold text-ink-2">{label}</figcaption>
              <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-[12px] whitespace-pre-wrap break-all text-foreground">
                {values ? JSON.stringify(values, null, 2) : "∅"}
              </pre>
            </figure>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** A13: the read-only audit log, newest first, for Super Admins (SAFE-4). */
export function AuditLog({ api, superAdmin }: { api: AuditApi; superAdmin: boolean }) {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (!superAdmin) return;
    request.current += 1;
    let live = true;
    api.page(filters, null).then(
      (loaded) => {
        if (!live) return;
        setEntries(loaded);
        setMore(loaded.length === AUDIT_PAGE_SIZE);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, superAdmin, filters, attempt]);

  if (!superAdmin)
    return (
      <>
        <ScreenTitle>{t.adminNavAudit}</ScreenTitle>
        <EmptyState title={t.adminNavAudit} message={t.auditSuperAdminOnly} />
      </>
    );

  const loadMore = async () => {
    if (!entries) return;
    const started = request.current;
    setBusy(true);
    setMoreFailed(false);
    try {
      const next = await api.page(filters, entries[entries.length - 1]!.cursor);
      if (request.current !== started) return;
      setEntries((shown) => [...(shown ?? []), ...next]);
      setMore(next.length === AUDIT_PAGE_SIZE);
    } catch {
      if (request.current === started) setMoreFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenTitle>{t.adminNavAudit}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <FilterBar
          api={api}
          onApply={(next) => {
            setEntries(null);
            setFilters(next);
          }}
        />
        {failed ? (
          <ErrorState
            message={t.auditLoadFailed}
            onRetry={() => {
              setFailed(false);
              setEntries(null);
              setAttempt((a) => a + 1);
            }}
          />
        ) : !entries ? (
          <LoadingRows />
        ) : entries.length === 0 ? (
          <EmptyState title={t.auditEmptyTitle} message={t.auditEmptyMessage} />
        ) : (
          <>
            <ul
              aria-label={t.adminNavAudit}
              className="flex flex-col divide-y rounded-lg border bg-card shadow-card"
            >
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
            <Notice tone="bad" text={moreFailed ? t.auditMoreFailed : null} />
            {more ? (
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={loadMore}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t.auditLoadMore}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
