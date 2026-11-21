import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const directory = process.argv[2];
const evidence = JSON.parse(await readFile(`${directory}/evidence.json`, "utf8"));
assert.equal(evidence.tests.length, 4);
assert.equal(evidence.skipped, 1);
const functions = (test, phase) => test.phases[phase].map((id) => evidence.locations[id]).filter((loc) => loc.kind === "function").map((loc) => loc.name).sort();
for (const test of evidence.tests) {
  assert.equal(test.environment, "node");
  assert.deepEqual(functions(test, "setup"), ["setupOnly"]);
  assert.deepEqual(functions(test, "teardown"), ["teardownOnly"]);
  assert(!functions(test, "body").includes("importOnly"));
}
const named = (name) => evidence.tests.find((test) => test.names.join(" ") === name);
assert.deepEqual(functions(named("chooses left"), "body"), ["choose"]);
assert.deepEqual(functions(named("awaits asynchronous work"), "body"), ["asynchronous"]);
assert.deepEqual(functions(named("records thrown test bodies"), "body"), ["throws"]);
const branches = (name) => named(name).phases.body.filter((id) => evidence.locations[id].kind === "branch");
assert.notDeepEqual(branches("chooses left"), branches("chooses right"));
const choose = named("chooses left").phases.body.map((id) => evidence.locations[id]).find((loc) => loc.kind === "function");
assert.equal(choose.location.start.line, 8, "Source-map remapping must restore original TypeScript lines");
const aggregate = JSON.parse(await readFile(`${directory}/aggregate/coverage-final.json`, "utf8"));
const subject = Object.entries(aggregate).find(([path]) => path.endsWith("/fixtures/subject.ts"))[1];
const importKey = Object.keys(subject.fnMap).find((key) => subject.fnMap[key].name === "importOnly");
assert(subject.f[importKey] > 0, "Import-time execution must exist in aggregate coverage but not a test phase");
console.log("Collector controls passed: phase separation, imports, parameters, branches, async, throws, skips, TypeScript coordinates.");
