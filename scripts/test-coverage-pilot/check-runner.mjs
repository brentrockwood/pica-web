import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packagePath = fileURLToPath(import.meta.resolve("vitest/package.json"));
const cli = resolve(dirname(packagePath), JSON.parse(readFileSync(packagePath, "utf8")).bin.vitest);
const runner = join(here, "runner.mjs");
// Keep fixtures under the checkout so their Vitest import uses the installed package.
const directory = mkdtempSync(join(here, ".check-runner-"));
try {
  writeFileSync(join(directory, "fixture.test.mjs"), `
import { afterEach, beforeEach, test } from "vitest";
// Controlled counters isolate runner attribution from the optional Istanbul provider.
globalThis.__VITEST_COVERAGE__ = {
  subject: { hash: "stable", s: { 0: 0 }, f: { 0: 0 }, b: { 0: [0, 0] } },
};
function hit() {
  const file = globalThis.__VITEST_COVERAGE__.subject;
  file.s[0]++; file.f[0]++; file.b[0][0]++;
}
beforeEach((ctx) => {
  hit();
  if (ctx.task.name === "setup skip") ctx.skip();
});
afterEach(hit);
if (process.env.RUNNER_CHECK_CONCURRENT === "1") {
  test.concurrent("concurrent", hit);
} else {
  test.skip("static skip", hit);
  test("body skip", (ctx) => { hit(); ctx.skip(); });
  test("pass after body skip", hit);
  test("setup skip", hit);
  test("pass after setup skip", hit);
  test("ordinary failure", () => { hit(); throw new Error("intentional body failure"); });
  test("pass after failure", hit);
}
`);
  const config = join(directory, "config.mjs");
  writeFileSync(config, `export default ${JSON.stringify({ test: {
    root: directory, include: ["fixture.test.mjs"], runner,
    pool: "forks", maxWorkers: 1, includeTaskLocation: true,
    reporters: ["json"], outputFile: join(directory, "tests.json"),
  } })};\n`);
  for (const concurrent of [false, true]) {
    const output = join(directory, concurrent ? "concurrent" : "sequential");
    mkdirSync(output);
    const result = spawnSync(process.execPath, [cli, "run", "--config", config], {
      cwd: resolve(here, "../.."), encoding: "utf8", timeout: 60_000,
      env: { ...process.env, PER_TEST_OUTPUT: output, RUNNER_CHECK_CONCURRENT: concurrent ? "1" : "0" },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, `Expected intentional rejection/failure, not a successful suite:\n${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(readFileSync(join(directory, "tests.json"), "utf8"));
    const results = report.testResults.flatMap((file) => file.assertionResults);
    const records = readdirSync(output).map((file) => JSON.parse(readFileSync(join(output, file), "utf8")));
    if (concurrent) {
      assert.match(JSON.stringify(report) + result.stderr, /Per-test coverage requires sequential tests within each worker/);
      assert.equal(records.length, 0);
      continue;
    }
    const statuses = Object.fromEntries(results.map((test) => [test.title, test.status]));
    assert.deepEqual(statuses, {
      "static skip": "skipped", "body skip": "skipped", "pass after body skip": "passed",
      "setup skip": "skipped", "pass after setup skip": "passed",
      "ordinary failure": "failed", "pass after failure": "passed",
    }, JSON.stringify(report) + result.stdout + result.stderr);
    assert.equal(records.length, 4, "Only completed, non-skipped tests emit records");
    for (const record of records) {
      assert.equal(record.state, record.names.at(-1) === "ordinary failure" ? "fail" : "pass");
      assert.equal(record.file, "fixture.test.mjs");
      assert.equal(record.environment, "node");
      assert.equal(record.pool, "forks");
      assert.equal(record.bodyExecuted, true);
      for (const phase of ["setup", "body", "teardown"]) {
        assert.deepEqual(record.phases[phase].subject, {
          hash: "stable", s: { 0: 1 }, f: { 0: 1 }, b: { 0: [1, 0] },
        });
      }
    }
  }
  console.log("Runner checks passed: runtime skips, sequential recovery, ordinary records and concurrent rejection.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
