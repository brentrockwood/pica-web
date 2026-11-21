import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("has no project source execution", () => { expect(1 + 1).toBe(2); });
it("exceeds the job timeout", async () => { await new Promise(resolve => setTimeout(resolve, 60_000)); }, 70_000);
it("rejects query-bearing descendants", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
    "import { childOnly } from './scripts/test-coverage-pilot/fixtures/child-subject.mjs?unsupported'; console.log(childOnly());",
  ]);
  expect(stdout.trim()).toBe("child");
});
