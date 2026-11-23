import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type AppName = "member" | "admin";

export type FeatureRow = {
  app: AppName;
  route: string;
  screen: string;
  what: string;
  howToReach: string;
  whoCanSee: string;
  provedBy: string;
};

const sectionApp: Record<string, AppName> = {
  "## Member app": "member",
  "## Admin console": "admin",
};

export function parseFeatureMap(markdown: string): FeatureRow[] {
  const rows: FeatureRow[] = [];
  let app: AppName | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = Object.keys(sectionApp).find((h) => line.startsWith(h));
    if (heading) app = sectionApp[heading];
    if (!app || !line.startsWith("| `/")) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    const [route, screen, what, howToReach, whoCanSee, provedBy] = cells;
    rows.push({
      app,
      route: route!.replace(/`/g, ""),
      screen: screen ?? "",
      what: what ?? "",
      howToReach: howToReach ?? "",
      whoCanSee: whoCanSee ?? "",
      provedBy: provedBy ?? "",
    });
  }
  return rows;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const toPosix = (path: string) => path.split(sep).join("/");

/** Expo Router screens: every .tsx file except layouts, with route groups and `index` removed. */
export function memberRoutes(appDir: string): string[] {
  return filesUnder(appDir)
    .map((file) => toPosix(relative(appDir, file)))
    .filter((file) => file.endsWith(".tsx") && !file.endsWith("_layout.tsx"))
    .map((file) => {
      const parts = file
        .replace(/\.tsx$/, "")
        .split("/")
        .filter((p) => !/^\(.*\)$/.test(p));
      if (parts.at(-1) === "index") parts.pop();
      return `/${parts.join("/")}`;
    })
    .sort();
}

/** Next.js App Router pages: every folder holding a page.tsx. */
export function adminRoutes(appDir: string): string[] {
  return filesUnder(appDir)
    .map((file) => toPosix(relative(appDir, file)))
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"))
    .map((file) => `/${file.replace(/\/?page\.tsx$/, "")}`)
    .sort();
}

export function readFeatureMap(repoRoot: string): FeatureRow[] {
  return parseFeatureMap(readFileSync(join(repoRoot, "docs", "feature-map.md"), "utf8"));
}
