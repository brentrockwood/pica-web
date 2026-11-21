import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nativeStatementLines, validateV8Counters } from "./native-statement-lines.mjs";

const tools = createRequire(resolve(".analysis/tools/package.json"));
const converterTools = createRequire(resolve(".analysis/converter/package.json"));
const v8ToIstanbul = converterTools("v8-to-istanbul");
const { createCoverageMap } = await import(pathToFileURL(tools.resolve("@vitest/istanbul-lib-coverage")));
const { createInstrumenter } = await import(pathToFileURL(tools.resolve("@vitest/istanbul-lib-instrument")));
const root = process.cwd();
const directory = resolve(process.argv[2]);
await rm(`${directory}/unified.json`, { force: true });
const sourceHashes = JSON.parse(await readFile(process.argv[3], "utf8"));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
let transforms = {};
try { transforms = await readJson(resolve(dirname(process.argv[3]), "transforms.json")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const { case: selected, exitCode, launchAudit = "none", nodeExecutable } = await readJson(`${directory}/case.json`);
const report = await readJson(`${directory}/tests.json`);
assert.equal(exitCode, 0);
assert.equal(report.success, true);
assert.equal(report.testResults.flatMap(file => file.assertionResults).filter(test => test.title === selected.title).length, 1, "Ambiguous or missing selected title");
const passed = report.testResults.flatMap((file) => file.assertionResults.filter((test) => test.status === "passed").map((test) => ({ file: relative(root, file.name), ...test })));
assert.equal(passed.length, 1, "Exactly one executed test is required");
assert.equal(passed[0].file, selected.file);
assert.equal(passed[0].title, selected.title);
const primary = await readJson(`${directory}/aggregate/coverage-final.json`);
// Validate before Istanbul can turn a missing counter into an unexecuted line.
for (const [file, coverage] of Object.entries(primary)) {
  assert(coverage.statementMap && coverage.s && typeof coverage.statementMap === "object" && typeof coverage.s === "object"
    && !Array.isArray(coverage.statementMap) && !Array.isArray(coverage.s),
    `Missing Istanbul statement counters: ${file}`);
  assert.deepEqual(Object.keys(coverage.s).sort(), Object.keys(coverage.statementMap).sort(),
    `Istanbul statement/count keys differ: ${file}`);
  for (const [key, count] of Object.entries(coverage.s)) {
    assert(typeof count === "number" && Number.isFinite(count) && count >= 0,
      `Invalid Istanbul statement count: ${file}:${key}`);
  }
}
const problems = [];
const sources = {};
const textCache = new Map();
const canonicalLines = new Map();
const lines = {};
const nativeObserved = new Set();
const contexts = new Map();
const nativeByContext = new Map();
const launches = [];
const workerLaunches = [];
const issue = (kind, details) => problems.push({ kind, ...details });

async function source(absolute) {
  const file = relative(root, absolute);
  assert(Object.hasOwn(sourceHashes, file), `Source missing from pre-run manifest: ${file}`);
  if (!textCache.has(file)) {
    const bytes = await readFile(absolute);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash, sourceHashes[file], `Source changed since collection: ${file}`);
    textCache.set(file, bytes.toString("utf8"));
    sources[file] = hash;
  }
  return { file, text: textCache.get(file) };
}

async function addCoverage(coverage, origin, native) {
  const map = createCoverageMap(coverage);
  for (const absolute of map.files()) {
    const { file, text } = await source(absolute);
    if (!canonicalLines.has(file)) {
      let definitions = primary[absolute];
      if (!definitions) {
        assert(/\.(?:[cm]?js|ts)$/.test(file), `Native-only source requires a supported parser: ${file}`);
        const instrumenter = createInstrumenter({ esModules: true, ...(file.endsWith(".ts") ? { parserPlugins: ["typescript"] } : {}) });
        instrumenter.instrumentSync(text, absolute);
        definitions = instrumenter.lastFileCoverage();
      }
      canonicalLines.set(file, Object.values(definitions.statementMap));
    }
    const statements = canonicalLines.get(file);
    const observed = native
      ? nativeStatementLines(native.text, native.functions, statements, native.sourceMap)
      : new Set(Object.entries(map.fileCoverageFor(absolute).getLineCoverage()).filter(([, count]) => count > 0).map(([line]) => Number(line)));
    const executable = new Set(statements.map(location => location.start.line));
    for (const line of observed) {
      if (!executable.has(line)) continue;
      const id = `${file}:${line}`;
      lines[id] ??= { file, line: Number(line), origins: [] };
      lines[id].origins.push(origin);
      if (native) nativeObserved.add(file);
    }
  }
}

await source(resolve(root, selected.file));
for (const name of (await readdir(`${directory}/contexts`)).filter((name) => name.endsWith(".json")).sort()) {
  const context = await readJson(`${directory}/contexts/${name}`);
  context.artifact = `contexts/${name}`;
  try { context.exit = await readJson(`${directory}/contexts/${name}.exit`); }
  catch (error) {
    if (error instanceof SyntaxError) context.exitReceiptError = "Malformed exit receipt";
    else if (error.code !== "ENOENT") throw error;
  }
  contexts.set(`${context.pid}-${context.threadId}`, context);
}
if (launchAudit === "strace-execve") {
  const files = (await readdir(directory)).filter((name) => /^execve\.\d+$/.test(name));
  assert(files.length, "Missing OS launch audit");
  for (const name of files) {
    for (const line of (await readFile(`${directory}/${name}`, "utf8")).split("\n")) {
      if (!/= 0$/.test(line)) continue;
      const match = /^execve\(("(?:[^"\\]|\\.)*"),/.exec(line);
      if (!match) { issue("unparsed-successful-exec", { artifact: name, line }); continue; }
      const executable = JSON.parse(match[1]);
      const pid = Number(name.slice("execve.".length));
      let isNode = false;
      try { isNode = await realpath(executable) === nodeExecutable; }
      catch { issue("unresolved-executable", { executable, pid }); }
      launches.push({ executable, pid, isNode });
      if (isNode && !contexts.has(`${pid}-0`)) issue("node-launch-unregistered", { executable, pid });
    }
  }
  assert(launches.some((launch) => launch.isNode), "Audit contains no successful Node launch");
  for (const pid of new Set(launches.filter((launch) => launch.isNode).map((launch) => launch.pid))) {
    if (launches.filter((launch) => launch.isNode && launch.pid === pid).length > 1) issue("node-reexec-unmapped", { pid });
  }
}
const workers = [...contexts.values()].filter((context) => context.role === "test-worker");
assert.equal(workers.length, 1, "Expected exactly one registered main test worker");
const mainWorker = workers[0];
let mainNativeLoads;
try { mainNativeLoads = await readJson(`${directory}/${mainWorker.artifact}.loads`); }
catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
const mainLoadAuditEnabled = mainWorker.nativeModuleLoadAudit === "sync-load-hook-v1" && Array.isArray(mainNativeLoads);
if (!mainLoadAuditEnabled) {
  issue("main-native-load-audit-missing", { context: `${mainWorker.pid}-${mainWorker.threadId}` });
} else {
  for (const url of mainNativeLoads) {
    const file = relative(root, fileURLToPath(url));
    if (file.startsWith("scripts/test-coverage-pilot/") && !file.startsWith("scripts/test-coverage-pilot/fixtures/")) continue;
    if (/\.(?:test|spec|testSupport)\.[cm]?[jt]s$/.test(file)) continue;
    if (/^(?:src|pi-packages|pi-web-plugins|scripts|extensions|\.analysis)\//.test(file) && !file.startsWith(".analysis/tools/") && !file.startsWith(".analysis/converter/")) {
      issue("main-native-project-load", { file, artifact: `${mainWorker.artifact}.loads`,
        reason: "Project module loaded by Node outside Vitest's Istanbul transform; main-worker native coverage is unavailable" });
    }
  }
}
await addCoverage(primary, { provider: "istanbul", artifact: "aggregate/coverage-final.json", context: `${workers[0].pid}-${workers[0].threadId}` });

for (const name of (await readdir(`${directory}/native`)).filter((name) => name.endsWith(".json")).sort()) {
  const match = /^coverage-(\d+)-(\d+)-(\d+)\.json$/.exec(name);
  if (!match) { issue("unknown-native-report-name", { artifact: name }); continue; }
  const key = `${match[1]}-${match[3]}`;
  const context = contexts.get(key);
  nativeByContext.set(key, (nativeByContext.get(key) ?? 0) + 1);
  if (context?.role === "runner" || context?.role === "test-worker") continue;
  if (!context) issue("unregistered-native-context", { context: key, artifact: name });
  const raw = await readJson(`${directory}/native/${name}`);
  for (const script of raw.result) {
    if (!script.url.startsWith("file:")) continue;
    const url = new URL(script.url);
    const absolute = fileURLToPath(url);
    const file = relative(root, absolute);
    if (file.startsWith("scripts/test-coverage-pilot/") && !file.startsWith("scripts/test-coverage-pilot/fixtures/")) continue;
    if (!Object.hasOwn(sourceHashes, file)) {
      if (file.startsWith(".analysis/")) issue("unregistered-generated-source", { file, artifact: name });
      else if (/^(?:src|pi-packages|pi-web-plugins|scripts|extensions)\//.test(file)) issue("unregistered-project-source", { file, artifact: name });
      continue;
    }
    if (/\.(?:test|spec|testSupport)\.[cm]?[jt]s$/.test(file)) continue;
    try {
      assert(!url.search && !url.hash, "Transformed/query-bearing script URL needs explicit mapping");
      assert(/\.[cm]?js$/.test(file), "Native script must be JavaScript; direct TypeScript loaders are not supported");
      const { text } = await source(absolute);
      const transform = transforms[file];
      let sourceMap;
      if (transform) {
        const { compile, compilerVersion } = await import("./mapped-transform.mjs");
        assert.equal(transform.compilerVersion, compilerVersion, "Compiler identity mismatch");
        const original = await source(resolve(root, transform.original));
        const map = await source(resolve(root, transform.map));
        assert.equal(sources[file], transform.generatedHash, "Generated code hash mismatch");
        assert.equal(sources[transform.original], transform.originalHash, "Original source hash mismatch");
        assert.equal(sources[transform.map], transform.mapHash, "Source map hash mismatch");
        // Only the fixed, reproducible single-source compiler path is supported.
        const rebuilt = compile(transform.original, original.text);
        assert(text === rebuilt.outputText, "Generated code differs from deterministic rebuild");
        assert(map.text === rebuilt.sourceMapText, "Source map differs from deterministic rebuild");
        sourceMap = { sourcemap: JSON.parse(map.text) };
        assert.equal(sourceMap.sourcemap.sources.length, 1, "Only single-source transforms are supported");
      } else assert(!/sourceMappingURL\s*=/.test(text), "Native source maps require a registered transform");
      validateV8Counters(script.functions);
      const converter = v8ToIstanbul(absolute, 0, { source: text, ...(sourceMap ? { sourceMap } : {}) });
      await converter.load();
      converter.applyCoverage(script.functions);
      try {
        await addCoverage(converter.toIstanbul(), { provider: "v8", artifact: `native/${name}`, context: key, ...(transform ? { generated: file, sourceMap: transform.map, compilerVersion: transform.compilerVersion } : {}) }, { text, functions: script.functions, sourceMap: sourceMap?.sourcemap });
      } finally { converter.destroy(); }
    } catch (error) {
      issue("unmapped-native-source", { file, artifact: name, reason: error.message });
    }
  }
}
for (const [key, context] of contexts) {
  if (context.role !== "descendant") continue;
  if (!context.exit) issue("descendant-exit-unconfirmed", { context: key });
  if (!nativeByContext.has(key)) issue("descendant-report-missing", { context: key });
}
const workerAuditEnabled = workers[0].workerCreationAudit === "process-worker-event-v1";
if (workerAuditEnabled) {
  for (const [key, context] of contexts) {
    if (context.workerCreationAudit !== "process-worker-event-v1") issue("worker-parent-audit-missing", { context: key });
  }
  let names = [];
  try { names = await readdir(`${directory}/workers`); }
  catch (error) {
    if (error.code === "ENOENT") issue("worker-audit-missing", {});
    else throw error;
  }
  for (const name of names.filter((name) => name.endsWith(".json")).sort()) {
    const record = await readJson(`${directory}/workers/${name}`);
    if (name.startsWith("audit-removed-")) { issue("worker-audit-removed", record); continue; }
    const key = `${record.pid}-${record.threadId}`;
    record.artifact = `workers/${name}`;
    try { record.exit = await readJson(`${directory}/workers/${name}.exit`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    workerLaunches.push(record);
    if (!contexts.has(key)) issue("worker-launch-unregistered", { context: key });
    if (!record.exit) issue("worker-exit-unconfirmed", { context: key });
    // shortcut: reject nonzero exits until graceful error exits can be distinguished from forced stops.
    else if (record.exit.code !== 0) issue("worker-nonzero-exit", { context: key, code: record.exit.code });
    if (!nativeByContext.has(key)) issue("worker-report-missing", { context: key });
    if (!contexts.has(`${record.pid}-${record.parentThreadId}`)) issue("worker-parent-unregistered", { context: key });
  }
  for (const [key, context] of contexts) {
    if (context.threadId > 0 && !workerLaunches.some((worker) => `${worker.pid}-${worker.threadId}` === key)) {
      issue("worker-launch-record-missing", { context: key });
    }
  }
}
for (const file of selected.expectedNativeSources ?? []) {
  if (!nativeObserved.has(file)) issue("expected-native-execution-missing", { file });
}
const output = {
  schema: 1,
  test: { key: selected.key, file: selected.file, title: selected.title, fullName: passed[0].fullName, location: passed[0].location },
  granularity: "original-source executable statement-start lines; any observed execution, not assertion coverage",
  completeness: {
    status: problems.length ? "incomplete" : "scope-complete", problems,
    boundary: "Vitest lifecycle aggregate with main-worker native load audit; Node launch and parent-side worker audits when enabled; registered descendant coverage and closure",
    mainProjectLoadAudit: mainLoadAuditEnabled ? "node-sync-load-hook-v1" : "unavailable",
    exhaustiveDescendantDiscovery: false,
    nodeProcessLaunchAudit: launchAudit,
    workerCreationAudit: workerAuditEnabled ? "parent-process-worker-event-v1" : "unavailable",
    caveat: "OS audit checks the selected Node executable. Worker launch auditing requires an instrumented parent; other runtimes, arbitrary late work and deliberate instrumentation bypass are not proven complete.",
  },
  sources,
  contexts: [...contexts.values()],
  launches,
  workerLaunches,
  lines: Object.values(lines).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
};
await writeFile(`${directory}/unified.json.tmp`, `${JSON.stringify(output)}\n`);
await rename(`${directory}/unified.json.tmp`, `${directory}/unified.json`);
console.log(JSON.stringify({ case: selected.key, status: output.completeness.status, lines: output.lines.length, problems }));
if (problems.length) process.exitCode = 2;
