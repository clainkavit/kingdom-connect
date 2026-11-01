/** Sidebars and phone tab bars, PRD section 5 and docs/screens.md (Everywhere). */

export const navIcons = [
  "book-open",
  "briefcase",
  "building",
  "calendar",
  "check-check",
  "eye-off",
  "flag",
  "history",
  "home",
  "lightbulb",
  "link",
  "list-checks",
  "menu",
  "message-square",
  "newspaper",
  "refresh-cw",
  "shield",
  "sliders-horizontal",
  "star",
  "users",
] as const;

export type NavIcon = (typeof navIcons)[number];

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  /** Other screens that count as this item, for highlighting. */
  also?: readonly string[];
  children?: readonly { label: string; href: string }[];
};

export const memberNav: readonly NavItem[] = [
  { label: "Dashboard", href: "/", icon: "home" },
  { label: "Professionals", href: "/professionals", icon: "users" },
  { label: "Businesses", href: "/businesses", icon: "building" },
  {
    label: "Opportunities",
    href: "/opportunities",
    icon: "briefcase",
    children: [
      { label: "Jobs", href: "/opportunities?type=job" },
      { label: "Partnerships", href: "/opportunities?type=partnership" },
      { label: "Investment", href: "/opportunities?type=investment" },
      { label: "Tenders", href: "/opportunities?type=tender" },
    ],
  },
  { label: "Ideas", href: "/ideas", icon: "lightbulb" },
  { label: "Training & Courses", href: "/training", icon: "book-open" },
  { label: "Events", href: "/events", icon: "calendar" },
  { label: "Messages", href: "/messages", icon: "message-square" },
  { label: "Connections", href: "/connections", icon: "link" },
  { label: "Reports & Safety", href: "/reports", icon: "shield" },
  { label: "Settings", href: "/settings", icon: "sliders-horizontal" },
];

export const memberPhoneTabs: readonly NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "People", href: "/professionals", icon: "users", also: ["/businesses"] },
  { label: "Opportunities", href: "/opportunities", icon: "briefcase" },
  { label: "Messages", href: "/messages", icon: "message-square" },
  { label: "More", href: "/more", icon: "menu" },
];

export const adminNav: readonly NavItem[] = [
  { label: "Admin Dashboard", href: "/", icon: "home" },
  { label: "Verification Queue", href: "/verification", icon: "check-check" },
  { label: "Moderation Queue", href: "/moderation", icon: "list-checks" },
  { label: "Reports", href: "/reports", icon: "flag" },
  { label: "Re-verification", href: "/re-verification", icon: "refresh-cw" },
  { label: "Members", href: "/members", icon: "users" },
  { label: "Investors", href: "/investors", icon: "eye-off" },
  { label: "News", href: "/news", icon: "newspaper" },
  { label: "Featured", href: "/featured", icon: "star" },
  { label: "Audit Log", href: "/audit-log", icon: "history" },
  { label: "Settings", href: "/settings", icon: "sliders-horizontal" },
];

export const adminPhoneTabs: readonly NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Verify", href: "/verification", icon: "check-check" },
  { label: "Moderate", href: "/moderation", icon: "list-checks" },
  { label: "Reports", href: "/reports", icon: "flag" },
  { label: "More", href: "/more", icon: "menu" },
];

const under = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function isCurrent(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.also ?? [])].some((href) => under(pathname, href));
}

/** The sidebar items a phone reaches through More: those without a tab of their own. */
export function moreItems(nav: readonly NavItem[], tabs: readonly NavItem[]): NavItem[] {
  const tabHrefs = new Set(tabs.map((t) => t.href));
  return nav.filter((item) => !tabHrefs.has(item.href));
}
