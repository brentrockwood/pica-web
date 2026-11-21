import assert from "node:assert/strict";
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
console.log("Native statement-point, equal-specificity ambiguity and counter guards passed");
