"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import type { PickAdminApi, PickedPerson, PickQueueItem, Suggestion } from "@/lib/picks";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "./cards";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

const PAGE = 10;
const WHY_MAX = 300;

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
    <li className="flex flex-col gap-2 py-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => onTick(e.target.checked)}
          className="mt-1 h-5 w-5"
          aria-label={t.pickTick(person.fullName)}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-foreground">{person.fullName}</span>
          {person.headline ? (
            <span className="text-[13px] text-ink-2">{person.headline}</span>
          ) : null}
          <span className="text-[13px] text-ink-2">
            <strong className="font-semibold text-foreground">{t.pickFit}</strong> {fit}
          </span>
          <span className="text-[13px] text-ink-2">
            <strong className="font-semibold text-foreground">{t.pickRecord}</strong> {record}
          </span>
        </span>
      </label>
      {ticked ? (
        <div className="ml-8 flex flex-col gap-1.5">
          <label htmlFor={id} className="text-sm font-semibold text-foreground">
            {t.pickWhyLabel}
          </label>
          <textarea
            id={id}
            rows={2}
            value={why}
            onChange={(e) => onWhy(e.target.value)}
            className="rounded-[9px] border border-field bg-card px-3 py-2 text-[15px] text-foreground"
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
}: {
  api: PickAdminApi;
  item: PickQueueItem;
  onChanged: () => void;
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
    setDone(t.pickSent);
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

  return (
    <section
      aria-label={item.title}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
    >
      <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
      <p className="text-sm text-ink-2">
        {item.posterName} · {t.pickWants(item.wanted)}
      </p>
      {item.note ? (
        <p className="text-sm text-foreground">
          <strong className="font-semibold">{t.pickPosterNote}</strong> {item.note}
        </p>
      ) : null}
      <p className="text-[13px] text-ink-2">{t.pickRulesNote}</p>
      <Notice tone="good" text={done} />
      {people.state === "ready" && people.value.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">{t.pickAlreadyAsked}</h3>
          <ul className="flex flex-col divide-y text-sm">
            {people.value.map((p: PickedPerson) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-foreground">{p.fullName}</span>
                <span className="font-semibold text-ink-2">{t[statusKey[p.status]]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-foreground">{t.pickSuggested}</h3>
      {suggestions.state === "failed" ? (
        <ErrorState message={t.pickAdminLoadFailed} onRetry={reloadSuggestions} />
      ) : suggestions.state === "loading" && list.length === 0 ? (
        <LoadingRows />
      ) : (
        <ul className="flex flex-col divide-y">
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`add-${item.requestId}`}
            className="text-sm font-semibold text-foreground"
          >
            {t.pickAddMember}
          </label>
          <input
            id={`add-${item.requestId}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t.pickUsername}
            className="min-h-[40px] rounded-[9px] border border-field bg-card px-3 text-[15px]"
          />
        </div>
        <button type="button" onClick={add} className={buttonVariants({ variant: "outline" })}>
          {t.pickAdd}
        </button>
        <button
          type="button"
          onClick={() => setMax((m) => m + PAGE)}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.pickShowMore}
        </button>
      </div>
      <p className="text-sm text-foreground">
        {t.pickProgressLine(
          item.asked + item.agreed + item.declined + item.expired,
          item.agreed,
          item.asked,
          item.declined,
        )}
      </p>
      <p className="text-[13px] text-ink-2">{t.pickReplaceNote}</p>
      <Notice tone="bad" text={problem} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={ask} className={buttonVariants()}>
          {t.pickAsk}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={send}
          className={buttonVariants({ variant: "outline" })}
        >
          {t.pickSendList}
        </button>
      </div>
      <p className="text-[13px] text-ink-2">{t.pickAuditNote}</p>
    </section>
  );
}

/** A18: posts waiting for a pick, with rule-based suggestions (no AI). */
export function PicksAdmin({ api }: { api: PickAdminApi }) {
  const { t } = useLanguage();
  const [queue, reload] = useLoaded(() => api.queue(), [api]);
  return (
    <>
      <ScreenTitle>{t.adminNavPicks}</ScreenTitle>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">{t.pickAdminBeta}</p>
        {queue.state === "failed" ? (
          <ErrorState message={t.pickAdminLoadFailed} onRetry={reload} />
        ) : queue.state === "loading" ? (
          <LoadingRows />
        ) : queue.value.length === 0 ? (
          <EmptyState title={t.pickQueueEmpty} message={t.pickQueueEmptyHint} />
        ) : (
          <>
            <p className="text-sm font-semibold text-ink-2">{t.pickWaiting(queue.value.length)}</p>
            {queue.value.map((item) => (
              <RequestPanel key={item.requestId} api={api} item={item} onChanged={reload} />
            ))}
          </>
        )}
      </div>
    </>
  );
}
