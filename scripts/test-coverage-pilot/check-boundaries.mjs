import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = process.argv[2];
const load = async (name) => JSON.parse(await readFile(`${root}/${name}/evidence.json`, "utf8"));
const first = await load("controls-r1");
const second = await load("controls-r2");
const withoutTimes = (evidence) => ({ ...evidence, tests: evidence.tests.map(({ durationMs, ...test }) => test) });
assert.deepEqual(withoutTimes(first), withoutTimes(second));
const test = (evidence, title) => evidence.tests.find((record) => record.names.at(-1) === title);
const functions = (evidence, record) => record.phases.body.map((id) => evidence.locations[id]).filter((loc) => loc.kind === "function").map((loc) => loc.name);
assert(!functions(first, test(first, "A schedules background work without waiting")).includes("backgroundOnly"));
assert(functions(first, test(first, "B waits for work started by A")).includes("backgroundOnly"));
const isolatedBackground = await load("control-isolated-background");
assert.equal(test(isolatedBackground, "B waits for work started by A").phases.body.length, 0);
assert(!functions(first, test(first, "second cache consumer")).includes("fillCache"));
const isolatedCache = await load("control-isolated-cache");
assert(functions(isolatedCache, test(isolatedCache, "second cache consumer")).includes("fillCache"));
assert(functions(first, test(first, "executes a reloaded module")).includes("fillCache"));
assert(functions(first, test(first, "allows the first instrumented import inside the test body")).includes("choose"));
for (const title of ["verifies a child process without observing its coverage", "verifies a worker thread without observing its coverage"]) {
  const record = test(first, title);
  assert.equal(record.state, "pass");
  assert.equal(record.phases.body.length, 0);
}
console.log("Boundary controls verified: repeatable cross-test attribution, cache ownership shifts, module reload, lazy import, child/worker blind spots.");
