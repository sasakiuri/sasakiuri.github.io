import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      exclude: ["src/**/*.test.{ts,tsx}"],
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
    restoreMocks: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
