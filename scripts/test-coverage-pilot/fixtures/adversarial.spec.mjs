import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { childOnly } from "./child-subject.mjs";

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const transforms = JSON.parse(readFileSync(process.env.MAPPED_TRANSFORMS, "utf8"));
const generated = Object.keys(transforms).find(file => transforms[file].original.endsWith("/ambiguous-class.ts"));
for (const extension of ["mjs", "ts"]) {
  const url = pathToFileURL(resolve(extension === "ts" ? generated : "scripts/test-coverage-pilot/fixtures/ambiguous-class.mjs")).href;
  it(`class ${extension} main`, async () => {
    const module = extension === "ts" ? await import("./ambiguous-class.ts") : await import("./ambiguous-class.mjs");
    expect(module.run()).toBe(6);
  });
  it(`class ${extension} child`, async () => {
    expect((await execute(process.execPath, ["-e", `import(${JSON.stringify(url)}).then(m => console.log(m.run()))`])).stdout.trim()).toBe("6");
  });
  it(`class ${extension} worker`, async () => {
    const worker = new Worker(`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(url)}).then(m => parentPort.postMessage(m.run()));`, { eval: true });
    try {
      const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
      expect(message).toEqual([6]);
      expect(exit).toEqual([0]);
    } finally { await worker.terminate(); }
  });
}
for (const flag of [true, false]) {
  it(`require ${flag}`, () => {
    expect(childOnly()).toBe("child");
    expect(require("./required-subject.cjs").run(flag)).toBe(flag ? "🧪" : "other");
  });
}
it("cjs import", async () => {
  expect((await import("./required-subject.cjs")).run(true)).toBe("🧪");
});
it("cjs child", async () => {
  const file = resolve("scripts/test-coverage-pilot/fixtures/required-subject.cjs");
  expect((await execute(process.execPath, ["-e", `console.log(require(${JSON.stringify(file)}).run(true))`])).stdout.trim()).toBe("🧪");
});
