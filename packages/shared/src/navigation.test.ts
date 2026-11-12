import { describe, expect, it } from "vitest";
import {
  adminNav,
  adminNavFor,
  adminPhoneTabs,
  isCurrent,
  memberNav,
  memberPhoneTabs,
  accountItems,
  growthSections,
  moreItems,
  type NavItem,
} from "./navigation";
import { en } from "./strings/en";

const labels = (items: readonly NavItem[]) => items.map((i) => en[i.key]);

describe("admin navigation by role", () => {
  it("shows the audit log to Super Admins only (SAFE-4)", () => {
    expect(adminNavFor(true)).toEqual(adminNav);
    expect(adminNavFor(false).map((i) => i.href)).not.toContain("/audit-log");
    expect(adminNavFor(false)).toHaveLength(adminNav.length - 1);
  });
});

describe("member navigation", () => {
  it("has five sections, the same on a computer and a phone (decided 12 Nov 2026)", () => {
    expect(labels(memberNav)).toEqual(["Home", "People", "Opportunities", "Growth", "Messages"]);
    expect(memberPhoneTabs).toEqual(memberNav);
  });

  it("keeps Ideas, Training, Events and plans under Growth, and the rest on the account page", () => {
    expect(labels(growthSections)).toEqual(["Ideas", "Training", "Events", "Milestone plans"]);
    expect(labels(accountItems)).toEqual([
      "My profile",
      "News and updates",
      "Reports & Safety",
      "Settings",
    ]);
  });

  it("marks Growth current inside its sections, and People on My connections", () => {
    const growth = memberNav.find((i) => i.href === "/growth")!;
    const people = memberNav.find((i) => i.href === "/people")!;
    for (const path of ["/growth", "/ideas/i1", "/training", "/events/e1", "/plans/p1"])
      expect(isCurrent(path, growth)).toBe(true);
    expect(isCurrent("/opportunities", growth)).toBe(false);
    expect(isCurrent("/connections", people)).toBe(true);
  });

  it("never contains an admin item", () => {
    const shared = ["Dashboard", "Home", "Ideas", "Reports", "Settings"];
    const adminOnly = labels(adminNav).filter((l) => !shared.includes(l));
    for (const label of adminOnly) expect(labels(memberNav)).not.toContain(label);
  });

  it("has no investor item: investor tools live inside Ideas only", () => {
    expect(labels(memberNav).some((l) => /investor/i.test(l))).toBe(false);
  });
});

describe("admin navigation", () => {
  it("lists the admin sidebar from PRD section 5, in order", () => {
    expect(labels(adminNav)).toEqual([
      "Dashboard",
      "Verification queue",
      "Moderation queue",
      "Ideas",
      "Reports",
      "Re-verification",
      "Members and investors",
      "News and featured",
      "Milestone plans",
      "Post as admin",
      "Audit log",
      "Settings",
    ]);
  });

  it("uses the phone tabs Home, Verify, Moderate, Reports, More", () => {
    expect(labels(adminPhoneTabs)).toEqual(["Home", "Verify", "Moderate", "Reports", "More"]);
  });
});

describe("phone tabs", () => {
  it("point at menu screens, apart from More", () => {
    for (const [tabs, nav] of [
      [memberPhoneTabs, memberNav],
      [adminPhoneTabs, adminNav],
    ] as const) {
      const hrefs = new Set(nav.map((i) => i.href));
      for (const tab of tabs.filter((t) => t.key !== "tabMore"))
        expect(hrefs.has(tab.href)).toBe(true);
    }
  });
});

describe("isCurrent", () => {
  const people = memberPhoneTabs.find((t) => t.key === "navPeople")!;
  const home = memberPhoneTabs.find((t) => t.key === "tabHome")!;

  it("matches the item's own screen and the screens under it", () => {
    expect(isCurrent("/people", people)).toBe(true);
    expect(isCurrent("/people/123", people)).toBe(true);
  });

  it("matches Home only on the home screen", () => {
    expect(isCurrent("/", home)).toBe(true);
    expect(isCurrent("/messages", home)).toBe(false);
  });
});

describe("moreItems", () => {
  it("lists the admin menu items that have no phone tab", () => {
    expect(moreItems(adminNav, adminPhoneTabs).map((i) => i.href)).not.toContain("/verification");
    expect(moreItems(adminNav, adminPhoneTabs).map((i) => i.href)).toContain("/settings");
  });
});
