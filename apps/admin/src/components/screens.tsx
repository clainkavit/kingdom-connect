"use client";

import { adminNavFor, adminPhoneTabs, moreItems, type TextKey } from "@kingdom-connect/shared";
import Link from "next/link";
import { useLanguage } from "@/lib/language";
import { EmptyState } from "./states";

/** The page title. On a phone it sits in the maroon band under the logo, as on the canvas. */
export function ScreenTitle({
  children,
  eyebrow,
  subtitle,
}: {
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-1 max-[880px]:-mx-5 max-[880px]:-mt-4 max-[880px]:bg-sidebar max-[880px]:px-5 max-[880px]:pt-1 max-[880px]:pb-5">
      {eyebrow ? <p className="text-sm text-ink-2 max-[880px]:text-navy-ink">{eyebrow}</p> : null}
      <h1 className="text-[30px] leading-9 font-extrabold tracking-tight text-primary max-[880px]:text-[24px] max-[880px]:leading-[30px] max-[880px]:text-white">
        {children}
      </h1>
      {subtitle ? (
        <p className="text-[15px] text-ink-2 max-[880px]:text-sm max-[880px]:text-navy-ink">
          {subtitle}
        </p>
      ) : null}
    </div>
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
