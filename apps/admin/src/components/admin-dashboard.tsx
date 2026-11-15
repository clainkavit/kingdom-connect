"use client";

import { formatDate, formatDateTime, formatNumber, isOverdue } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import {
  STATS_REFRESH_MS,
  type AdminOverview,
  type AdminStats,
  type AdminStatsApi,
  type SecurityAlert,
} from "@/lib/admin-dashboard";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "./cards";
import { ScreenTitle } from "./screens";
import { ErrorState, LoadingRows } from "./states";
import { WeeklyMembersChart } from "./weekly-members-chart";

function StatTile({
  label,
  value,
  href,
  detail,
}: {
  label: string;
  value: string;
  href: string;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[96px] flex-col gap-1 rounded-lg border bg-card p-4 shadow-card hover:bg-surface-2"
    >
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      <span className="text-[28px] font-extrabold tracking-tight text-foreground">{value}</span>
      {detail ? <span className="text-[13px] text-ink-2">{detail}</span> : null}
    </Link>
  );
}

function QueueCard({
  title,
  total,
  href,
  rows,
  detail,
}: {
  title: string;
  total: string;
  href: string;
  rows: [string, string][];
  detail?: string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-card">
      <Link
        href={href}
        className="flex items-baseline justify-between gap-2 underline-offset-2 hover:underline"
      >
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className="text-[24px] font-extrabold text-foreground">{total}</span>
      </Link>
      {detail ? <span className="text-[13px] text-ink-2">{detail}</span> : null}
      <ul className="flex flex-col divide-y text-sm">
        {rows.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-2 py-1.5">
            <span className="text-ink-2">{label}</span>
            <span className="font-semibold text-foreground">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tanzania time (UTC+3, no daylight saving). */
const tanzaniaHour = (at: Date) => (at.getUTCHours() + 3) % 24;

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
    <section
      aria-label={t.securityAlertsTitle}
      className="flex flex-col gap-2 rounded-lg border border-bad-soft bg-card p-4 shadow-card"
    >
      <h2 className="text-base font-semibold text-foreground">{t.securityAlertsTitle}</h2>
      <ul className="flex flex-col divide-y">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-foreground">
              {a.summary} ·{" "}
              <span className="text-ink-2">{formatDateTime(a.raisedAt, language)}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                if (await api.acknowledge(a.id).catch(() => false))
                  setAlerts((list) => list.filter((x) => x.id !== a.id));
              }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t.securityAlertSeen}
            </button>
          </li>
        ))}
      </ul>
    </section>
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const overview = useOverview(api, attempt);

  useEffect(() => {
    let live = true;
    const load = () =>
      api.stats().then(
        (loaded) => {
          if (!live) return;
          setStats(loaded);
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
  const openTotal = overview
    ? overview.open.jobs + overview.open.partnerships + overview.open.tenders + overview.open.other
    : 0;

  return (
    <>
      <p className="text-sm text-ink-2">{formatDate(at, language)}</p>
      <ScreenTitle>
        {overview?.staffName ? greeting(overview.staffName.split(" ")[0]!) : t.adminDashboardTitle}
      </ScreenTitle>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              [t.adminQuickPost, "/post"],
              [t.adminQuickNews, "/news"],
              [t.adminQuickFeature, "/news"],
            ] as const
          ).map(([label, href]) => (
            <Link key={label} href={href} className={buttonVariants({ variant: "outline" })}>
              {label}
            </Link>
          ))}
        </div>
        <Notice tone="warn" text={failed ? t.adminStatsStale : null} />
        <SecurityAlerts api={api} />
        {overdue > 0 ? (
          <Link
            href="/verification"
            role="alert"
            className="rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn-text underline-offset-2 hover:underline"
          >
            {t.queueOverdueBanner(overdue)}
          </Link>
        ) : null}
        <div className="grid gap-3 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4">
          <StatTile
            label={t.adminStatVerified}
            value={n(stats.verifiedMembers)}
            href="/members?status=approved"
          />
          {overview ? (
            <>
              <StatTile
                label={t.adminStatBusinesses}
                value={n(overview.registeredBusinesses)}
                href="/members"
                detail={t.adminStatBusinessesDetail}
              />
              <StatTile
                label={t.adminStatOpenOpportunities}
                value={n(openTotal)}
                href="/moderation"
                detail={t.adminStatOpenDetail}
              />
              <StatTile label={t.adminStatIdeas} value={n(overview.publishedIdeas)} href="/ideas" />
            </>
          ) : null}
        </div>
        <div className="grid gap-3 min-[900px]:grid-cols-2">
          <WeeklyMembersChart api={api} />
          {overview ? (
            <QueueCard
              title={t.adminOpenByType}
              total={n(openTotal)}
              href="/moderation"
              rows={[
                [t.adminTypeJobs, n(overview.open.jobs)],
                [t.adminTypePartnerships, n(overview.open.partnerships)],
                [t.adminTypeTenders, n(overview.open.tenders)],
                [t.adminTypeOther, n(overview.open.other)],
              ]}
            />
          ) : null}
        </div>
        <div className="grid gap-3 min-[900px]:grid-cols-2">
          <QueueCard
            title={t.adminStatPending}
            total={n(
              stats.pendingSubmittedAt.length +
                (overview
                  ? overview.pendingBusinessL2 +
                    overview.pendingBusinessL3 +
                    overview.pendingInvestor
                  : 0),
            )}
            href="/verification"
            detail={oldest ? t.queueOldest(ageText(t, oldest, at)) : undefined}
            rows={[
              [t.adminQueueMembers, n(stats.pendingSubmittedAt.length)],
              ...(overview
                ? ([
                    [t.adminQueueBusinessL2, n(overview.pendingBusinessL2)],
                    [t.adminQueueBusinessL3, n(overview.pendingBusinessL3)],
                    [t.adminQueueInvestor, n(overview.pendingInvestor)],
                  ] as [string, string][])
                : []),
            ]}
          />
          {overview ? (
            <QueueCard
              title={t.adminWaitingModeration}
              total={n(
                overview.moderation.opportunities +
                  overview.moderation.ideas +
                  overview.moderation.tenders,
              )}
              href="/moderation"
              rows={[
                [t.adminModOpportunities, n(overview.moderation.opportunities)],
                [t.adminModIdeas, n(overview.moderation.ideas)],
                [t.adminModTenders, n(overview.moderation.tenders)],
              ]}
            />
          ) : null}
        </div>
        <div className="grid gap-3 min-[600px]:grid-cols-2">
          <StatTile
            label={t.adminStatRejected}
            value={n(stats.rejectedMembers)}
            href="/members?status=rejected"
          />
          <StatTile label={t.adminStatReports} value={n(stats.openReportCases)} href="/reports" />
        </div>
        <section className="flex flex-col gap-1 rounded-lg border bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink-2">{t.adminCapTitle}</h2>
          <p className="text-[15px] font-semibold text-foreground">
            {stats.dailyCap === null
              ? t.adminCapNone
              : t.adminCapOf(n(stats.signUpsToday), n(stats.dailyCap))}
          </p>
          {superAdmin ? (
            <Link href="/settings" className="text-sm font-semibold text-primary underline">
              {t.adminCapChange}
            </Link>
          ) : null}
        </section>
      </div>
    </>
  );
}
