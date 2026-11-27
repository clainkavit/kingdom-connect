"use client";

import { tanzaniaDate, type Strings } from "@kingdom-connect/shared";
import { Fragment, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import {
  AUDIT_KINDS,
  AUDIT_PAGE_SIZE,
  type AuditApi,
  type AuditEntry,
  type AuditFilters,
  type AuditKind,
  type AuditNames,
} from "@/lib/audit";
import { describe, idsIn, type PlainEntry } from "@/lib/audit-plain";
import { Notice } from "./cards";
import { Field, Select } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const KIND_COLOR: Record<AuditKind, string> = {
  people: "var(--kc-blue)",
  investors: "var(--kc-gold-deep)",
  business: "var(--kc-teal)",
  opportunities: "var(--kc-violet)",
  ideas: "var(--kc-rose)",
  training: "var(--kc-good)",
  moderation: "var(--kc-crimson)",
  staff: "var(--kc-ink-2)",
  settings: "var(--kc-warn)",
  other: "var(--kc-field)",
};

const SYSTEM = "system";

type Draft = {
  who: string;
  username: string;
  kinds: AuditKind[];
  from: string;
  to: string;
  showRoutine: boolean;
};

const emptyDraft: Draft = {
  who: "",
  username: "",
  kinds: [],
  from: "",
  to: "",
  showRoutine: false,
};

function filtersOf(draft: Draft): AuditFilters {
  const filters: AuditFilters = {};
  if (draft.who === SYSTEM) filters.systemOnly = true;
  else if (draft.who) filters.staffId = draft.who;
  if (draft.username.trim()) filters.username = draft.username.trim();
  if (draft.kinds.length) filters.kinds = draft.kinds;
  if (draft.from) filters.from = draft.from;
  if (draft.to) filters.to = draft.to;
  if (draft.showRoutine) filters.showRoutine = true;
  return filters;
}

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Dot({ kind }: { kind: AuditKind }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: KIND_COLOR[kind] }}
    />
  );
}

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(d);

function dayLabel(d: Date, t: Strings, language: string, now = new Date()) {
  const day = tanzaniaDate(d);
  if (day === tanzaniaDate(now)) return t.auditToday;
  if (day === tanzaniaDate(new Date(now.getTime() - 86_400_000))) return t.auditYesterday;
  return new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(d);
}

