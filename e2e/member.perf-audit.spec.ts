import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

const OUT = process.env.PERF_OUT;
const BASE = process.env.PERF_BASE ?? "http://localhost:8090";
test.skip(!OUT, "set PERF_OUT to run the speed audit");
test.use({ baseURL: BASE, viewport: { width: 390, height: 844 } });
test.setTimeout(600_000);

type Row = Record<string, string | number>;
const rows: Row[] = [];

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return cdp;
}

function track(page: Page) {
  const seen = { requests: 0, bytes: 0, api: 0, apiMs: [] as number[] };
  page.on("requestfinished", async (req) => {
    seen.requests++;
    const sizes = await req.sizes().catch(() => null);
    if (sizes) seen.bytes += sizes.responseBodySize + sizes.responseHeadersSize;
    if (req.url().includes(":54321")) {
      seen.api++;
      const t = req.timing();
      seen.apiMs.push(Math.round(t.responseEnd));
    }
  });
  return seen;
}

async function measure(
  page: Page,
  label: string,
  go: () => Promise<void>,
  ready: () => Promise<void>,
) {
  const seen = track(page);
  const start = Date.now();
  await go();
  await ready();
  const usable = Date.now() - start;
  await page.waitForTimeout(1500);
  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    return new Promise<{ fcp: number; lcp: number }>((resolve) => {
      let lcp = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) lcp = Math.max(lcp, e.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => resolve({ fcp: Math.round(fcp), lcp: Math.round(lcp) }), 200);
    });
  });
  rows.push({
    page: label,
    usable_ms: usable,
    fcp_ms: paint.fcp,
    lcp_ms: paint.lcp,
    requests: seen.requests,
    kb: Math.round(seen.bytes / 1024),
    api_calls: seen.api,
    slowest_api_ms: Math.max(0, ...seen.apiMs),
  });
}

test("member app speed on a throttled phone", async ({ page, browser }) => {
  await throttle(page);
  await measure(
    page,
    "welcome (first visit, empty cache)",
    () => page.goto("/welcome").then(() => undefined),
    () =>
      expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible({ timeout: 120_000 }),
  );

  const signedIn = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await signInAs(signedIn, "test_level3", "test.level3@example.test");
  await throttle(signedIn);
  const routes: [string, string, () => Promise<void>][] = [
    [
      "home",
      "/",
      () => expect(signedIn.getByRole("heading").first()).toBeVisible({ timeout: 120_000 }),
    ],
    [
      "opportunities",
      "/opportunities",
      () =>
        expect(signedIn.getByRole("heading", { name: "Opportunities" }).first()).toBeVisible({
          timeout: 120_000,
        }),
    ],
    [
      "people",
      "/people",
      () => expect(signedIn.getByRole("heading").first()).toBeVisible({ timeout: 120_000 }),
    ],
    [
      "messages",
      "/messages",
      () => expect(signedIn.getByRole("heading").first()).toBeVisible({ timeout: 120_000 }),
    ],
    [
      "growth",
      "/growth",
      () => expect(signedIn.getByRole("heading").first()).toBeVisible({ timeout: 120_000 }),
    ],
    [
      "notifications",
      "/notifications",
      () => expect(signedIn.getByRole("heading").first()).toBeVisible({ timeout: 120_000 }),
    ],
  ];
  for (const [label, route, ready] of routes) {
    await measure(
      signedIn,
      `${label} (full load, warm cache)`,
      () => signedIn.goto(route).then(() => undefined),
      ready,
    );
  }
  await signedIn.goto("/");
  await signedIn.waitForTimeout(3000);
  const tab = async (name: RegExp, label: string, ready: () => Promise<void>) =>
    measure(
      signedIn,
      `${label} (tap in app)`,
      () => signedIn.getByRole("link", { name }).first().click(),
      ready,
    );
  await tab(/^Opportunities$/, "opportunities", () =>
    expect(signedIn.getByRole("heading", { name: "Opportunities" }).first()).toBeVisible({
      timeout: 60_000,
    }),
  );
  await tab(/^People$/, "people", () =>
    expect(signedIn.getByRole("heading", { name: /People/ }).first()).toBeVisible({
      timeout: 60_000,
    }),
  );

  writeFileSync(OUT!, JSON.stringify(rows, null, 1));
});
