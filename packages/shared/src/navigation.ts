import type { TextKey } from "./strings";

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
  key: TextKey;
  href: string;
  icon: NavIcon;
};

export const memberNav: readonly NavItem[] = [
  { key: "navDashboard", href: "/", icon: "home" },
  { key: "navPeople", href: "/people", icon: "users" },
  { key: "navOpportunities", href: "/opportunities", icon: "briefcase" },
  { key: "navIdeas", href: "/ideas", icon: "lightbulb" },
  { key: "navTraining", href: "/training", icon: "book-open" },
  { key: "navEvents", href: "/events", icon: "calendar" },
  { key: "navMessages", href: "/messages", icon: "message-square" },
  { key: "navConnections", href: "/connections", icon: "link" },
  { key: "navReports", href: "/reports", icon: "shield" },
  { key: "navSettings", href: "/settings", icon: "sliders-horizontal" },
];

export const memberPhoneTabs: readonly NavItem[] = [
  { key: "tabHome", href: "/", icon: "home" },
  { key: "navPeople", href: "/people", icon: "users" },
  { key: "navOpportunities", href: "/opportunities", icon: "briefcase" },
  { key: "navMessages", href: "/messages", icon: "message-square" },
  { key: "tabMore", href: "/more", icon: "ellipsis" },
];

export const adminNav: readonly NavItem[] = [
  { key: "adminNavDashboard", href: "/", icon: "home" },
  { key: "adminNavVerification", href: "/verification", icon: "check-check" },
  { key: "adminNavModeration", href: "/moderation", icon: "list-checks" },
  { key: "adminNavReports", href: "/reports", icon: "flag" },
  { key: "adminNavReverification", href: "/re-verification", icon: "refresh-cw" },
  { key: "adminNavMembers", href: "/members", icon: "users" },
  { key: "adminNavNews", href: "/news", icon: "newspaper" },
  { key: "adminNavPlans", href: "/milestone-plans", icon: "milestone" },
  { key: "adminNavPost", href: "/post", icon: "megaphone" },
  { key: "adminNavAudit", href: "/audit-log", icon: "history" },
  { key: "adminNavSettings", href: "/settings", icon: "sliders-horizontal" },
];

export const adminPhoneTabs: readonly NavItem[] = [
  { key: "tabHome", href: "/", icon: "home" },
  { key: "adminTabVerify", href: "/verification", icon: "check-check" },
  { key: "adminTabModerate", href: "/moderation", icon: "list-checks" },
  { key: "adminNavReports", href: "/reports", icon: "flag" },
  { key: "tabMore", href: "/more", icon: "ellipsis" },
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
