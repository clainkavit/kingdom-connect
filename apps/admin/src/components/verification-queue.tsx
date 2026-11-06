"use client";

import { formatDate, isOverdue } from "@kingdom-connect/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ageText } from "@/lib/age";
import { useLanguage } from "@/lib/language";
import type { QueueItem, VerificationApi } from "@/lib/verification";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function Tag({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "warn" ? "bg-warn-soft text-warn-text" : "bg-bad-soft text-bad-text"}`}
    >
      {children}
    </span>
  );
}

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

  return (
    <>
      <ScreenTitle>{t.adminNavVerification}</ScreenTitle>
      <p className="mb-4 text-sm">
        <Link href="/recoveries" className="font-semibold text-primary underline">
          {t.adminNavRecoveries}
        </Link>
      </p>
      {failed ? (
        <ErrorState message={t.queueLoadFailed} onRetry={retry} />
      ) : !items ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState title={t.queueEmptyTitle} message={t.queueEmptyMessage} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="flex flex-wrap gap-x-4 text-sm font-semibold text-ink-2">
            <span>{t.queueWaiting(items.length)}</span>
            <span>{t.queueOldest(ageText(t, items[0]!.submittedAt, at))}</span>
          </p>
          {overdue > 0 ? (
            <div
              role="alert"
              className="rounded-lg bg-warn-soft px-4 py-3 text-sm font-medium text-warn-text"
            >
              {t.queueOverdueBanner(overdue)}
            </div>
          ) : null}
          <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={
                    item.kind === "member"
                      ? `/verification/${item.id}`
                      : `/verification/business/${item.id}`
                  }
                  className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold text-foreground">
                      {item.kind === "member" ? item.fullName || item.username : item.businessName}
                    </span>
                    <span className="text-[13px] text-ink-2">
                      @{item.username} ·{" "}
                      {item.kind === "renewal"
                        ? t.queueTypeRenewal
                        : item.kind === "poster"
                          ? t.queueTypePoster
                          : item.kind === "business"
                            ? t.queueTypeBusiness
                            : t.queueTypeMember}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {item.suspectedDuplicate ? <Tag tone="bad">{t.suspectedDuplicate}</Tag> : null}
                    {isOverdue(item.submittedAt, at) ? (
                      <Tag tone="warn">{t.queueOverdue}</Tag>
                    ) : null}
                    <span className="text-[13px] text-ink-2">
                      {formatDate(item.submittedAt, language)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
