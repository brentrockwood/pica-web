const { mkdirSync, renameSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { registerHooks } = require("node:module");
const { isMainThread, threadId } = require("node:worker_threads");

const directory = process.env.COVERAGE_JOB_DIR;
if (!directory) throw new Error("Coverage context hook requires COVERAGE_JOB_DIR");
mkdirSync(join(directory, "contexts"), { recursive: true });
const path = join(directory, "contexts", `${process.pid}-${threadId}.json`);
const context = {
  pid: process.pid, parentPid: process.ppid, threadId, isMainThread,
  role: isMainThread && process.argv[1]?.endsWith("/vitest/vitest.mjs") ? "runner" : "descendant",
  started: Date.now(), nativeCoverage: process.env.NODE_V8_COVERAGE ?? null,
  workerCreationAudit: "process-worker-event-v1",
  nativeModuleLoadAudit: "sync-load-hook-v1",
};
function writeAtomic(target, value) {
  writeFileSync(`${target}.tmp`, JSON.stringify(value));
  renameSync(`${target}.tmp`, target);
}
writeAtomic(path, context);
const nativeModuleLoads = new Set();
writeAtomic(`${path}.loads`, []);
// Vitest transforms bypass Node's loader; native project loads have no Istanbul attribution.
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.startsWith("file:") && !nativeModuleLoads.has(url)) {
      nativeModuleLoads.add(url);
      // Vitest can terminate the main worker without an exit event.
      writeAtomic(`${path}.loads`, [...nativeModuleLoads].sort());
    }
    return result;
  },
});
mkdirSync(join(directory, "workers"), { recursive: true });
function recordWorker(worker) {
  const childThreadId = worker.threadId;
  const target = join(directory, "workers", `${process.pid}-${childThreadId}.json`);
  writeAtomic(target, { pid: process.pid, parentThreadId: threadId, threadId: childThreadId, created: Date.now() });
  worker.once("exit", (code) => writeAtomic(`${target}.exit`, { code, ended: Date.now() }));
}
process.on("worker", recordWorker);
process.on("removeListener", (event, listener) => {
  if (event === "worker" && listener === recordWorker) {
    writeAtomic(join(directory, "workers", `audit-removed-${process.pid}-${threadId}.json`), { pid: process.pid, threadId });
  }
});
process.once("exit", (code) => {
  writeAtomic(`${path}.exit`, { code, ended: Date.now() });
});
