import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Loads GOOGLE_*, ADMIN_PASSWORD, etc. into process.env so both the
// webServer it spawns and the tests themselves see the real config.
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, ".env.local") });

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./playwright-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  // Next.js dev mode compiles each route on-demand on its first hit, which can
  // take several seconds — well past Playwright's 5s default. The real app and
  // its Sheets round-trips are otherwise fast; this just absorbs cold starts.
  expect: { timeout: 15_000 },
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: process.env as Record<string, string>,
  },
});
