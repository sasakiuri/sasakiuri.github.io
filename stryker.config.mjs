const config = {
  concurrency: 4,
  packageManager: "pnpm",
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["progress", "clear-text", "html", "json"],
  mutate: ["src/components/external-link/external-link.tsx", "src/config/https-url-schema.ts"],
  thresholds: {
    break: 95,
    high: 100,
    low: 95,
  },
  vitest: {
    configFile: "vitest.config.ts",
    // The mutation targets are imported directly by their unit and integration tests.
    related: true,
  },
  ignorePatterns: [
    ".next",
    "coverage",
    "out",
    "playwright-report",
    "reports",
    "storybook-static",
    "stryker",
    "test-results",
    "tests/e2e",
  ],
  // Vitest must transform sandbox modules so their native-module mocks apply.
  tempDirName: ".stryker-tmp",
  jsonReporter: {
    fileName: "stryker/mutation.json",
  },
  htmlReporter: {
    fileName: "stryker/index.html",
  },
  timeoutMS: 20_000,
};

export default config;
