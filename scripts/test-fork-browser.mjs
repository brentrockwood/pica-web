#!/usr/bin/env node
// macOS Firefox must not initialize profile services in the real user's protected home.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const home = process.platform === "darwin" ? mkdtempSync(join(tmpdir(), "pica-browser-")) : undefined;
try {
  const result = spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    env: home === undefined ? process.env : { ...process.env, CFFIXED_USER_HOME: home },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (home !== undefined) {
    // macOS creates deny-delete ACLs inside this disposable home.
    execFileSync("/bin/chmod", ["-RN", home]);
    rmSync(home, { recursive: true, force: true });
  }
}
