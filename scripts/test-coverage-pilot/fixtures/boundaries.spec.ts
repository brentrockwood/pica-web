import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { afterAll, expect, it, vi } from "vitest";
import { cachedValue, startDeferred } from "./boundary-subject";
import { childOnly } from "./child-subject.mjs";

let release: (() => void) | undefined;
let pending: Promise<string> | undefined;
afterAll(async () => { release?.(); await pending; });

it("A schedules background work without waiting", () => {
  const gate = new Promise<void>((resolve) => { release = resolve; });
  pending = startDeferred(gate);
  expect(pending).toBeInstanceOf(Promise);
});
it("B waits for work started by A", async () => {
  release?.();
  if (pending) expect(await pending).toBe("background");
});
it("first cache consumer", () => { expect(cachedValue()).toBe("cached"); });
it("second cache consumer", () => { expect(cachedValue()).toBe("cached"); });
it("executes a reloaded module", async () => {
  vi.resetModules();
  const reloaded = await import("./boundary-subject");
  expect(reloaded.cachedValue()).toBe("cached");
});
it("verifies a child process without observing its coverage", () => {
  expect(typeof childOnly).toBe("function");
  const url = new URL("./child-subject.mjs", import.meta.url).href;
  const text = execFileSync(process.execPath, ["--input-type=module", "-e", `import { childOnly } from ${JSON.stringify(url)}; console.log(childOnly());`], { encoding: "utf8" });
  expect(text.trim()).toBe("child");
});
it("verifies a worker thread without observing its coverage", async () => {
  const url = new URL("./child-subject.mjs", import.meta.url).href;
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); import(${JSON.stringify(url)}).then(m => parentPort.postMessage(m.childOnly()));`, { eval: true });
  const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
  expect(message).toEqual(["child"]);
  expect(exit).toEqual([0]);
});
