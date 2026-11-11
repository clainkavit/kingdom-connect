"use client";

import { formatDateTime, formatNumber, isOverdue } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import {
  STATS_REFRESH_MS,
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

  return (
    <>
      <ScreenTitle>{t.adminDashboardTitle}</ScreenTitle>
      <div className="flex flex-col gap-4">
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
          <StatTile
            label={t.adminStatPending}
            value={n(stats.pendingSubmittedAt.length)}
            href="/verification"
            detail={oldest ? t.queueOldest(ageText(t, oldest, at)) : undefined}
          />
          <StatTile
            label={t.adminStatRejected}
            value={n(stats.rejectedMembers)}
            href="/members?status=rejected"
          />
          <StatTile label={t.adminStatReports} value={n(stats.openReportCases)} href="/reports" />
        </div>
        <WeeklyMembersChart api={api} />
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
