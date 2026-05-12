import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test configuration. Used post-deploy by the CI to validate that the
 * deployed environment (staging or production) is alive and reachable.
 *
 * - No webServer: tests run against an externally deployed URL provided via
 *   PLAYWRIGHT_BASE_URL (e.g. https://pokemarket-staging.vercel.app).
 * - Only runs specs under e2e/smoke/.
 */
export default defineConfig({
  testDir: "./e2e/smoke",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-smoke" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    extraHTTPHeaders: process.env.VERCEL_PROTECTION_BYPASS
      ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