function FilterBar({ api, onApply }: { api: AuditApi; onApply: (filters: AuditFilters) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [staffFailed, setStaffFailed] = useState(false);

  useEffect(() => {
    api.staff().then(setStaff, () => setStaffFailed(true));
  }, [api]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const toggleKind = (kind: AuditKind) =>
    set(
      "kinds",
      draft.kinds.includes(kind) ? draft.kinds.filter((k) => k !== kind) : [...draft.kinds, kind],
    );

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="grid gap-3 min-[881px]:grid-cols-4">
        <Select
          id="audit-who"
          label={t.auditWho}
          value={draft.who}
          onChange={(v) => set("who", v)}
          options={[
            { value: "", label: t.auditAnyone },
            { value: SYSTEM, label: t.auditTheSystem },
            ...staff.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <Field
          id="audit-username"
          label={t.auditUsername}
          value={draft.username}
          onChange={(v) => set("username", v)}
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
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">{t.auditKinds}</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={draft.kinds.length === 0}
            onClick={() => set("kinds", [])}
            className={buttonVariants({
              variant: draft.kinds.length === 0 ? "default" : "outline",
              size: "sm",
            })}
          >
            {t.auditAllKinds}
          </button>
          {AUDIT_KINDS.map((kind) => {
            const on = draft.kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(kind)}
                className={buttonVariants({ variant: on ? "default" : "outline", size: "sm" })}
              >
                <Dot kind={kind} />
                {t.auditKind(kind)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.showRoutine}
          onChange={(e) => set("showRoutine", e.target.checked)}
          className="size-4 accent-[var(--kc-blue)]"
        />
        {t.auditShowRoutine}
      </label>
      <Notice tone="warn" text={staffFailed ? t.auditStaffFailed : null} />
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

function Technical({ entry }: { entry: AuditEntry }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start text-[13px] text-ink-2 underline underline-offset-2 hover:text-foreground"
      >
        {open ? t.auditHideTechnical : t.auditTechnical}
      </button>
      {open ? (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-[12px]">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 font-mono">
            <dt className="text-ink-2">{t.auditActionKey}</dt>
            <dd className="break-all">{entry.action}</dd>
            <dt className="text-ink-2">{t.auditRecord}</dt>
            <dd className="break-all">
              {entry.targetType}
              {entry.targetId ? ` ${entry.targetId}` : ""}
            </dd>
            <dt className="text-ink-2">id</dt>
            <dd className="break-all">{entry.id}</dd>
          </dl>
          {(
            [
              [t.auditBefore, entry.before],
              [t.auditAfter, entry.after],
            ] as const
          ).map(([label, values]) => (
            <figure key={label} className="flex flex-col gap-1">
              <figcaption className="font-semibold text-ink-2">{label}</figcaption>
              <pre className="overflow-x-auto rounded bg-card p-2 whitespace-pre-wrap break-all text-foreground">
                {values ? JSON.stringify(values, null, 2) : "∅"}
              </pre>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Detail({
  entry,
  plain,
  onClose,
}: {
  entry: AuditEntry;
  plain: PlainEntry;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const actor =
    entry.actorKind === "system"
      ? t.auditTheSystem
      : entry.actorName || t.auditDeletedActor(entry.actorId ?? "");
  return (
    <aside
      aria-label={t.auditWhatChanged}
      className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-card min-[1100px]:sticky min-[1100px]:top-4"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <Dot kind={entry.kind} />
          {t.auditKind(entry.kind)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {t.auditClose}
        </button>
      </div>
      <p className="text-[17px] leading-snug text-ink-2">
        <Bold text={plain.sentence} />
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-ink-2">{t.auditWho}</dt>
        <dd className="text-foreground">{actor}</dd>
        <dt className="text-ink-2">{t.auditWhen}</dt>
        <dd className="text-foreground">
          {dayLabel(entry.at, t, language)}, {time(entry.at)}
        </dd>
        {entry.ip ? (
          <>
            <dt className="text-ink-2">{t.auditPlace}</dt>
            <dd className="text-foreground">{entry.ip}</dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-foreground">{t.auditWhatChanged}</h3>
        {plain.changes.length === 0 ? (
          <p className="text-[13px] text-ink-2">{t.auditNothingChanged}</p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
            {plain.changes.map((c) => (
              <Fragment key={c.field}>
                <dt className="text-ink-2">{c.label}</dt>
                <dd className="break-words text-foreground">
                  {c.from !== null ? (
                    <>
                      <span className="text-ink-2 line-through">{c.from}</span> →{" "}
                    </>
                  ) : null}
                  {c.to ?? t.auditEmptyValue}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}
      </div>
      <Technical entry={entry} />
    </aside>
  );
}

function Timeline({
  entries,
  names,
  open,
  onOpen,
}: {
  entries: AuditEntry[];
  names: AuditNames;
  open: string | null;
  onOpen: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const days: { day: string; entries: AuditEntry[] }[] = [];
  for (const e of entries) {
    const day = tanzaniaDate(e.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(e);
    else days.push({ day, entries: [e] });
  }
  return (
    <div className="flex flex-col gap-4">
      {days.map(({ day, entries: list }) => (
        <section key={day} className="flex flex-col">
          <h2 className="py-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
            {dayLabel(list[0]!.at, t, language)}
          </h2>
          <ol
            aria-label={dayLabel(list[0]!.at, t, language)}
            className="ml-[54px] border-l-2 border-[var(--kc-line-2)]"
          >
            {list.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-3 -left-[54px] w-10 text-right text-[12px] text-ink-2 tabular-nums">
                  {time(e.at)}
                </span>
                <span
                  aria-hidden
                  className="absolute top-[15px] -left-[7px] size-3 rounded-full border-2 border-[var(--kc-bg)]"
                  style={{ background: KIND_COLOR[e.kind] }}
                />
                <button
                  type="button"
                  aria-expanded={open === e.id}
                  onClick={() => onOpen(e.id)}
                  className={`ml-3 w-[calc(100%-12px)] rounded-md px-3 py-2 text-left text-[14px] text-ink-2 hover:bg-surface-2 ${
                    open === e.id ? "bg-surface-2" : ""
                  } ${e.routine ? "opacity-60" : ""}`}
                >
                  <Bold text={describe(e, names, t, language).sentence} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

type Loaded = { entries: AuditEntry[]; names: AuditNames };

const withNames = async (api: AuditApi, entries: AuditEntry[], known: AuditNames) => {
  const missing = idsIn(entries).filter((id) => !known.has(id));
  const found = missing.length ? await api.names(missing) : new Map<string, string>();
  return new Map([...known, ...found]);
};

/** A13: the read-only audit log as a day timeline in plain words, for Super Admins (SAFE-4). */
export function AuditLog({ api, superAdmin }: { api: AuditApi; superAdmin: boolean }) {
  const { t, language } = useLanguage();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState<string | null>(null);
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
    (async () => {
      const entries = await api.page(filters, null);
      const names = await withNames(api, entries, new Map());
      return { entries, names };
    })().then(
      (next) => {
        if (!live) return;
        setLoaded(next);
        setMore(next.entries.length === AUDIT_PAGE_SIZE);
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
    if (!loaded) return;
    const started = request.current;
    setBusy(true);
    setMoreFailed(false);
    try {
      const next = await api.page(filters, loaded.entries[loaded.entries.length - 1]!.cursor);
      const names = await withNames(api, next, loaded.names);
      if (request.current !== started) return;
      setLoaded((shown) => ({ entries: [...(shown?.entries ?? []), ...next], names }));
      setMore(next.length === AUDIT_PAGE_SIZE);
    } catch {
      if (request.current === started) setMoreFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const openEntry = loaded?.entries.find((e) => e.id === open);

  return (
    <>
      <ScreenTitle>{t.adminNavAudit}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <FilterBar
          api={api}
          onApply={(next) => {
            setLoaded(null);
            setOpen(null);
            setFilters(next);
          }}
        />
        {failed ? (
          <ErrorState
            message={t.auditLoadFailed}
            onRetry={() => {
              setFailed(false);
              setLoaded(null);
              setAttempt((a) => a + 1);
            }}
          />
        ) : !loaded ? (
          <LoadingRows />
        ) : loaded.entries.length === 0 ? (
          <EmptyState title={t.auditEmptyTitle} message={t.auditEmptyMessage} />
        ) : (
          <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex min-w-0 flex-col gap-4">
              <Timeline
                entries={loaded.entries}
                names={loaded.names}
                open={open}
                onOpen={(id) => setOpen((o) => (o === id ? null : id))}
              />
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
            </div>
            {openEntry ? (
              <Detail
                entry={openEntry}
                plain={describe(openEntry, loaded.names, t, language)}
                onClose={() => setOpen(null)}
              />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
