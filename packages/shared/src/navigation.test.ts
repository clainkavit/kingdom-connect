import { describe, expect, it } from "vitest";
import {
  adminNav,
  adminPhoneTabs,
  isCurrent,
  memberNav,
  memberPhoneTabs,
  moreItems,
  type NavItem,
} from "./navigation";
import { en } from "./strings/en";

const labels = (items: readonly NavItem[]) => items.map((i) => en[i.key]);

describe("member navigation", () => {
  it("lists the member top bar from PRD section 5, in order", () => {
    expect(labels(memberNav)).toEqual([
      "Dashboard",
      "People",
      "Opportunities",
      "Ideas",
      "Training",
      "Events",
      "Messages",
      "Connections",
      "Reports & Safety",
      "Settings",
    ]);
  });

  it("never contains an admin item", () => {
    const shared = ["Dashboard", "Reports", "Settings"];
    const adminOnly = labels(adminNav).filter((l) => !shared.includes(l));
    for (const label of adminOnly) expect(labels(memberNav)).not.toContain(label);
  });

  it("has no investor item: investor tools live inside Ideas only", () => {
    expect(labels(memberNav).some((l) => /investor/i.test(l))).toBe(false);
  });

  it("uses the phone tabs Home, People, Opportunities, Messages, More", () => {
    expect(labels(memberPhoneTabs)).toEqual([
      "Home",
      "People",
      "Opportunities",
      "Messages",
      "More",
    ]);
  });
});

describe("admin navigation", () => {
  it("lists the admin sidebar from PRD section 5, in order", () => {
    expect(labels(adminNav)).toEqual([
      "Dashboard",
      "Verification queue",
      "Moderation queue",
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
  it("lists the menu items that have no phone tab", () => {
    expect(labels(moreItems(memberNav, memberPhoneTabs))).toEqual([
      "Ideas",
      "Training",
      "Events",
      "Connections",
      "Reports & Safety",
      "Settings",
    ]);
  });
});
