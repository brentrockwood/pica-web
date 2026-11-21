import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(".analysis/converter/package.json"));
const { TraceMap, decodedMappings } = require("@jridgewell/trace-mapping");

export function validateV8Counters(functions) {
  assert(Array.isArray(functions), "Missing V8 functions");
  for (const fn of functions) {
    assert(Array.isArray(fn.ranges) && fn.ranges.length, "Missing V8 ranges");
    for (const range of fn.ranges) {
      assert(typeof range.count === "number" && Number.isFinite(range.count) && range.count >= 0,
        `Invalid V8 range count at ${range.startOffset}:${range.endOffset}`);
    }
  }
}

// Line-range remapping can credit an unexecuted condition through operator gaps.
// Sample exact statement starts instead; never interpolate an absent source-map segment.
export function nativeStatementLines(text, functions, statements, sourceMap) {
  validateV8Counters(functions);
  const offsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") offsets.push(i + 1);
  const positions = new Map();
  if (sourceMap) {
    for (const [line, segments] of decodedMappings(new TraceMap(sourceMap)).entries()) {
      for (const segment of segments) {
        if (segment.length < 4) continue;
        assert.equal(segment[1], 0, "Only single-source maps are supported");
        const key = `${segment[2] + 1}:${segment[3]}`;
        if (!positions.has(key)) positions.set(key, []);
        positions.get(key).push(offsets[line] + segment[0]);
      }
    }
  }
  const ranges = functions.flatMap(fn => fn.ranges.map((range, i) => ({ ...range, functionStart: i === 0 && fn.ranges[0].startOffset !== 0 })))
    .sort((a, b) => (a.endOffset - a.startOffset) - (b.endOffset - b.startOffset));
  const hits = new Set();
  for (const { start } of statements) {
    const points = sourceMap ? positions.get(`${start.line}:${start.column}`) : [offsets[start.line - 1] + start.column];
    assert(points?.length, `No exact generated statement start for ${start.line}:${start.column}`);
    const counts = points.map(point => {
      // Evaluating a function expression creates it; its body counter is separate.
      const containing = ranges.filter(range => range.startOffset <= point && point < range.endOffset && !(range.functionStart && point === range.startOffset));
      const range = containing[0];
      assert(range, `No V8 range at statement start ${start.line}:${start.column}`);
      const width = range.endOffset - range.startOffset;
      assert(containing.every(other => other.endOffset - other.startOffset !== width || other.count === range.count),
        `Conflicting equally specific V8 ranges at statement start ${start.line}:${start.column}`);
      return range.count > 0;
    });
    assert(counts.every(count => count === counts[0]), `Ambiguous generated statement start for ${start.line}:${start.column}`);
    if (counts[0]) hits.add(start.line);
  }
  return hits;
}
