"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";
import type { LicenceItem, ReverificationApi } from "@/lib/reverification";
import { ScreenTitle } from "./screens";
import { EmptyState, ErrorState, LoadingRows } from "./states";

function LicenceList({ title, items }: { title: string; items: LicenceItem[] }) {
  const { t } = useLanguage();
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
        {items.map((item) => (
          <li
            key={item.businessId}
            className="flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold text-foreground">
                {item.name}
              </span>
              <span className="text-[13px] text-ink-2">
                @{item.ownerUsername} · {item.level === 3 ? t.queueTypePoster : t.queueTypeBusiness}
              </span>
            </span>
            <span className="text-sm text-ink-2">{t.licenceEnds(item.expiresOn)}</span>
            {item.renewal ? (
              <Link
                href={`/verification/business/${item.renewal.id}`}
                className="text-sm font-semibold text-primary underline"
              >
                {item.renewal.status === "pending" ? t.renewalWaiting : t.renewalRejected}
              </Link>
            ) : (
              <span className="text-sm text-ink-2">{t.noRenewalYet}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A08: expired licences and licences ending in the next 30 days, with any renewal waiting (B04). */
export function Reverification({ api }: { api: ReverificationApi }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<LicenceItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api.list().then(
      (loaded) => live && setItems(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  return (
    <>
      <ScreenTitle>{t.adminNavReverification}</ScreenTitle>
      {failed ? (
        <ErrorState
          message={t.reverificationLoadFailed}
          onRetry={() => {
            setFailed(false);
            setItems(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : !items ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState title={t.reverificationEmptyTitle} message={t.reverificationEmptyMessage} />
      ) : (
        <div className="flex flex-col gap-6">
          <LicenceList title={t.reverificationExpired} items={items.filter((i) => i.expired)} />
          <LicenceList title={t.reverificationExpiring} items={items.filter((i) => !i.expired)} />
        </div>
      )}
    </>
  );
}
