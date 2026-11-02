"use client";

import { adminNavFor, adminPhoneTabs, moreItems, type TextKey } from "@kingdom-connect/shared";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { EmptyState } from "./states";

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-5 text-[26px] font-extrabold tracking-tight text-foreground">{children}</h1>
  );
}

export function ComingSoon({ titleKey }: { titleKey: TextKey }) {
  const { t } = useLanguage();
  return (
    <>
      <ScreenTitle>{t[titleKey]}</ScreenTitle>
      <EmptyState title={t.comingSoonTitle} message={t.comingSoonMessage} />
    </>
  );
}

export function MoreList({ superAdmin = false }: { superAdmin?: boolean }) {
  const { t } = useLanguage();
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {moreItems(adminNavFor(superAdmin), adminPhoneTabs).map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            aria-label={t[item.key]}
            className="flex min-h-[52px] items-center justify-between px-4 text-[15px] text-foreground"
          >
            <span>{t[item.key]}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
