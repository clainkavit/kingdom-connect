/** Menus and phone tab bars, PRD section 5 and docs/screens.md (Everywhere). */

export const navIcons = [
  "book-open",
  "briefcase",
  "calendar",
  "check-check",
  "ellipsis",
  "flag",
  "history",
  "home",
  "lightbulb",
  "link",
  "list-checks",
  "megaphone",
  "message-square",
  "milestone",
  "newspaper",
  "refresh-cw",
  "shield",
  "sliders-horizontal",
  "users",
] as const;

export type NavIcon = (typeof navIcons)[number];

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
};

export const memberNav: readonly NavItem[] = [
  { label: "Dashboard", href: "/", icon: "home" },
  { label: "People", href: "/people", icon: "users" },
  { label: "Opportunities", href: "/opportunities", icon: "briefcase" },
  { label: "Ideas", href: "/ideas", icon: "lightbulb" },
  { label: "Training", href: "/training", icon: "book-open" },
  { label: "Events", href: "/events", icon: "calendar" },
  { label: "Messages", href: "/messages", icon: "message-square" },
  { label: "Connections", href: "/connections", icon: "link" },
  { label: "Reports & Safety", href: "/reports", icon: "shield" },
  { label: "Settings", href: "/settings", icon: "sliders-horizontal" },
];

export const memberPhoneTabs: readonly NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "People", href: "/people", icon: "users" },
  { label: "Opportunities", href: "/opportunities", icon: "briefcase" },
  { label: "Messages", href: "/messages", icon: "message-square" },
  { label: "More", href: "/more", icon: "ellipsis" },
];

export const adminNav: readonly NavItem[] = [
  { label: "Dashboard", href: "/", icon: "home" },
  { label: "Verification queue", href: "/verification", icon: "check-check" },
  { label: "Moderation queue", href: "/moderation", icon: "list-checks" },
  { label: "Reports", href: "/reports", icon: "flag" },
  { label: "Re-verification", href: "/re-verification", icon: "refresh-cw" },
  { label: "Members and investors", href: "/members", icon: "users" },
  { label: "News and featured", href: "/news", icon: "newspaper" },
  { label: "Milestone plans", href: "/milestone-plans", icon: "milestone" },
  { label: "Post as admin", href: "/post", icon: "megaphone" },
  { label: "Audit log", href: "/audit-log", icon: "history" },
];

export const adminPhoneTabs: readonly NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Verify", href: "/verification", icon: "check-check" },
  { label: "Moderate", href: "/moderation", icon: "list-checks" },
  { label: "Reports", href: "/reports", icon: "flag" },
  { label: "More", href: "/more", icon: "ellipsis" },
];

const under = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(pathname: string, item: NavItem): boolean {
  return under(pathname, item.href);
}

/** The menu items a phone reaches through More: those without a tab of their own. */
export function moreItems(nav: readonly NavItem[], tabs: readonly NavItem[]): NavItem[] {
  const tabHrefs = new Set(tabs.map((t) => t.href));
  return nav.filter((item) => !tabHrefs.has(item.href));
}
