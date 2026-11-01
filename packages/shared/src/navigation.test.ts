import { describe, expect, it } from "vitest";
import {
  adminNav,
  adminPhoneTabs,
  isCurrent,
  memberNav,
  memberPhoneTabs,
  moreItems,
} from "./navigation";

const labels = (items: readonly { label: string }[]) => items.map((i) => i.label);

describe("member navigation", () => {
  it("lists the member sidebar from PRD section 5, in order", () => {
    expect(labels(memberNav)).toEqual([
      "Dashboard",
      "Professionals",
      "Businesses",
      "Opportunities",
      "Ideas",
      "Training & Courses",
      "Events",
      "Messages",
      "Connections",
      "Reports & Safety",
      "Settings",
    ]);
  });

  it("never contains an admin item", () => {
    const adminOnly = labels(adminNav).filter((l) => l !== "Settings");
    for (const label of adminOnly) expect(labels(memberNav)).not.toContain(label);
  });

  it("has no investor item: investor tools live inside Ideas only", () => {
    expect(memberNav.some((i) => /investor/i.test(i.label))).toBe(false);
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
      "Admin Dashboard",
      "Verification Queue",
      "Moderation Queue",
      "Reports",
      "Re-verification",
      "Members",
      "Investors",
      "News",
      "Featured",
      "Audit Log",
      "Settings",
    ]);
  });

  it("uses the phone tabs Home, Verify, Moderate, Reports, More", () => {
    expect(labels(adminPhoneTabs)).toEqual(["Home", "Verify", "Moderate", "Reports", "More"]);
  });
});

describe("phone tabs", () => {
  it("point at sidebar screens, apart from More", () => {
    for (const [tabs, nav] of [
      [memberPhoneTabs, memberNav],
      [adminPhoneTabs, adminNav],
    ] as const) {
      const hrefs = new Set(nav.map((i) => i.href));
      for (const tab of tabs.filter((t) => t.label !== "More"))
        expect(hrefs.has(tab.href)).toBe(true);
    }
  });
});

describe("isCurrent", () => {
  const people = memberPhoneTabs.find((t) => t.label === "People")!;
  const home = memberPhoneTabs.find((t) => t.label === "Home")!;

  it("matches the item's own screen and the screens under it", () => {
    expect(isCurrent("/professionals", people)).toBe(true);
    expect(isCurrent("/professionals/123", people)).toBe(true);
  });

  it("treats People as current on Businesses too", () => {
    expect(isCurrent("/businesses", people)).toBe(true);
  });

  it("matches Home only on the home screen", () => {
    expect(isCurrent("/", home)).toBe(true);
    expect(isCurrent("/messages", home)).toBe(false);
  });
});

describe("moreItems", () => {
  it("lists the sidebar items that have no phone tab, People's screens included", () => {
    expect(moreItems(memberNav, memberPhoneTabs).map((i) => i.label)).toEqual([
      "Businesses",
      "Ideas",
      "Training & Courses",
      "Events",
      "Connections",
      "Reports & Safety",
      "Settings",
    ]);
  });
});

it("nests Jobs, Partnerships, Investment and Tenders under Opportunities (PRD section 5)", () => {
  const opportunities = memberNav.find((i) => i.label === "Opportunities")!;
  expect(labels(opportunities.children ?? [])).toEqual([
    "Jobs",
    "Partnerships",
    "Investment",
    "Tenders",
  ]);
});
