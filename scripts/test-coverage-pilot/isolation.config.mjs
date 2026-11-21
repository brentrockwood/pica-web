import { resolve } from "node:path";
import { coverageConfigDefaults, defineConfig } from "vitest/config";
import base from "../../vitest.config.ts";

const output = process.env.ISOLATION_OUTPUT;
if (!output || !process.env.ISOLATION_FILE) throw new Error("Use isolation-experiment.py to supply a fresh job directory and test file");
export default defineConfig({
  ...base,
  cacheDir: resolve(output, "vite-cache"),
  test: {
    ...base.test,
    include: [process.env.ISOLATION_FILE],
    pool: "forks",
    isolate: true,
    maxWorkers: 1,
    includeTaskLocation: true,
    setupFiles: process.env.ISOLATION_TRACKED === "1" ? [resolve("scripts/test-coverage-pilot/main-context.mjs")] : [],
    coverage: {
      enabled: true,
      provider: "istanbul",
      exclude: [...coverageConfigDefaults.exclude, "scripts/test-coverage-pilot/*.mjs", ".analysis/**", "**/*.testSupport.*"],
      reporter: ["json"],
      reportsDirectory: resolve(output, "aggregate"),
    },
    reporters: ["json", resolve("scripts/test-coverage-pilot/selection-reporter.mjs")],
    outputFile: { json: resolve(output, "tests.json") },
  },
});
