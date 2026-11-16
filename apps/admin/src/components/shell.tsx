"use client";

import { adminNavFor, adminPhoneTabs, isCurrent, type NavItem } from "@kingdom-connect/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { adminStatsApi } from "@/lib/admin-dashboard";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language";
import { LanguageSwitch } from "./language-switch";
import { NavIcon } from "./nav-icon";

type NavCounts = Partial<Record<string, number>>;

/** The waiting counts beside the sidebar items, from the dashboard figures. */
function useNavCounts(): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});
  useEffect(() => {
    let live = true;
    Promise.all([adminStatsApi.stats(), adminStatsApi.overview()])
      .then(([stats, overview]) => {
        if (!live) return;
        setCounts({
          "/verification":
            stats.pendingSubmittedAt.length +
            overview.pendingBusinessL2 +
            overview.pendingBusinessL3 +
            overview.pendingInvestor,
          "/moderation":
            overview.moderation.opportunities +
            overview.moderation.tenders +
            overview.moderation.ideas,
          "/reports": stats.openReportCases,
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

function SidebarLink({
  item,
  current,
  count,
}: {
  item: NavItem;
  current: boolean;
  count?: number;
}) {
  const { t } = useLanguage();
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-[42px] items-center gap-3 rounded-[12px] px-3 text-[15px] font-semibold text-sidebar-foreground hover:bg-sidebar-accent",
        current && "bg-card text-primary hover:bg-card",
      )}
    >
      <NavIcon name={item.icon} size={18} />
      <span className="flex-1">{t[item.key]}</span>
      {count ? (
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-gold px-1.5 text-xs font-extrabold text-gold-ink">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function Wordmark() {
  const { t, platformName } = useLanguage();
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.jpg" alt="" width={44} height={40} className="rounded-[10px]" />
      <div className="leading-tight">
        <div className="text-[16px] font-extrabold text-white">{platformName}</div>
        <div className="text-xs font-extrabold tracking-[0.08em] text-gold uppercase">
          {t.adminLabel}
        </div>
      </div>
    </div>
  );
}

function TabLink({ item, current }: { item: NavItem; current: boolean }) {
  const { t } = useLanguage();
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px] font-semibold text-muted-foreground",
        current && "text-primary",
      )}
    >
      <NavIcon name={item.icon} size={20} />
      <span>{t[item.key]}</span>
    </Link>
  );
}

export function AdminShell({
  children,
  onSignOut,
  superAdmin = false,
}: {
  children: React.ReactNode;
  onSignOut?: () => void;
  superAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const counts = useNavCounts();
  return (
    <div className="flex min-h-dvh flex-col bg-background min-[881px]:flex-row">
      <header className="flex items-center justify-between bg-sidebar px-5 py-4 min-[881px]:hidden">
        <Wordmark />
        <span className="text-xs tracking-[0.08em] text-navy-mute uppercase">{t.adminLabel}</span>
      </header>
      <aside className="sticky top-0 hidden h-dvh w-[284px] shrink-0 p-6 pr-0 min-[881px]:block">
        <div className="flex h-full flex-col overflow-y-auto rounded-[24px] bg-sidebar px-4 py-6">
          <div className="px-2 pb-6">
            <Wordmark />
          </div>
          <nav aria-label={t.adminMenu} className="flex flex-col gap-0.5">
            {adminNavFor(superAdmin).map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                current={isCurrent(pathname, item)}
                count={counts[item.href]}
              />
            ))}
          </nav>
          <p className="mt-auto px-2 pt-6 text-[13px] leading-[19px] text-navy-ink">
            {t.adminSidebarNote}
          </p>
          <div className="flex items-center justify-between gap-2 px-2 pt-4">
            <LanguageSwitch onNavy pill />
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] text-sm font-semibold text-white underline underline-offset-2"
              >
                {t.logOut}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-4 pb-24 min-[881px]:px-8 min-[881px]:py-6">
        {children}
      </main>
      <nav
        aria-label={t.adminTabs}
        className="fixed inset-x-0 bottom-0 flex border-t bg-card px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 min-[881px]:hidden"
      >
        {adminPhoneTabs.map((item) => (
          <TabLink key={item.href} item={item} current={isCurrent(pathname, item)} />
        ))}
      </nav>
    </div>
  );
}
