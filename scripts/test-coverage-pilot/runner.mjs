import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { TestRunner } from "vitest";

// A lazy-import test may start before Vitest 5.0.4's Istanbul store exists.
const snapshot = () => structuredClone(globalThis.__VITEST_COVERAGE__ ?? {});

function difference(after, before) {
  for (const path of Object.keys(before)) {
    if (!(path in after)) throw new Error(`Coverage file disappeared: ${path}`);
  }
  const result = structuredClone(after);
  for (const [path, file] of Object.entries(result)) {
    const previous = before[path];
    if (previous && previous.hash !== file.hash) throw new Error(`Coverage identity changed: ${path}`);
    for (const metric of ["s", "f", "b"]) {
      for (const key of Object.keys(file[metric])) {
        const subtract = (count, old = 0) => {
          if (count < old) throw new Error(`Coverage counters reset: ${path}`);
          return count - old;
        };
        file[metric][key] = metric === "b"
          ? file.b[key].map((count, index) => subtract(count, previous?.b[key]?.[index]))
          : subtract(file[metric][key], previous?.[metric][key]);
      }
    }
  }
  return result;
}

export default class CoverageRunner extends TestRunner {
  async onBeforeRunTask(test) {
    await super.onBeforeRunTask(test);
    if (!["run", "queued"].includes(test.mode)) return;
    if (test.concurrent || this.active) throw new Error("Per-test coverage requires sequential tests within each worker");
    if (test.repeats || test.retry) throw new Error("Retries/repeats are outside this pilot's attribution contract");
    this.active = { id: test.id, before: snapshot() };
  }

  async runTask(test) {
    if (this.active?.id !== test.id) throw new Error("Coverage task identity mismatch");
    this.active.bodyStart = snapshot();
    try {
      await TestRunner.getTestFn(test)();
    } finally {
      this.active.bodyEnd = snapshot();
    }
  }

  onAfterRetryTask(test) {
    // Runtime skips bypass onAfterRunTask in Vitest 5.0.4.
    if (this.active?.id === test.id && (test.result?.pending || test.result?.state === "skip")) {
      this.active = undefined;
    }
  }

  onAfterRunTask(test) {
    const active = this.active;
    if (active?.id !== test.id) throw new Error("Coverage task identity mismatch");
    const end = snapshot();
    const names = [];
    for (let task = test; task && task !== test.file; task = task.suite) names.unshift(task.name);
    const bodyStart = active.bodyStart ?? end;
    const bodyEnd = active.bodyEnd ?? end;
    const record = {
      id: test.id,
      file: relative(this.config.root, test.file.filepath),
      names,
      location: test.location,
      // Vitest 5.0.4 keeps the resolved per-file environment on worker state, not config.
      environment: this.workerState.environment.name,
      pool: this.pool,
      state: test.result?.state,
      durationMs: test.result?.duration,
      bodyExecuted: Boolean(active.bodyStart),
      phases: {
        setup: difference(bodyStart, active.before),
        body: difference(bodyEnd, bodyStart),
        teardown: difference(end, bodyEnd),
      },
    };
    writeFileSync(`${process.env.PER_TEST_OUTPUT}/${test.id}.json`, JSON.stringify(record));
    this.active = undefined;
    super.onAfterRunTask(test);
  }
}
