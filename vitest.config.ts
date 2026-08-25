import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const { CI } = process.env;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      exclude: ["src/**/*.stories.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
      include: ["src/components/**/*.{ts,tsx}", "src/config/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    passWithNoTests: false,
    reporters: CI ? ["default", ["junit", { outputFile: "reports/vitest-junit.xml" }]] : ["default"],
    restoreMocks: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
