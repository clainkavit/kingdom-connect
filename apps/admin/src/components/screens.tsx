import { adminNav, adminPhoneTabs, moreItems } from "@kingdom-connect/shared";
import Link from "next/link";
import { strings } from "@/strings";
import { NavIcon } from "./nav-icon";
import { EmptyState } from "./states";

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-4 text-xl font-bold tracking-tight text-foreground">{children}</h1>;
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <ScreenTitle>{title}</ScreenTitle>
      <EmptyState title={strings.comingSoonTitle} message={strings.comingSoonMessage} />
    </>
  );
}

export function MoreList() {
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {moreItems(adminNav, adminPhoneTabs).map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground"
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
