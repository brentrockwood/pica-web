import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requireTools = createRequire(resolve(".analysis/tools/package.json"));
const { createCoverageMap } = await import(pathToFileURL(requireTools.resolve("@vitest/istanbul-lib-coverage")));
const { createSourceMapStore } = await import(pathToFileURL(requireTools.resolve("@vitest/istanbul-lib-source-maps")));
const directory = resolve(process.argv[2]);
const report = JSON.parse(await readFile(`${directory}/tests.json`, "utf8"));
assert.equal(report.success, true, "Only successful test runs produce accepted evidence");
const records = [];
const locations = {};
const sources = {};
const hash = (text) => createHash("sha256").update(text).digest("hex");
for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".json") && !["tests.json", "evidence.json", "metrics.json"].includes(name)).sort()) {
  const raw = JSON.parse(await readFile(`${directory}/${filename}`, "utf8"));
  assert.equal(raw.state, "pass");
  assert.equal(raw.bodyExecuted, true);
  assert.equal(typeof raw.environment, "string", "Missing resolved test environment");
  const phases = {};
  for (const [phase, coverage] of Object.entries(raw.phases)) {
    const mapped = await createSourceMapStore().transformCoverage(createCoverageMap(coverage));
    const hits = new Set();
    for (const absolute of mapped.files()) {
      const file = relative(process.cwd(), absolute);
      assert(!file.startsWith(".."), `Unexpected source outside checkout: ${file}`);
      if (!sources[file]) sources[file] = hash(await readFile(absolute));
      const data = mapped.fileCoverageFor(absolute).toJSON();
      const add = (kind, location, extra = {}) => {
        const entry = { file, kind, location, ...extra };
        const id = hash(JSON.stringify(entry));
        locations[id] = entry;
        hits.add(id);
      };
      for (const [key, count] of Object.entries(data.s)) if (count > 0) add("statement", data.statementMap[key]);
      for (const [key, count] of Object.entries(data.f)) if (count > 0) add("function", data.fnMap[key].loc, { name: data.fnMap[key].name });
      for (const [key, counts] of Object.entries(data.b)) {
        counts.forEach((count, index) => {
          if (count > 0) add("branch", data.branchMap[key].locations[index], { type: data.branchMap[key].type, branchLocation: data.branchMap[key].loc, arm: index });
        });
      }
    }
    phases[phase] = [...hits].sort();
  }
  records.push({ ...raw, phases });
}
const expected = report.testResults.flatMap((file) => file.assertionResults
  .filter((test) => test.status === "passed")
  .map((test) => JSON.stringify([relative(process.cwd(), file.name), test.fullName, test.location])));
assert(records.length > 0, "No executed tests: empty evidence is not a successful collection");
assert.equal(new Set(records.map((record) => record.id)).size, records.length);
const actual = records.map((record) => JSON.stringify([record.file, record.names.join(" "), record.location]));
assert.deepEqual(actual.sort(), expected.sort(), "Missing, extra, or misidentified per-test records");
const evidence = { schema: 1, coordinateConvention: "original source, 1-based lines, 0-based columns", sources, locations, tests: records, skipped: report.numPendingTests };
await writeFile(`${directory}/evidence.json`, `${JSON.stringify(evidence)}\n`);
console.log(JSON.stringify({ directory, tests: records.length, skipped: evidence.skipped, sourceFiles: Object.keys(sources).length, observedLocations: Object.keys(locations).length }));
