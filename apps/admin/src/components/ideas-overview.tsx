"use client";

import {
  formatShortDate,
  formatNumber,
  IDEA_STAGES,
  type IdeaStage,
  type Language,
  type Strings,
} from "@kingdom-connect/shared";
import {
  ChevronRight,
  FileText,
  Flag,
  Lightbulb,
  RefreshCw,
  Search,
  SquareCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  IDEA_LIST_STATUSES,
  IDEAS_PAGE_SIZE,
  type IdeaFilters,
  type IdeaListStatus,
  type IdeaRow,
  type IdeasOverview,
  type IdeasOverviewApi,
  type Sector,
  type WaitingIdea,
} from "@/lib/ideas-overview";
import { STATS_REFRESH_MS } from "@/lib/admin-dashboard";
import { useLanguage } from "@/lib/language";
import { Select } from "./field";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

export const stageLabel = (t: Strings, stage: IdeaStage): string =>
  ({
    idea: t.ideaStageIdea,
    prototype: t.ideaStagePrototype,
    early_revenue: t.ideaStageEarlyRevenue,
    growing: t.ideaStageGrowing,
  })[stage];

const statusLabel = (t: Strings, status: IdeaListStatus): string =>
  ({
    published: t.adminIdeaStatusPublished,
    pending_moderation: t.adminIdeaStatusWaiting,
    hidden: t.adminIdeaStatusHidden,
    archived: t.adminIdeaStatusArchived,
    removed: t.adminIdeaStatusRemoved,
  })[status];

const statusTone: Record<IdeaListStatus, string> = {
  published: "bg-good-soft text-good-text",
  pending_moderation: "bg-warn-soft text-warn-text",
  hidden: "bg-bad-soft text-bad-text",
  archived: "bg-surface-2 text-ink-2",
  removed: "bg-bad-soft text-bad-text",
};

const STAGE_COLOURS = [
  "var(--kc-crimson)",
  "var(--kc-gold-deep)",
  "var(--kc-teal)",
  "var(--kc-violet)",
];
const card = "rounded-[22px] border bg-card px-5 py-5 shadow-card";

const sectorName = (s: { sectorEn: string; sectorSw: string }, language: Language) =>
  language === "sw" ? s.sectorSw : s.sectorEn;

