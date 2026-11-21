import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { childOnly } from "./child-subject.mjs";

const url = new URL("./child-subject.mjs", import.meta.url).href;
it("calls the shared function in the main test worker", () => {
  expect(childOnly()).toBe("child");
});
it("detects a child that suppresses all collection hooks", () => {
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `import { childOnly } from ${JSON.stringify(url)}; console.log(childOnly());`], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_V8_COVERAGE: "" },
  });
  expect(result.trim()).toBe("child");
});
it("detects a child killed before coverage flush", () => {
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", `import { childOnly } from ${JSON.stringify(url)}; console.log(childOnly()); process.kill(process.pid, 'SIGKILL');`], { encoding: "utf8" });
    throw new Error("Child unexpectedly survived");
  } catch (error) {
    expect(error).toMatchObject({ signal: "SIGKILL", stdout: "child\n" });
  }
});
