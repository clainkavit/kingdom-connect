"use client";

import { formatShortDate, isOverdue } from "@kingdom-connect/shared";
import { Clock, MessageSquare, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import type { QueueItem, VerificationApi } from "@/lib/verification";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function Tag({ tone, children }: { tone: "type" | "warn" | "bad"; children: React.ReactNode }) {
  const colours = {
    type: "bg-warn-soft text-warn-text",
    warn: "bg-warn-soft text-warn-text",
    bad: "bg-bad-soft text-bad-text",
  }[tone];
  return (
    <span
      className={`flex items-center gap-1 rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-bold ${colours}`}
    >
      {children}
    </span>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function VerificationQueue({
  api,
  now = () => new Date(),
}: {
  api: VerificationApi;
  now?: () => Date;
}) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [kind, setKind] = useState<QueueItem["kind"] | "all">("all");

  useEffect(() => {
    let live = true;
    api.queue().then(
      (loaded) => live && setItems(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  const retry = () => {
    setFailed(false);
    setItems(null);
    setAttempt((a) => a + 1);
  };

  const at = now();
  const overdue = items?.filter((i) => isOverdue(i.submittedAt, at)).length ?? 0;
  const shown = items?.filter((i) => kind === "all" || i.kind === kind) ?? [];
  const filters: [QueueItem["kind"] | "all", string][] = [
    ["all", t.queueAll],
    ["member", t.queueFilterMembers],
    ["business", t.queueTypeBusiness],
    ["poster", t.queueTypePoster],
    ["renewal", t.queueTypeRenewal],
  ];

  return (
    <>
      <ScreenTitle
        subtitle={
          items && items.length > 0
            ? t.queueSubtitle(items.length, ageText(t, items[0]!.submittedAt, at))
            : undefined
        }
      >
        {t.adminNavVerification}
      </ScreenTitle>
      <div className="-mt-3 mb-4 flex">
        <Link
          href="/recoveries"
          className="flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary underline"
        >
          <MessageSquare size={15} aria-hidden />
          {t.queueRecoveriesLink}
        </Link>
      </div>
      {failed ? (
        <ErrorState message={t.queueLoadFailed} onRetry={retry} />
      ) : !items ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState title={t.queueEmptyTitle} message={t.queueEmptyMessage} />
      ) : (
        <div className="flex flex-col gap-4">
          {overdue > 0 ? (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-[18px] bg-warn-soft px-5 py-3.5 text-[15px] font-medium text-warn-text"
            >
              <Clock size={17} aria-hidden />
              {t.queueOverdueBanner(overdue)}
            </div>
          ) : null}
          <div role="radiogroup" aria-label={t.queueShow} className="flex flex-wrap gap-2">
            {filters.map(([value, label]) => {
              const count =
                value === "all" ? items.length : items.filter((i) => i.kind === value).length;
              const on = kind === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKind(value)}
                  className={`min-h-[40px] rounded-full px-4 text-sm font-semibold ${on ? "bg-primary text-primary-foreground" : "border border-line-2 bg-card text-foreground hover:bg-surface-2"}`}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>
          <div className="rounded-[22px] border bg-card px-5 py-2 shadow-card">
            <ul className="flex flex-col divide-y">
              {shown.map((item) => {
                const name =
                  (item.kind === "member" ? item.fullName : item.businessName) || item.username;
                const type =
                  item.kind === "renewal"
                    ? t.queueTypeRenewal
                    : item.kind === "poster"
                      ? t.queueTypePoster
                      : item.kind === "business"
                        ? t.queueTypeBusiness
                        : t.queueTypeMember;
                return (
                  <li key={item.id}>
                    <Link
                      href={
                        item.kind === "member"
                          ? `/verification/${item.id}`
                          : `/verification/business/${item.id}`
                      }
                      className="flex min-h-[80px] flex-wrap items-center gap-x-4 gap-y-2 py-3 hover:bg-surface-2"
                    >
                      <span
                        aria-hidden
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px] font-bold text-ink-2"
                      >
                        {initialsOf(name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1 max-[880px]:basis-[calc(100%-60px)]">
                        <span className="truncate text-[16px] font-bold text-foreground">
                          {name}
                        </span>
                        <span className="sr-only">
                          @{item.username} · {type}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5" aria-hidden>
                          <Tag tone="type">{type}</Tag>
                          {isOverdue(item.submittedAt, at) ? (
                            <Tag tone="warn">
                              <Clock size={12} />
                              {t.queueOverdue}
                            </Tag>
                          ) : null}
                          {item.suspectedDuplicate ? (
                            <Tag tone="bad">
                              <TriangleAlert size={12} />
                              {t.suspectedDuplicate}
                            </Tag>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-[13px] text-ink-2 max-[880px]:flex-1 max-[880px]:pl-[60px]">
                        {t.queueSubmitted(
                          formatShortDate(item.submittedAt, language),
                          ageText(t, item.submittedAt, at),
                        )}
                      </span>
                      <span
                        aria-hidden
                        className="grid min-h-[40px] place-items-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
                      >
                        {t.queueOpen}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
