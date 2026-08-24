const config = {
  concurrency: 4,
  packageManager: "pnpm",
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["progress", "clear-text", "html"],
  mutate: ["src/components/external-link/external-link.tsx", "src/config/https-url-schema.ts"],
  thresholds: {
    break: 95,
    high: 100,
    low: 95,
  },
  vitest: {
    configFile: "vitest.config.ts",
    related: false,
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
  tempDirName: "node_modules/.stryker-tmp",
  htmlReporter: {
    fileName: "stryker/index.html",
  },
  timeoutMS: 20_000,
};

export default config;
