import assert from "node:assert/strict";
import { Session } from "node:inspector/promises";
import { runInNewContext } from "node:vm";
import { nativeStatementLines } from "./native-statement-lines.mjs";

const text = "outer\nfunction\nbody\n";
const functions = [
  { ranges: [{ startOffset: 0, endOffset: text.length, count: 1 }] },
  { ranges: [{ startOffset: 6, endOffset: text.length, count: 0 }] },
];
const statements = [1, 2, 3].map(line => ({ start: { line, column: 0 } }));
assert.deepEqual([...nativeStatementLines(text, functions, statements)], [1, 2]);
const map = { version: 3, sources: ["subject.ts"], names: [], mappings: "AAAA;;AAAA" };
assert.throws(() => nativeStatementLines(text, functions, [statements[0]], map), /Ambiguous generated statement start/);
assert.throws(() => nativeStatementLines(text, functions, [{ start: { line: 1, column: 1 } }], map), /No exact generated statement start/);
assert.throws(() => nativeStatementLines(text, [], statements), /No V8 range/);
const conflicting = [...functions, { ranges: [{ startOffset: 6, endOffset: text.length, count: 1 }] }];
assert.throws(() => nativeStatementLines(text, conflicting, statements), /Conflicting equally specific V8 ranges/);
for (const count of [undefined, null, "0", -1, NaN, Infinity]) {
  const malformed = structuredClone(functions);
  malformed[1].ranges[0].count = count;
  assert.throws(() => nativeStatementLines(text, malformed, statements), /Invalid V8 range count/);
}
const session = new Session();
session.connect();
try {
  await session.post("Profiler.enable");
  await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  const source = "x => {\n  return x;\n};\nconst called = x => {\n  return x;\n};\ncalled(1);\n";
  const filename = "native-offset-zero-regression.js";
  runInNewContext(source, {}, { filename });
  const { result } = await session.post("Profiler.takePreciseCoverage");
  const coverage = result.find(script => script.url === filename);
  assert(coverage, "Missing real V8 regression coverage");
  assert(coverage.functions.some(fn => fn.ranges[0].startOffset === 0 && fn.ranges[0].count === 0),
    "Fixture must include an uncalled function at offset zero");
  const starts = [1, 2, 4, 5, 7].map(line => ({ start: { line, column: line === 2 || line === 5 ? 2 : 0 } }));
  for (const records of [coverage.functions, [...coverage.functions].reverse()]) {
    assert.deepEqual([...nativeStatementLines(source, records, starts)], [1, 4, 5, 7],
      "Function creation must hit without crediting its uncalled body, regardless of record order");
  }

  // Without a trailing delimiter, the anonymous arrow and script cover the same source span.
  const ambiguousSource = "x => 1";
  const ambiguousFilename = "native-ambiguous-root-regression.js";
  runInNewContext(ambiguousSource, {}, { filename: ambiguousFilename });
  const ambiguousResult = await session.post("Profiler.takePreciseCoverage");
  const ambiguousCoverage = ambiguousResult.result.find(script => script.url === ambiguousFilename);
  assert(ambiguousCoverage, "Missing real V8 ambiguous-root coverage");
  assert.equal(ambiguousCoverage.functions.filter(fn => fn.ranges[0].startOffset === 0
    && fn.ranges[0].endOffset === ambiguousSource.length).length, 2);
  for (const records of [ambiguousCoverage.functions, [...ambiguousCoverage.functions].reverse()]) {
    assert.throws(() => nativeStatementLines(ambiguousSource, records, [statements[0]]), /Ambiguous V8 script root/);
  }
} finally {
  session.disconnect();
}
console.log("Native statement-point, offset-zero creation, equal-specificity ambiguity and counter guards passed");
