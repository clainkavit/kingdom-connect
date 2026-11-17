"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import type { PickAdminApi, PickedPerson, PickQueueItem, Suggestion } from "@/lib/picks";
import { Notice } from "./cards";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const PAGE = 10;
const WHY_MAX = 300;
const card = "flex flex-col gap-3 rounded-[22px] border bg-card px-6 py-5 shadow-card";
const pill =
  "min-h-[44px] rounded-full border border-line-2 bg-card px-5 text-[15px] font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50";
const primaryPill =
  "min-h-[48px] rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground disabled:opacity-50";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Chip({ tone, children }: { tone: "warn" | "good" | "plain"; children: React.ReactNode }) {
  const colours = {
    warn: "bg-warn-soft text-warn-text",
    good: "bg-good-soft text-good-text",
    plain: "bg-surface-2 text-ink-2",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${colours}`}>{children}</span>
  );
}

type Loaded<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): [Loaded<T>, () => void] {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setLoaded({ state: "ready", value }),
      () => live && setLoaded({ state: "failed" }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return [loaded, () => setAttempt((a) => a + 1)];
}

function SuggestionRow({
  person,
  ticked,
  why,
  onTick,
  onWhy,
}: {
  person: Suggestion;
  ticked: boolean;
  why: string;
  onTick: (v: boolean) => void;
  onWhy: (v: string) => void;
}) {
  const { t } = useLanguage();
  const fit = [
    t.pickFitSkills(person.skillMatches),
    person.sameSector ? t.pickFitSector : null,
    person.sameRegion ? t.pickFitRegion : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const record = [
    person.verifiedBusiness ? t.pickRecordBusiness : null,
    t.pickRecordPlans(person.finishedPlans),
    person.ratingsTotal ? t.pickRecordAgain(person.ratingsAgain, person.ratingsTotal) : null,
    t.pickRecordReports(person.upheldReports),
  ]
    .filter(Boolean)
    .join(" · ");
  const id = `why-${person.memberId}`;
  return (
    <li className="flex flex-col gap-2 py-4">
      <label className="flex items-start gap-3.5">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => onTick(e.target.checked)}
          className="mt-2.5 size-[22px] shrink-0 accent-primary"
          aria-label={t.pickTick(person.fullName)}
        />
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-soft text-sm font-bold text-primary"
        >
          {initialsOf(person.fullName)}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-bold text-foreground">{person.fullName}</span>
          {person.headline ? (
            <span className="text-[13px] text-ink-2">{person.headline}</span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap gap-x-5 gap-y-0.5 text-[13px] text-ink-2">
            <span>
              <strong className="font-bold text-foreground">{t.pickFit}</strong> {fit}
            </span>
            <span>
              <strong className="font-bold text-foreground">{t.pickRecord}</strong> {record}
            </span>
          </span>
        </span>
      </label>
      {ticked ? (
        <div className="ml-[90px] flex flex-col gap-1.5">
          <label htmlFor={id} className="text-xs font-bold text-foreground">
            {t.pickWhyLabel}
          </label>
          <input
            id={id}
            value={why}
            placeholder={t.pickWhyPlaceholder}
            onChange={(e) => onWhy(e.target.value)}
            className="min-h-[44px] rounded-full border border-field bg-card px-4 text-[15px] text-foreground"
          />
        </div>
      ) : null}
    </li>
  );
}

const statusKey = {
  asked: "pickStatusWaiting",
  agreed: "pickStatusYes",
  declined: "pickStatusNo",
  expired: "pickStatusLapsed",
  replaced: "pickStatusLapsed",
} as const;

function RequestPanel({
  api,
  item,
  onChanged,
  onSent,
}: {
  api: PickAdminApi;
  item: PickQueueItem;
  onChanged: () => void;
  /** The post leaves the queue once sent, so the page says so instead of the panel. */
  onSent: () => void;
}) {
  const { t } = useLanguage();
  const [max, setMax] = useState(PAGE);
  const [suggestions, reloadSuggestions] = useLoaded(
    () => api.suggestions(item.requestId, max),
    [api, item.requestId, max],
  );
  const [people, reloadPeople] = useLoaded(() => api.people(item.requestId), [api, item.requestId]);
  const [added, setAdded] = useState<Suggestion[]>([]);
  const [ticks, setTicks] = useState<Record<string, string>>({});
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = [...added, ...(suggestions.state === "ready" ? suggestions.value : [])].filter(
    (s, i, all) => all.findIndex((x) => x.memberId === s.memberId) === i,
  );
  const ticked = Object.entries(ticks);
  const reload = () => {
    setTicks({});
    setAdded([]);
    reloadSuggestions();
    reloadPeople();
    onChanged();
  };

  const ask = async () => {
    if (ticked.length === 0) return setProblem(t.pickTickSomeone);
    if (ticked.some(([, why]) => !why.trim() || why.trim().length > WHY_MAX))
      return setProblem(t.pickWhyNeeded(WHY_MAX));
    setProblem(null);
    setBusy(true);
    const ok = await api
      .ask(
        item.requestId,
        ticked.map(([memberId, why]) => ({ memberId, why: why.trim() })),
      )
      .catch(() => false);
    setBusy(false);
    if (!ok) return setProblem(t.pickAdminFailed);
    setDone(t.pickAsked(ticked.length));
    reload();
  };

  const send = async () => {
    setBusy(true);
    const result = await api.send(item.requestId).catch(() => "failed" as const);
    setBusy(false);
    if (result === "nobody_agreed") return setProblem(t.pickNobodyYet);
    if (result !== "ok") return setProblem(t.pickAdminFailed);
    onSent();
    onChanged();
  };

  const add = async () => {
    const found = await api.findMember(username).catch(() => null);
    if (!found) return setProblem(t.pickNoMember);
    setProblem(null);
    setAdded((a) => [found, ...a]);
    setTicks((tk) => ({ ...tk, [found.memberId]: tk[found.memberId] ?? "" }));
    setUsername("");
  };

  const picked = item.asked + item.agreed + item.declined + item.expired;
  return (
    <section aria-label={item.title} className="flex flex-col gap-4">
      <div className={card}>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="warn">{t.pickWants(item.wanted)}</Chip>
        </div>
        <h2 className="text-[19px] font-bold text-foreground">{item.title}</h2>
        <p className="text-[15px] text-ink-2">{item.posterName}</p>
        {item.note ? (
          <p className="rounded-[14px] bg-surface-2 px-4 py-2.5 text-sm text-foreground">
            <strong className="font-bold">{t.pickPosterNote}</strong> {item.note}
          </p>
        ) : null}
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[19px] font-bold text-foreground">{t.pickSuggested}</h3>
          <Chip tone="warn">{t.pickStaffDecide}</Chip>
        </div>
        <p className="text-[13px] leading-5 text-ink-2">{t.pickRulesNote}</p>
        <Notice tone="good" text={done} />
        {suggestions.state === "failed" ? (
          <ErrorState message={t.pickAdminLoadFailed} onRetry={reloadSuggestions} />
        ) : suggestions.state === "loading" && list.length === 0 ? (
          <LoadingRows />
        ) : (
          <ul className="flex flex-col divide-y border-t">
            {list.map((s) => (
              <SuggestionRow
                key={s.memberId}
                person={s}
                ticked={s.memberId in ticks}
                why={ticks[s.memberId] ?? ""}
                onTick={(v) =>
                  setTicks((tk) => {
                    const next = { ...tk };
                    if (v) next[s.memberId] = next[s.memberId] ?? "";
                    else delete next[s.memberId];
                    return next;
                  })
                }
                onWhy={(v) => setTicks((tk) => ({ ...tk, [s.memberId]: v }))}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2.5 border-t pt-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`add-${item.requestId}`} className="text-xs font-bold text-foreground">
              {t.pickAddMember}
            </label>
            <input
              id={`add-${item.requestId}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.pickUsername}
              className="min-h-[44px] rounded-full border border-field bg-card px-4 text-[15px]"
            />
          </div>
          <button type="button" onClick={add} className={pill}>
            {t.pickAdd}
          </button>
          <button type="button" onClick={() => setMax((m) => m + PAGE)} className={pill}>
            {t.pickShowMore}
          </button>
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[19px] font-bold text-foreground">{t.pickProgress}</h3>
          <span className="flex flex-wrap gap-1.5">
            <Chip tone="warn">{t.pickChipPicked(picked)}</Chip>
            <Chip tone="good">{t.pickChipYes(item.agreed)}</Chip>
            <Chip tone="warn">{t.pickChipWaiting(item.asked)}</Chip>
            <Chip tone="plain">{t.pickChipNo(item.declined)}</Chip>
          </span>
        </div>
        {people.state === "ready" && people.value.length ? (
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-bold text-foreground">{t.pickAlreadyAsked}</h4>
            <ul className="flex flex-col divide-y text-[15px]">
              {people.value.map((p: PickedPerson) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-foreground">{p.fullName}</span>
                  <Chip
                    tone={p.status === "agreed" ? "good" : p.status === "asked" ? "warn" : "plain"}
                  >
                    {t[statusKey[p.status]]}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-[13px] text-ink-2">{t.pickReplaceNote}</p>
        <Notice tone="bad" text={problem} />
        <div className="flex flex-wrap gap-2.5">
          <button type="button" disabled={busy} onClick={ask} className={pill}>
            {t.pickAsk}
          </button>
          <button type="button" disabled={busy} onClick={send} className={primaryPill}>
            {t.pickSendList}
          </button>
        </div>
        <p className="text-xs text-ink-2">{t.pickAuditNote}</p>
      </div>
    </section>
  );
}

/** A18: posts waiting for a pick, with rule-based suggestions (no AI). */
export function PicksAdmin({ api }: { api: PickAdminApi }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState<string | null>(null);
  const [queue, reload] = useLoaded(() => api.queue(), [api]);
  return (
    <>
      <ScreenTitle
        subtitle={
          queue.state === "ready" && queue.value.length
            ? t.pickWaiting(queue.value.length)
            : undefined
        }
      >
        {t.adminNavPicks}
      </ScreenTitle>
      <div className="flex flex-col gap-4">
        <Notice tone="good" text={sent} />
        <p className="-mt-3 text-sm text-ink-2">{t.pickAdminBeta}</p>
        {queue.state === "failed" ? (
          <ErrorState message={t.pickAdminLoadFailed} onRetry={reload} />
        ) : queue.state === "loading" ? (
          <LoadingRows />
        ) : queue.value.length === 0 ? (
          <EmptyState title={t.pickQueueEmpty} message={t.pickQueueEmptyHint} />
        ) : (
          <>
            {queue.value.map((item) => (
              <RequestPanel
                key={item.requestId}
                api={api}
                item={item}
                onChanged={reload}
                onSent={() => setSent(t.pickSent)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
