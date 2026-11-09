#!/usr/bin/env node
// Keep release-integration tests away from the running Pi/MCP configuration.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function testEnvironment(inherited, directory) {
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith("PI_WEB_") || key === "PI_WEB_SESSION"));
  return {
    ...env,
    HOME: directory,
    PI_CODING_AGENT_DIR: join(directory, "agent"),
    PI_WEB_DATA_DIR: join(directory, "data"),
    PI_WEB_CONFIG: join(directory, "config.json"),
    PI_WEB_SESSIOND_SOCKET: join(directory, "sessiond.sock"),
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    npm_config_ignore_scripts: "false",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = mkdtempSync(join(tmpdir(), "pica-tests-"));
  try {
    const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
      "exec", "--", "vitest", "run", "--config", "vitest.config.ts", "--maxWorkers=2", ...process.argv.slice(2),
    ], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      env: testEnvironment(process.env, directory),
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
