"use client";

import { formatNumber, type Language } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { STATS_REFRESH_MS, type AdminStatsApi, type WeekCount } from "@/lib/admin-dashboard";
import { useLanguage } from "@/lib/language";

const WIDTH = 620;
const HEIGHT = 220;
const LEFT = 36;
const RIGHT = 604;
const TOP = 36;
const BOTTOM = 190;

/** The gridline step: 1, 2 or 5 times a power of ten, giving at most four steps above 0. */
export function gridStep(max: number): number {
  if (max <= 4) return 1;
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
}

const weekLabel = (weekStart: string, language: Language) =>
  new Intl.DateTimeFormat(language === "sw" ? "sw-TZ" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${weekStart}T00:00:00Z`));

/** D06 on A01: new verified members per week, the last 8 weeks, oldest first. */
export function WeeklyMembersChart({ api }: { api: AdminStatsApi }) {
  const { t, language } = useLanguage();
  const [weeks, setWeeks] = useState<WeekCount[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      api.weeklyNewMembers().then(
        (loaded) => {
          if (!live) return;
          setWeeks(loaded);
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
  }, [api]);

  const n = (value: number) => formatNumber(value, language);
  const max = Math.max(0, ...(weeks ?? []).map((w) => w.newMembers));
  const step = gridStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const x = (i: number) =>
    weeks && weeks.length > 1 ? LEFT + ((RIGHT - LEFT) * i) / (weeks.length - 1) : RIGHT;
  const y = (value: number) => BOTTOM - ((BOTTOM - TOP) * value) / top;
  const points = (weeks ?? []).map((w, i) => `${x(i).toFixed(1)},${y(w.newMembers).toFixed(1)}`);
  const last = weeks?.at(-1);
  const counts = (weeks ?? []).map((w) => w.newMembers);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t.weeklyMembersTitle}</h2>
        <Link
          href="/members?status=approved"
          className="flex min-h-[44px] items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t.weeklyMembersOpen}
        </Link>
      </div>
      {failed && !weeks ? (
        <p className="text-sm text-ink-2">{t.weeklyMembersFailed}</p>
      ) : !weeks ? (
        <div className="h-[180px] animate-pulse rounded-md bg-surface-2" />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            role="img"
            aria-label={t.weeklyMembersLabel(n(Math.min(...counts)), n(Math.max(...counts)))}
            className="block h-auto"
          >
            {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((value) => (
              <g key={value}>
                <line
                  x1={LEFT}
                  x2={RIGHT}
                  y1={y(value)}
                  y2={y(value)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={LEFT - 8}
                  y={y(value) + 4}
                  textAnchor="end"
                  className="fill-ink-2 text-[11px] font-medium"
                >
                  {n(value)}
                </text>
              </g>
            ))}
            <polygon
              points={`${x(0).toFixed(1)},${BOTTOM} ${points.join(" ")} ${x(weeks.length - 1).toFixed(1)},${BOTTOM}`}
              className="fill-primary"
              fillOpacity={0.1}
            />
            <polyline
              points={points.join(" ")}
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {last ? (
              <>
                <circle
                  cx={x(weeks.length - 1)}
                  cy={y(last.newMembers)}
                  r={5}
                  className="fill-primary stroke-card"
                  strokeWidth={2}
                />
                <text
                  x={x(weeks.length - 1) - 10}
                  y={y(last.newMembers) - 12}
                  textAnchor="end"
                  className="fill-foreground text-[13px] font-extrabold"
                >
                  {t.weeklyMembersThisWeek(n(last.newMembers))}
                </text>
              </>
            ) : null}
            {weeks.map((w, i) => (
              <g key={w.weekStart}>
                <text
                  x={x(i)}
                  y={212}
                  textAnchor="middle"
                  className="fill-ink-2 text-[11px] font-medium"
                >
                  {weekLabel(w.weekStart, language)}
                </text>
                <circle cx={x(i)} cy={y(w.newMembers)} r={12} fill="transparent">
                  <title>
                    {t.weeklyMembersPoint(weekLabel(w.weekStart, language), n(w.newMembers))}
                  </title>
                </circle>
              </g>
            ))}
          </svg>
          <ul className="sr-only">
            {weeks.map((w) => (
              <li key={w.weekStart}>
                {t.weeklyMembersPoint(weekLabel(w.weekStart, language), n(w.newMembers))}
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-2">{t.weeklyMembersNote}</p>
        </>
      )}
    </section>
  );
}
