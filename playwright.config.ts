import { defineConfig, devices } from "@playwright/test";

const memberUrl = process.env.MEMBER_URL ?? "http://localhost:8081";
const adminUrl = process.env.ADMIN_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  projects: [
    { name: "member", testMatch: /member\..*spec\.ts/, use: { baseURL: memberUrl } },
    { name: "admin", testMatch: /admin\..*spec\.ts/, use: { baseURL: adminUrl } },
  ],
  webServer: [
    {
      command: `pnpm --filter @kingdom-connect/member exec expo start --web --port ${new URL(memberUrl).port}`,
      url: memberUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { CI: "1" },
    },
    {
      command: process.env.CI
        ? `pnpm --filter @kingdom-connect/admin build && pnpm --filter @kingdom-connect/admin start --port ${new URL(adminUrl).port}`
        : `pnpm --filter @kingdom-connect/admin dev --port ${new URL(adminUrl).port}`,
      url: adminUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