function Tile({
  label,
  value,
  pressed,
  onPress,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  pressed: boolean;
  onPress: () => void;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`flex min-h-[128px] flex-col gap-1 text-left ${card} hover:bg-surface-2 ${pressed ? "ring-2 ring-primary" : ""}`}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        <span className="grid size-9 place-items-center rounded-[10px] bg-blue-soft text-primary">
          <Icon size={17} aria-hidden />
        </span>
      </span>
      <span className="text-[32px] leading-9 font-extrabold tracking-tight text-foreground">
        {value}
      </span>
      {detail ? <span className="text-[13px] text-ink-2">{detail}</span> : null}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 ${card}`}>
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** A horizontal bar per value, scaled to the largest. */
function Bars({
  label,
  rows,
  fade = false,
}: {
  label: string;
  rows: { name: string; value: number }[];
  fade?: boolean;
}) {
  const { language } = useLanguage();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-4">
      {rows.map((r, i) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2rem] items-center gap-3">
          <span className="text-[15px] leading-5 text-foreground" title={r.name}>
            {r.name}
          </span>
          <span className="h-4" aria-hidden="true">
            <span
              className="block h-full rounded-[4px] bg-crimson"
              style={{
                width: `${(r.value / max) * 100}%`,
                opacity: fade ? ([1, 0.72, 0.5][i] ?? 0.4) : 1,
              }}
            />
          </span>
          <span className="text-right text-[15px] font-extrabold text-foreground tabular-nums">
            {formatNumber(r.value, language)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StageDonut({ byStage, total }: { byStage: IdeasOverview["byStage"]; total: number }) {
  const { t, language } = useLanguage();
  const n = (v: number) => formatNumber(v, language);
  const r = 58;
  const circumference = 2 * Math.PI * r;
  const lengths = IDEA_STAGES.map((stage) =>
    total ? ((byStage[stage] ?? 0) / total) * circumference : 0,
  );
  const parts = IDEA_STAGES.map((stage, i) => ({
    stage,
    count: byStage[stage] ?? 0,
    colour: STAGE_COLOURS[i]!,
    length: lengths[i]!,
    offset: lengths.slice(0, i).reduce((sum, l) => sum + l, 0),
  }));
  return (
    <div className="flex flex-col gap-4">
      <svg
        width="150"
        height="150"
        viewBox="0 0 150 150"
        role="img"
        aria-label={t.adminIdeasByStageLabel(
          parts.map((p) => `${stageLabel(t, p.stage)} ${n(p.count)}`).join(", "),
        )}
      >
        <circle cx="75" cy="75" r={r} fill="none" className="stroke-surface-2" strokeWidth={20} />
        {parts.map((p) =>
          p.length > 0 ? (
            <circle
              key={p.stage}
              cx="75"
              cy="75"
              r={r}
              fill="none"
              stroke={p.colour}
              strokeWidth={20}
              strokeDasharray={`${p.length.toFixed(2)} ${circumference.toFixed(2)}`}
              strokeDashoffset={(-p.offset).toFixed(2)}
              transform="rotate(-90 75 75)"
            >
              <title>{`${stageLabel(t, p.stage)}: ${n(p.count)}`}</title>
            </circle>
          ) : null,
        )}
        <text
          x="75"
          y="73"
          textAnchor="middle"
          className="fill-foreground text-[26px] font-extrabold"
        >
          {n(total)}
        </text>
        <text x="75" y="95" textAnchor="middle" className="fill-ink-2 text-[12px] font-medium">
          {t.adminIdeasPublishedShort}
        </text>
      </svg>
      <ul className="flex flex-col divide-y border-t text-[15px]">
        {parts.map((p) => (
          <li key={p.stage} className="flex items-center gap-2.5 py-2.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-[3px]"
              style={{ background: p.colour }}
            />
            <span className="flex-1 text-foreground">{stageLabel(t, p.stage)}</span>
            <span className="font-extrabold text-foreground tabular-nums">{n(p.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Charts({ overview }: { overview: IdeasOverview }) {
  const { t, language } = useLanguage();
  const percent =
    overview.interestSent > 0
      ? new Intl.NumberFormat(language === "sw" ? "sw-TZ" : "en-GB", {
          style: "percent",
        }).format(overview.ndaAccepted / overview.interestSent)
      : null;
  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-3">
      <Panel title={t.adminIdeasByStage}>
        {overview.published === 0 ? (
          <p className="text-sm text-ink-2">{t.adminIdeasNonePublished}</p>
        ) : (
          <StageDonut byStage={overview.byStage} total={overview.published} />
        )}
      </Panel>
      <Panel title={t.adminIdeasByIndustry}>
        {overview.byIndustry.length === 0 ? (
          <p className="text-sm text-ink-2">{t.adminIdeasNonePublished}</p>
        ) : (
          <Bars
            label={t.adminIdeasByIndustry}
            rows={overview.byIndustry.map((s) => ({
              name: sectorName(s, language),
              value: s.ideas,
            }))}
          />
        )}
      </Panel>
      <Panel title={t.adminIdeasFunnel}>
        <Bars
          fade
          label={t.adminIdeasFunnel}
          rows={[
            { name: t.adminIdeasInterestSent, value: overview.interestSent },
            { name: t.adminIdeasOwnerApproved, value: overview.ownerApproved },
            { name: t.adminIdeasNdaAccepted, value: overview.ndaAccepted },
          ]}
        />
        <p className="text-[13px] text-ink-2">
          {percent ? t.adminIdeasFunnelNote(percent) : t.adminIdeasFunnelNoteEmpty}
        </p>
      </Panel>
    </div>
  );
}

function Poster({ name, withoutName }: { name: string; withoutName: boolean }) {
  const { t } = useLanguage();
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="font-medium text-foreground">{name}</span>
      {withoutName ? (
        <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-bold whitespace-nowrap text-warn-text">
          {t.adminIdeasSharedWithoutName}
        </span>
      ) : null}
    </span>
  );
}

function Waiting({ api }: { api: IdeasOverviewApi }) {
  const { t, language } = useLanguage();
  const [ideas, setIdeas] = useState<WaitingIdea[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.waiting().then(setIdeas, () => setFailed(true));
  }, [api]);
  return (
    <section className={`flex flex-col gap-3 ${card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[17px] font-bold text-foreground">{t.adminIdeasWaitingTitle}</h2>
        <Link
          href="/moderation"
          className="flex items-center gap-1 text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t.adminIdeasOpenQueue}
          <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      {failed ? (
        <p className="text-sm text-ink-2">{t.adminIdeasLoadFailed}</p>
      ) : !ideas ? (
        <LoadingRows rows={2} />
      ) : ideas.length === 0 ? (
        <p className="text-sm text-ink-2">{t.adminIdeasNoneWaiting}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ideas.slice(0, 5).map((i) => (
            <li
              key={i.id}
              className="flex flex-col gap-2 rounded-[18px] border bg-surface-2 px-4 py-4 text-sm"
            >
              <span className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-blue-soft px-2.5 py-0.5 text-[12px] font-bold text-primary">
                  {sectorName(i, language)}
                </span>
                <span className="rounded-full bg-card px-2.5 py-0.5 text-[12px] font-bold text-ink-2">
                  {stageLabel(t, i.stage)}
                </span>
              </span>
              <span className="text-[16px] font-bold text-foreground">{i.title}</span>
              <Poster name={`@${i.postedBy}`} withoutName={i.sharedWithoutName} />
              <Link
                href="/moderation"
                className="mt-1 self-start rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
              >
                {t.adminIdeasReview}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Draft = { query: string; status: string; sector: string; stage: string };
const emptyDraft: Draft = { query: "", status: "", sector: "", stage: "" };

function filtersOf(d: Draft): IdeaFilters {
  const f: IdeaFilters = {};
  if (d.query.trim()) f.query = d.query.trim();
  if (d.status) f.status = d.status as IdeaListStatus;
  if (d.sector) f.sector = d.sector;
  if (d.stage) f.stage = d.stage as IdeaStage;
  return f;
}

function AllIdeas({
  api,
  draft,
  setDraft,
  filters,
  apply,
  page,
  setPage,
}: {
  api: IdeasOverviewApi;
  draft: Draft;
  setDraft: (d: Draft) => void;
  filters: IdeaFilters;
  apply: (d: Draft) => void;
  page: number;
  setPage: (update: (p: number) => number) => void;
}) {
  const { t, language } = useLanguage();
  const [result, setResult] = useState<{ key: string; rows: IdeaRow[] | null } | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([filters, page, attempt]);
  const answered = result?.key === key ? result : null;
  const rows = answered?.rows ?? null;
  const failed = answered !== null && answered.rows === null;

  useEffect(() => {
    api.sectors().then(setSectors, () => undefined);
  }, [api]);

  useEffect(() => {
    let live = true;
    const asked = JSON.stringify([filters, page, attempt]);
    api.list(filters, page).then(
      (loaded) => live && setResult({ key: asked, rows: loaded }),
      () => live && setResult({ key: asked, rows: null }),
    );
    return () => {
      live = false;
    };
  }, [api, filters, page, attempt]);

  const n = (v: number) => formatNumber(v, language);
  const any = { value: "", label: t.adminIdeasAny };

  return (
    <section aria-label={t.adminIdeasAll} className={`flex min-w-0 flex-col gap-4 ${card}`}>
      <h2 className="text-[17px] font-bold text-foreground">{t.adminIdeasAll}</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <div className="grid items-end gap-3 min-[700px]:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ideas-query" className="text-sm font-semibold text-foreground">
              {t.adminIdeasSearchLabel}
            </label>
            <span className="relative flex">
              <input
                id="ideas-query"
                value={draft.query}
                placeholder={t.adminIdeasSearch}
                onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                className="min-h-[52px] w-full rounded-full border border-field bg-card pr-14 pl-5 text-[15px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <button
                type="submit"
                aria-label={t.adminIdeasShow}
                className="absolute top-1.5 right-1.5 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Search size={17} aria-hidden />
              </button>
            </span>
          </div>
          <Select
            id="ideas-status"
            label={t.adminIdeasStatus}
            value={draft.status}
            onChange={(status) => apply({ ...draft, status })}
            options={[
              any,
              ...IDEA_LIST_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) })),
            ]}
          />
          <Select
            id="ideas-industry"
            label={t.adminIdeasIndustry}
            value={draft.sector}
            onChange={(sector) => apply({ ...draft, sector })}
            options={[
              any,
              ...sectors.map((s) => ({
                value: s.id,
                label: language === "sw" ? s.nameSw : s.nameEn,
              })),
            ]}
          />
          <Select
            id="ideas-stage"
            label={t.adminIdeasStage}
            value={draft.stage}
            onChange={(stage) => apply({ ...draft, stage })}
            options={[any, ...IDEA_STAGES.map((s) => ({ value: s, label: stageLabel(t, s) }))]}
          />
        </div>
      </form>
      {failed ? (
        <ErrorState message={t.adminIdeasLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
      ) : !rows ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        Object.keys(filters).length === 0 ? (
          <EmptyState title={t.adminIdeasNone} message={t.adminIdeasNoneHint} />
        ) : (
          <EmptyState title={t.adminIdeasEmpty} message={t.adminIdeasEmptyHint} />
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead className="border-b text-[13px] text-ink-2">
              <tr>
                <th scope="col" className="py-2 pr-3 pl-3 font-semibold">
                  {t.adminIdeasColIdea}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t.adminIdeasColPostedBy}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t.adminIdeasStage}
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t.adminIdeasStatus}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  {t.adminIdeasColInterested}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-middle">
                  <td className="py-3.5 pr-3 pl-3">
                    <span className="flex flex-col">
                      <span className="text-[15px] font-bold text-foreground">{r.title}</span>
                      <span className="text-[12px] text-ink-2">
                        {sectorName(r, language)} · {t.adminIdeasColActivity}{" "}
                        {formatShortDate(r.lastActivity, language)}
                      </span>
                    </span>
                  </td>
                  <td className="py-3.5 pr-3">
                    <Poster name={r.postedBy} withoutName={r.sharedWithoutName} />
                  </td>
                  <td className="py-3.5 pr-3 text-foreground">{stageLabel(t, r.stage)}</td>
                  <td className="py-3.5 pr-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusTone[r.status]}`}
                    >
                      {statusLabel(t, r.status)}
                    </span>
                  </td>
                  <td className="py-3.5 pr-3 text-right tabular-nums">
                    <span className="flex flex-col items-end">
                      <span className="font-extrabold text-foreground">{n(r.interested)}</span>
                      <span className="text-[12px] whitespace-nowrap text-ink-2">
                        {n(r.withAccess)} {t.adminIdeasColAccess.toLowerCase()}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && (page > 0 || rows.length === IDEAS_PAGE_SIZE) ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.adminIdeasPrevious}
          </button>
          <span className="text-sm text-ink-2">{t.adminIdeasPage(n(page + 1))}</span>
          <button
            type="button"
            disabled={rows.length < IDEAS_PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
            className={buttonVariants({ variant: "outline" })}
          >
            {t.adminIdeasNext}
          </button>
        </div>
      ) : null}
      <p className="text-[13px] text-ink-2">{t.adminIdeasPrivacyNote}</p>
    </section>
  );
}

