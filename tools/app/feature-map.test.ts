import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminRoutes, memberRoutes, parseFeatureMap, readFeatureMap } from "./feature-map";

const root = join(__dirname, "..", "..");
const map = readFeatureMap(root);
const routesIn = (app: "member" | "admin") =>
  map
    .filter((r) => r.app === app)
    .map((r) => r.route)
    .sort();

describe("docs/feature-map.md", () => {
  it("has a row for every member app screen and no row for a screen that is gone", () => {
    expect(routesIn("member")).toEqual(memberRoutes(join(root, "apps", "member", "app")));
  });

  it("has a row for every admin console screen and no row for a screen that is gone", () => {
    expect(routesIn("admin")).toEqual(adminRoutes(join(root, "apps", "admin", "src", "app")));
  });

  it("names only end-to-end tests that exist", () => {
    const missing = map
      .flatMap((r) => r.provedBy.split(/[ ,]+/).filter(Boolean))
      .filter((spec) => !existsSync(join(root, "e2e", spec)));
    expect(missing).toEqual([]);
  });

  it("fills in how to reach and who can see every screen", () => {
    const empty = map.filter((r) => !r.howToReach || !r.whoCanSee).map((r) => r.route);
    expect(empty).toEqual([]);
  });
});

describe("parseFeatureMap", () => {
  it("reads rows under each app heading", () => {
    const rows = parseFeatureMap(
      [
        "## Member app (`x`)",
        "| Route | Screen | What | How | Who | Proved |",
        "|---|---|---|---|---|---|",
        "| `/work` | S52 | Work | Account > Work | Verified Member | a.spec.ts |",
        "## Admin console (`y`)",
        "| `/` | A01 | Dashboard | Menu | Staff | |",
      ].join("\n"),
    );
    expect(rows).toEqual([
      {
        app: "member",
        route: "/work",
        screen: "S52",
        what: "Work",
        howToReach: "Account > Work",
        whoCanSee: "Verified Member",
        provedBy: "a.spec.ts",
      },
      {
        app: "admin",
        route: "/",
        screen: "A01",
        what: "Dashboard",
        howToReach: "Menu",
        whoCanSee: "Staff",
        provedBy: "",
      },
    ]);
  });
});

describe("route discovery", () => {
  it("turns Expo Router files into routes", () => {
    const routes = memberRoutes(join(root, "apps", "member", "app"));
    expect(routes).toContain("/");
    expect(routes).toContain("/opportunities/[id]/responses");
    expect(routes).not.toContain("/_layout");
    expect(routes.some((r) => r.includes("(app)"))).toBe(false);
  });

  it("turns Next.js page folders into routes", () => {
    const routes = adminRoutes(join(root, "apps", "admin", "src", "app"));
    expect(routes).toContain("/");
    expect(routes).toContain("/verification/business/[id]");
  });
});
