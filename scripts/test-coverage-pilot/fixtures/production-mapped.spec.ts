import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { parseThemePreference } from "../../../src/shared/themePreference";

const transforms = JSON.parse(readFileSync(process.env.MAPPED_TRANSFORMS!, "utf8"));
const file = Object.keys(transforms).find(file => transforms[file].original === "src/shared/themePreference.ts");
if (!file) throw new Error("Build src/shared/themePreference.ts with the mapped builder first");
const url = pathToFileURL(resolve(file)).href;
const execute = promisify(execFile);
for (const [label, input, expected] of [
  ["valid", { themeId: "themes:pi-web-dark", auto: false }, { themeId: "themes:pi-web-dark", auto: false }],
  ["invalid", null, undefined],
] as const) {
  it(`production main ${label}`, () => { expect(parseThemePreference(input)).toEqual(expected); });
  it(`production child ${label}`, async () => {
    const code = `import(${JSON.stringify(url)}).then(m => console.log(JSON.stringify(m.parseThemePreference(${JSON.stringify(input)}))));`;
    const { stdout } = await execute(process.execPath, ["-e", code]);
    expect(stdout.trim()).toBe(JSON.stringify(expected) ?? "undefined");
  });
  it(`production worker ${label}`, async () => {
    const code = `const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(url)}).then(m => parentPort.postMessage(m.parseThemePreference(${JSON.stringify(input)})));`;
    const worker = new Worker(code, { eval: true });
    try {
      const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
      expect(message).toEqual([expected]);
      expect(exit).toEqual([0]);
    } finally { await worker.terminate(); }
  });
}
