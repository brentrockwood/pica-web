import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const directory = process.argv[2];
const runs = (await readdir(directory)).filter((name) => name.startsWith("coverage-")).sort();
assert.equal(runs.length, 6, "Expected two collections at each of 1, 2, and 3 workers");
let first;
for (const run of runs) {
  const evidence = JSON.parse(await readFile(`${directory}/${run}/evidence.json`, "utf8"));
  assert.equal(evidence.tests.length, 9);
  assert.equal(evidence.skipped, 0);
  for (const test of evidence.tests) {
    assert.equal(test.environment, test.file.includes("/client/") ? "happy-dom" : "node");
  }
  const stable = { ...evidence, tests: evidence.tests.map(({ durationMs, ...test }) => test) };
  first ??= stable;
  assert.deepEqual(stable, first, `${run}: unstable attribution`);
}
console.log(`Identical source hashes, test identities, and phase-specific locations across ${runs.length} collections.`);
