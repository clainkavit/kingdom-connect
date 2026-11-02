"use client";

import { adminNav, adminPhoneTabs, isCurrent, type NavItem } from "@kingdom-connect/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { strings } from "@/strings";
import { NavIcon } from "./nav-icon";

function SidebarLink({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent",
        current &&
          "bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary",
      )}
    >
      <NavIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

function TabLink({ item, current }: { item: NavItem; current: boolean }) {
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
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminShell({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-[236px] shrink-0 flex-col gap-5 bg-sidebar px-3 pt-[18px] pb-4 min-[881px]:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
            <NavIcon name="users" size={20} />
          </span>
          <div>
            <div className="text-lg leading-tight font-extrabold tracking-tight text-white">
              {strings.appName}
            </div>
            <div className="text-[10.5px] tracking-wide text-navy-mute">{strings.adminLabel}</div>
          </div>
        </div>
        <nav aria-label={strings.adminMenu} className="flex flex-col gap-0.5">
          {adminNav.map((item) => (
            <SidebarLink key={item.href} item={item} current={isCurrent(pathname, item)} />
          ))}
        </nav>
        <p className="mt-auto px-2 text-xs text-navy-mute">{strings.staffNote}</p>
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            className="px-2 text-left text-sm font-medium text-navy-mute hover:text-white"
          >
            {strings.logOut}
          </button>
        ) : null}
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-24 min-[881px]:p-6">{children}</main>
      <nav
        aria-label={strings.adminTabs}
        className="fixed inset-x-0 bottom-0 flex border-t bg-card px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 min-[881px]:hidden"
      >
        {adminPhoneTabs.map((item) => (
          <TabLink key={item.href} item={item} current={isCurrent(pathname, item)} />
        ))}
      </nav>
    </div>
  );
}
