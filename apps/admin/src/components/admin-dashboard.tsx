"use client";

import { formatDate, formatDateTime, formatNumber, isOverdue } from "@kingdom-connect/shared";
import {
  ChevronRight,
  Clock,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  SquarePlus,
  Star,
  TriangleAlert,
  Users,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import { usePhoneWidth } from "@/lib/phone";
import {
  STATS_REFRESH_MS,
  type AdminOverview,
  type AdminStats,
  type AdminStatsApi,
  type SecurityAlert,
} from "@/lib/admin-dashboard";
import { Notice } from "./cards";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";
import { WeeklyMembersChart } from "./weekly-members-chart";

const card = "rounded-[22px] border bg-card px-5 py-5 shadow-card";

const colours = {
  crimson: "var(--kc-crimson)",
  gold: "var(--kc-gold-deep)",
  teal: "var(--kc-teal)",
  violet: "var(--kc-violet)",
};

function StatTile({
  label,
  value,
  href,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  href: string;
  icon: LucideIcon;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[128px] flex-col gap-1 ${card} hover:bg-surface-2 max-[880px]:min-h-0 max-[880px]:rounded-[18px] max-[880px]:px-4 max-[880px]:py-3.5`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-2 max-[880px]:text-[13px]">{label}</span>
        <span className="grid size-9 place-items-center rounded-[10px] bg-blue-soft text-primary max-[880px]:hidden">
          <Icon size={17} aria-hidden />
        </span>
      </span>
      <span className="text-[32px] leading-9 font-extrabold tracking-tight text-foreground max-[880px]:text-[24px] max-[880px]:leading-7">
        {value}
      </span>
      {detail ? <span className="text-[13px] text-ink-2 max-[880px]:hidden">{detail}</span> : null}
    </Link>
  );
}

function CardHead({ title, link, href }: { title: string; link: string; href: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
      <Link
        href={href}
        aria-label={`${title}: ${link}`}
        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        {link}
        <ChevronRight size={15} aria-hidden />
      </Link>
    </div>
  );
}

type Part = { label: string; value: number; colour: string; chip?: string };

/** A ring split by share, with the total in the middle. */
function Donut({ parts, total, unit }: { parts: Part[]; total: string; unit: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const sum = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="size-[140px] shrink-0" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" strokeWidth="18" className="stroke-surface-2" />
      {sum > 0
        ? parts.map((p) => {
            const len = (p.value / sum) * c;
            const arc = (
              <circle
                key={p.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                strokeWidth="18"
                stroke={p.colour}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return arc;
          })
        : null}
      <text
        x="70"
        y="74"
        textAnchor="middle"
        className="fill-foreground text-[28px] font-extrabold"
      >
        {total}
      </text>
      <text x="70" y="94" textAnchor="middle" className="fill-ink-2 text-[12px]">
        {unit}
      </text>
    </svg>
  );
}

function Legend({ parts, n }: { parts: Part[]; n: (v: number) => string }) {
  return (
    <ul className="flex w-full flex-col divide-y text-[15px]">
      {parts.map((p) => (
        <li key={p.label} className="flex items-center gap-2.5 py-2.5">
          <span className="size-3 rounded-[3px]" style={{ background: p.colour }} aria-hidden />
          <span className="flex-1 text-foreground">{p.label}</span>
          {p.chip ? (
            <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-text">
              <Clock size={12} aria-hidden />
              {p.chip}
            </span>
          ) : null}
          <span className="min-w-8 text-right font-extrabold text-foreground">{n(p.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Bars({ rows, n }: { rows: { label: string; value: number }[]; n: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-4 pt-2 text-[15px]">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[96px_1fr_32px] items-center gap-3">
          <span className="text-foreground">{r.label}</span>
          <span className="h-4 overflow-hidden rounded-[4px]">
            <span
              className="block h-full rounded-[4px] bg-crimson"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-extrabold text-foreground">{n(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Gauge({ count, cap }: { count: number; cap: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const share = cap > 0 ? Math.min(1, count / cap) : 0;
  return (
    <svg viewBox="0 0 140 140" className="size-[140px]" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" strokeWidth="12" className="stroke-surface-2" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        stroke={colours.crimson}
        strokeDasharray={`${share * c} ${c}`}
        transform="rotate(-90 70 70)"
      />
    </svg>
  );
}

function RowLink({
  href,
  label,
  value,
  chip,
}: {
  href: string;
  label: string;
  value: string;
  chip?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[48px] items-center gap-3 px-1 text-[15px] hover:bg-surface-2"
      >
        <span className="flex-1 text-foreground">{label}</span>
        {chip ? <span className="text-[13px] text-ink-2">{chip}</span> : null}
        <span className="font-extrabold text-foreground">{value}</span>
        <ChevronRight size={15} className="text-ink-2" aria-hidden />
      </Link>
    </li>
  );
}

/** Tanzania time (UTC+3, no daylight saving). */
const tanzaniaHour = (at: Date) => (at.getUTCHours() + 3) % 24;
const tanzaniaClock = (at: Date) =>
  `${String(tanzaniaHour(at)).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}`;

function useOverview(api: AdminStatsApi, attempt: number) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api.overview().then(
        (loaded) => live && setOverview(loaded),
        () => undefined,
      );
    void load();
    const timer = setInterval(load, STATS_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, attempt]);
  return overview;
}

function SecurityAlerts({ api }: { api: AdminStatsApi }) {
  const { t, language } = useLanguage();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [open, setOpen] = useState(false);
  const phone = usePhoneWidth();

  useEffect(() => {
    let live = true;
    const load = () =>
      api.alerts().then(
        (loaded) => live && setAlerts(loaded),
        () => undefined,
      );
    void load();
    const timer = setInterval(load, STATS_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api]);

  if (alerts.length === 0) return null;
  return (
    <>
      {phone ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-[18px] bg-bad-soft px-4 py-3.5 text-left text-[15px] font-semibold text-bad-text"
        >
          <TriangleAlert size={17} aria-hidden />
          {t.securityAlertsUnseen(alerts.length)}
        </button>
      ) : null}
      <section
        aria-label={t.securityAlertsTitle}
        className={`flex flex-col ${card} ${phone && !open ? "hidden" : ""}`}
      >
        <h2 className="flex items-center gap-2 border-b pb-3 text-[17px] font-bold text-bad-text">
          <TriangleAlert size={18} aria-hidden />
          {t.securityAlertsTitle}
        </h2>
        <ul className="flex flex-col divide-y">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-[15px]">
              <span className="min-w-0 flex-1 text-foreground">
                {a.summary} ·{" "}
                <span className="text-ink-2">{formatDateTime(a.raisedAt, language)}</span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (await api.acknowledge(a.id).catch(() => false))
                    setAlerts((list) => list.filter((x) => x.id !== a.id));
                }}
                className="min-h-[38px] shrink-0 rounded-full border border-line-2 bg-card px-4 text-[13px] font-semibold text-foreground hover:bg-surface-2"
              >
                {t.securityAlertSeen}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** A01: the Release 1 counts, each linking to its filtered queue, refreshed every 15 minutes. */
export function AdminDashboard({
  api,
  superAdmin,
  now = () => new Date(),
}: {
  api: AdminStatsApi;
  superAdmin: boolean;
  now?: () => Date;
}) {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const overview = useOverview(api, attempt);
  const phone = usePhoneWidth();

  useEffect(() => {
    let live = true;
    const load = () =>
      api.stats().then(
        (loaded) => {
          if (!live) return;
          setStats(loaded);
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

  if (failed && !stats)
    return (
      <>
        <ScreenTitle>{t.adminDashboardTitle}</ScreenTitle>
        <ErrorState
          message={t.adminStatsLoadFailed}
          onRetry={() => {
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
        />
      </>
    );
  if (!stats)
    return (
      <>
        <ScreenTitle>{t.adminDashboardTitle}</ScreenTitle>
        <LoadingRows />
      </>
    );

  const at = now();
  const oldest = stats.pendingSubmittedAt[0];
  const overdue = stats.pendingSubmittedAt.filter((s) => isOverdue(s, at)).length;
  const n = (value: number) => formatNumber(value, language);
  const hour = tanzaniaHour(at);
  const greeting = hour < 12 ? t.adminMorning : hour < 17 ? t.adminAfternoon : t.adminEvening;
  const openParts: Part[] = overview
    ? [
        { label: t.adminTypeJobs, value: overview.open.jobs, colour: colours.crimson },
        { label: t.adminTypePartnerships, value: overview.open.partnerships, colour: colours.gold },
        { label: t.adminTypeTenders, value: overview.open.tenders, colour: colours.teal },
        { label: t.adminTypeOther, value: overview.open.other, colour: colours.violet },
      ]
    : [];
  const openTotal = openParts.reduce((s, p) => s + p.value, 0);
  const pendingParts: Part[] = [
    {
      label: t.adminQueueMembers,
      value: stats.pendingSubmittedAt.length,
      colour: colours.crimson,
      ...(oldest ? { chip: t.queueOldest(ageText(t, oldest, at)) } : {}),
    },
    ...(overview
      ? [
          {
            label: t.adminQueueBusinessL2,
            value: overview.pendingBusinessL2,
            colour: colours.gold,
          },
          {
            label: t.adminQueueBusinessL3,
            value: overview.pendingBusinessL3,
            colour: colours.teal,
          },
          { label: t.adminQueueInvestor, value: overview.pendingInvestor, colour: colours.violet },
        ]
      : []),
  ];
  const pendingTotal = pendingParts.reduce((s, p) => s + p.value, 0);
  const waitingParts: Part[] = [
    { label: t.adminWaitVerification, value: pendingTotal, colour: colours.crimson },
    ...(overview
      ? [
          {
            label: t.adminWaitModeration,
            value:
              overview.moderation.opportunities +
              overview.moderation.tenders +
              overview.moderation.ideas,
            colour: colours.gold,
          },
        ]
      : []),
    { label: t.adminWaitReports, value: stats.openReportCases, colour: colours.teal },
  ];
  const quick: [string, string, LucideIcon][] = [
    [t.adminQuickPost, "/post", SquarePlus],
    [t.adminQuickNews, "/news", Newspaper],
    [t.adminQuickFeature, "/news", Star],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 max-[880px]:-mx-5 max-[880px]:-mt-4 max-[880px]:flex-col-reverse max-[880px]:items-start max-[880px]:gap-1 max-[880px]:bg-sidebar max-[880px]:px-5 max-[880px]:pb-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-2 max-[880px]:text-navy-ink">{formatDate(at, language)}</p>
          <h1 className="text-[30px] leading-9 font-extrabold text-primary max-[880px]:text-[22px] max-[880px]:leading-7 max-[880px]:text-white">
            {overview?.staffName
              ? greeting(overview.staffName.split(" ")[0]!)
              : t.adminDashboardTitle}
          </h1>
        </div>
        {loadedAt ? (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2 max-[880px]:text-navy-ink">
            <RefreshCw size={13} aria-hidden />
            <span className="max-[880px]:hidden">
              {t.adminCountsRefresh(tanzaniaClock(loadedAt))}
            </span>
            <span className="min-[881px]:hidden">{t.adminUpdatedAt(tanzaniaClock(loadedAt))}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2.5 max-[880px]:hidden">
        {quick.map(([label, href, Icon]) => (
          <Link
            key={label}
            href={href}
            className="flex min-h-[46px] items-center gap-2 rounded-full border border-line-2 bg-card px-4 text-[15px] font-semibold text-foreground hover:bg-surface-2"
          >
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        ))}
      </div>
      <Notice tone="warn" text={failed ? t.adminStatsStale : null} />
      {overdue > 0 ? (
        <Link
          href="/verification"
          role="alert"
          className="flex items-center gap-2.5 rounded-[18px] bg-warn-soft px-5 py-3.5 text-[15px] font-medium text-warn-text hover:underline"
        >
          <Clock size={17} aria-hidden />
          <span className="flex-1">{t.queueOverdueBanner(overdue)}</span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      ) : null}
      <SecurityAlerts api={api} />
      <div className="grid grid-cols-2 gap-3 min-[881px]:gap-4 min-[1100px]:grid-cols-4">
        <StatTile
          label={t.adminStatVerified}
          value={n(stats.verifiedMembers)}
          href="/members?status=approved"
          icon={Users}
        />
        {overview ? (
          <>
            <StatTile
              label={t.adminStatBusinesses}
              value={n(overview.registeredBusinesses)}
              href="/members"
              icon={ShieldCheck}
              detail={t.adminStatBusinessesDetail}
            />
            <StatTile
              label={t.adminStatOpenOpportunities}
              value={n(openTotal)}
              href="/moderation"
              icon={SquarePlus}
              detail={t.adminStatOpenDetail}
            />
            <StatTile
              label={t.adminStatIdeas}
              value={n(overview.publishedIdeas)}
              href="/ideas"
              icon={Lightbulb}
            />
          </>
        ) : null}
      </div>
      {phone ? (
        <section aria-label={t.adminCapTitle} className={`flex items-center gap-4 ${card}`}>
          {stats.dailyCap === null ? (
            <div className="flex flex-col gap-1">
              <h2 className="text-[17px] font-bold text-foreground">{t.adminCapTitle}</h2>
              <p className="text-[15px] text-foreground">{t.adminCapNone}</p>
            </div>
          ) : (
            <>
              <div className="relative size-[120px] shrink-0">
                <Gauge count={stats.signUpsToday} cap={stats.dailyCap} />
                <div className="absolute inset-0 grid place-content-center text-center">
                  <span className="text-[26px] leading-7 font-extrabold text-foreground">
                    {n(stats.signUpsToday)}
                  </span>
                  <span className="text-[11px] text-ink-2">
                    {t.adminCapOfToday(n(stats.dailyCap))}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-[17px] font-bold text-foreground">{t.adminCapTitle}</h2>
                <p className="text-sm text-ink-2">
                  {t.adminPlacesLeftLimit(n(Math.max(0, stats.dailyCap - stats.signUpsToday)))}
                </p>
              </div>
            </>
          )}
        </section>
      ) : null}
      {phone && overview ? (
        <section aria-label={t.adminWaitingForYou} className={`flex flex-col gap-3 ${card}`}>
          <h2 className="text-[17px] font-bold text-foreground">{t.adminWaitingForYou}</h2>
          <div className="flex items-center gap-4">
            <Donut
              parts={waitingParts}
              total={n(waitingParts.reduce((s, p) => s + p.value, 0))}
              unit={t.adminWaitingWord}
            />
            <ul className="flex flex-col gap-1.5 text-[15px]">
              {waitingParts.map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-[3px]"
                    style={{ background: p.colour }}
                    aria-hidden
                  />
                  <span className="text-foreground">{p.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      <div className="grid items-start gap-4 min-[900px]:grid-cols-2">
        <WeeklyMembersChart api={api} />
        {overview ? (
          <section aria-label={t.adminOpenByType} className={`flex flex-col gap-4 ${card}`}>
            <CardHead
              title={t.adminOpenByType}
              link={t.adminStatOpenOpportunities}
              href="/moderation"
            />
            <div className="flex flex-wrap items-center gap-6">
              <Donut parts={openParts} total={n(openTotal)} unit={t.adminOpenWord} />
              <div className="min-w-[200px] flex-1">
                <Legend parts={openParts} n={n} />
              </div>
            </div>
          </section>
        ) : null}
      </div>
      <div className="grid items-start gap-4 min-[900px]:grid-cols-2 min-[1200px]:grid-cols-3">
        <section aria-label={t.adminStatPending} className={`flex flex-col gap-4 ${card}`}>
          <CardHead title={t.adminStatPending} link={t.adminOpenQueue} href="/verification" />
          <Donut parts={pendingParts} total={n(pendingTotal)} unit={t.adminWaitingWord} />
          <Legend parts={pendingParts} n={n} />
        </section>
        {overview ? (
          <section aria-label={t.adminWaitingModeration} className={`flex flex-col gap-4 ${card}`}>
            <CardHead title={t.adminWaitingModeration} link={t.adminOpenQueue} href="/moderation" />
            <Bars
              n={n}
              rows={[
                { label: t.adminModOpportunities, value: overview.moderation.opportunities },
                { label: t.adminModIdeas, value: overview.moderation.ideas },
                { label: t.adminModTenders, value: overview.moderation.tenders },
              ]}
            />
          </section>
        ) : null}
        {phone ? null : (
          <section aria-label={t.adminCapTitle} className={`flex flex-col gap-3 ${card}`}>
            <h2 className="text-[17px] font-bold text-foreground">{t.adminCapTitle}</h2>
            {stats.dailyCap === null ? (
              <p className="text-[15px] font-semibold text-foreground">{t.adminCapNone}</p>
            ) : (
              <>
                <div className="relative size-[140px]">
                  <Gauge count={stats.signUpsToday} cap={stats.dailyCap} />
                  <div className="absolute inset-0 grid place-content-center text-center">
                    <span className="text-[28px] leading-8 font-extrabold text-foreground">
                      {n(stats.signUpsToday)}
                    </span>
                    <span className="text-xs text-ink-2">
                      {t.adminCapOfToday(n(stats.dailyCap))}
                    </span>
                  </div>
                </div>
                <p className="sr-only">{t.adminCapOf(n(stats.signUpsToday), n(stats.dailyCap))}</p>
                <p className="text-[15px] font-bold text-foreground">
                  {t.adminPlacesLeft(n(Math.max(0, stats.dailyCap - stats.signUpsToday)))}
                </p>
                <p className="text-[13px] text-ink-2">{t.adminCapHint}</p>
              </>
            )}
            {superAdmin ? (
              <>
                <Link href="/settings" className="text-sm font-semibold text-primary underline">
                  {t.adminCapChange}
                </Link>
                <p className="text-xs text-ink-2">{t.adminCapSuperOnly}</p>
              </>
            ) : null}
          </section>
        )}
        <section aria-label={t.adminReportsCard} className={`flex flex-col gap-2 ${card}`}>
          <CardHead title={t.adminReportsCard} link={t.adminStatReports} href="/reports" />
          <ul className="flex flex-col divide-y">
            <RowLink href="/reports" label={t.adminStatReports} value={n(stats.openReportCases)} />
            <RowLink
              href="/members?status=rejected"
              label={t.adminStatRejected}
              value={n(stats.rejectedMembers)}
            />
          </ul>
        </section>
      </div>
    </div>
  );
}
