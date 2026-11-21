import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { threadId } from "node:worker_threads";

const path = join(process.env.COVERAGE_JOB_DIR, "contexts", `${process.pid}-${threadId}.json`);
const context = JSON.parse(readFileSync(path, "utf8"));
context.role = "test-worker";
writeFileSync(`${path}.tmp`, JSON.stringify(context));
renameSync(`${path}.tmp`, path);
