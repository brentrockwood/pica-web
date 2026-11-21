import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { childOnly } from "./child-subject.mjs";

const url = new URL("./child-subject.mjs", import.meta.url).href;
const body = `const { parentPort } = require('node:worker_threads'); import(${JSON.stringify(url)}).then(m => parentPort.postMessage(m.childOnly()));`;
const hiddenOptions = { eval: true, execArgv: [], env: { ...process.env, NODE_OPTIONS: "", NODE_V8_COVERAGE: "" } };

async function result(worker: Worker) {
  try {
    const [message, exit] = await Promise.all([once(worker, "message"), once(worker, "exit")]);
    expect(exit).toEqual([0]);
    return message[0];
  } finally { await worker.terminate(); }
}

it("discovers a worker that suppresses its own hooks", async () => {
  expect(typeof childOnly).toBe("function");
  expect(await result(new Worker(body, hiddenOptions))).toBe("child");
});
it("records worker termination after a successful message", async () => {
  const worker = new Worker(`${body} setInterval(() => {}, 1000);`, { eval: true });
  try {
    expect(await once(worker, "message")).toEqual(["child"]);
    expect(await worker.terminate()).toBe(1);
  } finally { await worker.terminate(); }
});
it("tracks a worker created inside another worker", async () => {
  const nested = `const { Worker, parentPort } = require('node:worker_threads'); const { once } = require('node:events'); const nested = new Worker(${JSON.stringify(body)}, { eval: true }); Promise.all([once(nested, 'message'), once(nested, 'exit')]).then(([message, exit]) => { if (exit[0] !== 0) throw new Error('Nested worker failed'); parentPort.postMessage(message[0]); });`;
  expect(await result(new Worker(nested, { eval: true }))).toBe("child");
});
it("does not invent a worker when construction is rejected", () => {
  expect(() => new Worker("not-an-absolute-path.js")).toThrow();
});
it("detects removal of the parent worker audit", async () => {
  const listeners = process.listeners("worker");
  process.removeAllListeners("worker");
  try {
    expect(await result(new Worker(body, hiddenOptions))).toBe("child");
  } finally {
    for (const listener of listeners) process.on("worker", (...args) => Reflect.apply(listener, process, args));
  }
});
