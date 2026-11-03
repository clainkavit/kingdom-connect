"use client";

import { adminNavFor, adminPhoneTabs, isCurrent, type NavItem } from "@kingdom-connect/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/language";
import { LanguageSwitch } from "./language-switch";
import { NavIcon } from "./nav-icon";

function SidebarLink({ item, current }: { item: NavItem; current: boolean }) {
  const { t } = useLanguage();
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "block rounded-[9px] px-3 py-2.5 text-sidebar-foreground hover:bg-sidebar-accent",
        current &&
          "bg-sidebar-primary font-bold text-sidebar-primary-foreground hover:bg-sidebar-primary",
      )}
    >
      {t[item.key]}
    </Link>
  );
}

function Wordmark() {
  const { platformName } = useLanguage();
  return <div className="text-[19px] font-extrabold text-white">{platformName}</div>;
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
  return (
    <div className="flex min-h-dvh flex-col bg-background min-[881px]:flex-row">
      <header className="flex items-center justify-between bg-sidebar px-5 py-4 min-[881px]:hidden">
        <Wordmark />
        <span className="text-xs tracking-[0.08em] text-navy-mute uppercase">{t.adminLabel}</span>
      </header>
      <aside className="hidden w-[248px] shrink-0 flex-col bg-sidebar px-4 py-[22px] min-[881px]:flex">
        <div className="px-2.5 pb-0.5">
          <Wordmark />
        </div>
        <div className="px-2.5 pb-3 text-xs tracking-[0.08em] text-navy-mute uppercase">
          {t.adminLabel}
        </div>
        <nav aria-label={t.adminMenu} className="flex flex-col gap-1">
          {adminNavFor(superAdmin).map((item) => (
            <SidebarLink key={item.href} item={item} current={isCurrent(pathname, item)} />
          ))}
        </nav>
        <p className="mt-auto px-2.5 pt-5 text-xs text-navy-mute">{t.staffNote}</p>
        <div className="px-0.5">
          <LanguageSwitch onNavy />
        </div>
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[44px] px-2.5 text-left text-sm font-medium text-navy-mute hover:text-white"
          >
            {t.logOut}
          </button>
        ) : null}
      </aside>
      <main className="min-w-0 flex-1 px-5 py-4 pb-24 min-[881px]:px-7 min-[881px]:py-6">
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