/** A17 (D05): ideas in brief. Counts, stages, industries, interest to NDA, and every idea but drafts. */
export function IdeasOverviewScreen({ api }: { api: IdeasOverviewApi }) {
  const { t, language } = useLanguage();
  const [overview, setOverview] = useState<IdeasOverview | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filters, setFilters] = useState<IdeaFilters>({});
  const [page, setPage] = useState(0);
  const apply = (d: Draft) => {
    setDraft(d);
    setPage(0);
    setFilters(filtersOf(d));
  };

  useEffect(() => {
    let live = true;
    const load = () =>
      api.overview().then(
        (loaded) => {
          if (!live) return;
          setOverview(loaded);
          setLoadedAt(new Date());
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    void load();
    const timer = setInterval(load, STATS_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, attempt]);

  const n = (v: number) => formatNumber(v, language);
  const filterBy = (status: IdeaListStatus) =>
    apply({ ...draft, status: draft.status === status ? "" : status });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-sm text-ink-2">{t.adminIdeasStaffOnly}</p>
          <ScreenTitle>{t.adminIdeasTitle}</ScreenTitle>
        </div>
        {loadedAt ? (
          <p className="mb-5 flex items-center gap-1.5 text-[13px] text-ink-2">
            <RefreshCw size={13} aria-hidden />
            {t.adminCountsRefresh(
              `${String((loadedAt.getUTCHours() + 3) % 24).padStart(2, "0")}:${String(loadedAt.getUTCMinutes()).padStart(2, "0")}`,
            )}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {failed && !overview ? (
          <ErrorState message={t.adminIdeasLoadFailed} onRetry={() => setAttempt((a) => a + 1)} />
        ) : !overview ? (
          <LoadingRows />
        ) : (
          <>
            <div className="grid gap-4 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4">
              <Tile
                label={t.adminIdeasPublished}
                value={n(overview.published)}
                pressed={draft.status === "published"}
                onPress={() => filterBy("published")}
                icon={Lightbulb}
              />
              <Tile
                label={t.adminIdeasWaiting}
                value={n(overview.waiting)}
                pressed={draft.status === "pending_moderation"}
                onPress={() => filterBy("pending_moderation")}
                icon={SquareCheck}
              />
              <Tile
                label={t.adminIdeasHidden}
                value={n(overview.hidden)}
                pressed={draft.status === "hidden"}
                onPress={() => filterBy("hidden")}
                icon={Flag}
                detail={t.adminIdeasUnderReview}
              />
              <Tile
                label={t.adminIdeasArchived}
                value={n(overview.archived)}
                pressed={draft.status === "archived"}
                onPress={() => filterBy("archived")}
                icon={FileText}
                detail={t.adminIdeasNotInPool}
              />
            </div>
            <Charts overview={overview} />
          </>
        )}
        <div className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Waiting api={api} />
          <AllIdeas
            api={api}
            draft={draft}
            setDraft={setDraft}
            filters={filters}
            apply={apply}
            page={page}
            setPage={setPage}
          />
        </div>
      </div>
    </>
  );
}
