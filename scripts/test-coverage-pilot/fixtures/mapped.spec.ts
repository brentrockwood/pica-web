import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { mapped } from "./mapped-subject";

const transforms = JSON.parse(readFileSync(process.env.MAPPED_TRANSFORMS!, "utf8"));
const execute = promisify(execFile);
function moduleUrl(name: string) {
  const file = Object.keys(transforms).find(file => file.endsWith(`/${name}.js`));
  if (!file) throw new Error(`Missing built fixture: ${name}`);
  return pathToFileURL(resolve(file)).href;
}
for (const side of ["left", "right"] as const) {
  it(`maps main ${side}`, () => {
    expect(mapped({ side })).toBe(`🧪:${side}`);
  });
  it(`maps child ${side}`, async () => {
    const code = `import(${JSON.stringify(moduleUrl("mapped-subject"))}).then(m => console.log(m.mapped({side:${JSON.stringify(side)}})));`;
    expect((await execute(process.execPath, ["-e", code])).stdout.trim()).toBe(`🧪:${side}`);
  });
  it(`maps worker ${side}`, async () => {
    const code = `const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(moduleUrl("mapped-subject"))}).then(m => parentPort.postMessage(m.mapped({side:${JSON.stringify(side)}})));`;
    const worker = new Worker(code, { eval: true });
    try {
      const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
      expect(message).toEqual([`🧪:${side}`]);
      expect(exit).toEqual([0]);
    } finally { await worker.terminate(); }
  });
  it(`maps native-only ${side}`, async () => {
    const code = `import(${JSON.stringify(moduleUrl("native-only-subject"))}).then(m => console.log(m.nativeOnly(${JSON.stringify(side)})));`;
    expect((await execute(process.execPath, ["-e", code])).stdout.trim()).toBe(`native:${side}`);
  });
}
