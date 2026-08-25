import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const { CI } = process.env;
// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for process.env index signatures.
const reuseStaticExport = process.env["PLAYWRIGHT_REUSE_BUILD"] === "true";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(CI),
  retries: CI ? 2 : 0,
  ...(CI ? { workers: 1 } : {}),
  reporter: CI
    ? [["github"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/playwright-junit.xml" }]]
    : "list",
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `${reuseStaticExport ? "" : "npm run build && "}npm run preview -- --listen ${port}`,
    port,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
