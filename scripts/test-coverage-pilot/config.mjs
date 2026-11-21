import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { coverageConfigDefaults, defineConfig } from "vitest/config";
import base from "../../vitest.config.ts";

const collect = process.env.PER_TEST_COLLECT === "1";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: process.env.PER_TEST_SELECTION
      ? JSON.parse(readFileSync(process.env.PER_TEST_SELECTION, "utf8"))
      : process.env.PER_TEST_FIXTURE === "1"
      ? ["scripts/test-coverage-pilot/fixtures/control.spec.ts"]
      : [
          "src/server/sessions/sessionSearch.test.ts",
          "src/server/sessiond/sessionSearchRoutes.test.ts",
          "src/client/src/components/SessionSearchDialog.test.ts",
        ],
    pool: "forks",
    isolate: true,
    includeTaskLocation: true,
    maxWorkers: Number(process.env.PER_TEST_WORKERS ?? 1),
    ...(collect ? { runner: resolve("scripts/test-coverage-pilot/runner.mjs") } : {}),
    coverage: {
      enabled: collect,
      provider: "istanbul",
      exclude: [...coverageConfigDefaults.exclude, "scripts/test-coverage-pilot/*.mjs", ".analysis/**", "**/*.testSupport.*"],
      reporter: ["json"],
      reportsDirectory: `${process.env.PER_TEST_OUTPUT}/aggregate`,
      reportOnFailure: true,
    },
    reporters: ["default", "json"],
    outputFile: { json: `${process.env.PER_TEST_OUTPUT}/tests.json` },
  },
});
