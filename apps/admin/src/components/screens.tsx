import { adminNav, adminPhoneTabs, moreItems } from "@kingdom-connect/shared";
import Link from "next/link";
import { strings } from "@/strings";
import { EmptyState } from "./states";

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-5 text-[26px] font-extrabold tracking-tight text-foreground">{children}</h1>
  );
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
            aria-label={item.label}
            className="flex min-h-[52px] items-center justify-between px-4 text-[15px] text-foreground"
          >
            <span>{item.label}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
