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
  "sprout",
  "users",
] as const;

export type NavIcon = (typeof navIcons)[number];

export type NavItem = {
  key: TextKey;
  href: string;
  icon: NavIcon;
  /** Other pages this section holds; the item shows as current on them too. */
  also?: readonly string[];
};

/**
 * The member app's five sections, the same on a computer and a phone (decided 12 Nov 2026). Growth holds Ideas,
 * Training, Events and Milestone plans; People holds the directory and My connections. My profile, News, Reports &
 * Safety, Settings, language and Log out sit on the account page behind the person icon.
 */
export const memberNav: readonly NavItem[] = [
  { key: "tabHome", href: "/", icon: "home" },
  { key: "navPeople", href: "/people", icon: "users", also: ["/connections"] },
  { key: "navOpportunities", href: "/opportunities", icon: "briefcase" },
  {
    key: "navGrowth",
    href: "/growth",
    icon: "sprout",
    also: ["/ideas", "/training", "/events", "/plans"],
  },
  { key: "navMessages", href: "/messages", icon: "message-square" },
];

export const memberPhoneTabs: readonly NavItem[] = memberNav;

/** The Growth page's sections, each with a one-line hint. */
export const growthSections: readonly (NavItem & { hint: TextKey })[] = [
  { key: "navIdeas", href: "/ideas", icon: "lightbulb", hint: "growthIdeasHint" },
  { key: "navTraining", href: "/training", icon: "book-open", hint: "growthTrainingHint" },
  { key: "navEvents", href: "/events", icon: "calendar", hint: "growthEventsHint" },
  { key: "navPlans", href: "/plans", icon: "milestone", hint: "growthPlansHint" },
];

/** The account page behind the person icon. */
export const accountItems: readonly NavItem[] = [
  { key: "myProfile", href: "/profile", icon: "users" },
  { key: "newsTitle", href: "/news", icon: "newspaper" },
  { key: "navReports", href: "/reports", icon: "shield" },
  { key: "navSettings", href: "/settings", icon: "sliders-horizontal" },
];

export const adminNav: readonly NavItem[] = [
  { key: "adminNavDashboard", href: "/", icon: "home" },
  { key: "adminNavVerification", href: "/verification", icon: "check-check" },
  { key: "adminNavModeration", href: "/moderation", icon: "list-checks" },
  { key: "adminNavIdeas", href: "/ideas", icon: "lightbulb" },
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
  return under(pathname, item.href) || (item.also ?? []).some((href) => under(pathname, href));
}

const superAdminOnly = new Set(["/audit-log"]);

/** The admin menu for a staff role: the audit log is for Super Admins only (SAFE-4). */
export function adminNavFor(superAdmin: boolean): readonly NavItem[] {
  return superAdmin ? adminNav : adminNav.filter((item) => !superAdminOnly.has(item.href));
}

/** The menu items a phone reaches through More: those without a tab of their own. */
export function moreItems(nav: readonly NavItem[], tabs: readonly NavItem[]): NavItem[] {
  const tabHrefs = new Set(tabs.map((t) => t.href));
  return nav.filter((item) => !tabHrefs.has(item.href));
}

const lookPages = [
  "/",
  "/opportunities",
  "/growth",
  "/ideas",
  "/training",
  "/events",
  "/news",
  "/account",
  "/registration",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lookDetails: Record<string, readonly string[]> = {
  "/opportunities": ["new", "mine", "saved", "responses", "scan"],
  "/ideas": ["new", "mine", "saved", "investor"],
  "/training": ["new"],
  "/events": ["new"],
};

/** The read-only pages someone who is not verified may open (R27, docs/screens.md "Look, but not act"). */
export function lookAllows(pathname: string): boolean {
  if (lookPages.includes(pathname)) return true;
  const [, section, id, ...rest] = pathname.split("/");
  const locked = lookDetails[`/${section}`];
  return !!locked && !!id && UUID.test(id) && rest.length === 0 && !locked.includes(id);
}
