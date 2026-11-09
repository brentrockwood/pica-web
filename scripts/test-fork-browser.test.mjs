import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("forwards browser-runner exits and cleans its temporary home on success and failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "pica-browser-check-"));
  try {
    for (const [argument, exit] of [["--help", 0], ["--not-a-playwright-option", 1]]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("./test-fork-browser.mjs", import.meta.url)), argument], {
        env: { ...process.env, TMPDIR: directory, TMP: directory, TEMP: directory }, encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(exit);
      expect(readdirSync(directory)).toEqual([]);
    }
  } finally {
    if (process.platform === "darwin") execFileSync("/bin/chmod", ["-RN", directory]);
    rmSync(directory, { recursive: true, force: true });
  }
});
