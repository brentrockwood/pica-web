import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { compile, compilerVersion } from "./mapped-transform.mjs";

const output = process.argv[2];
if (!output) throw new Error("Provide a new build directory");
await mkdir(output, { recursive: false });
const transforms = {};
const hash = (text) => createHash("sha256").update(text).digest("hex");
const originals = process.argv.slice(3);
if (!originals.length) originals.push(...["mapped-subject", "native-only-subject"].map(name => `scripts/test-coverage-pilot/fixtures/${name}.ts`));
if (new Set(originals.map(file => basename(file, ".ts"))).size !== originals.length) throw new Error("Source basenames must be unique");
for (const original of originals) {
  if (!original.endsWith(".ts")) throw new Error("Only single-source TypeScript modules are supported");
  const text = await readFile(original, "utf8");
  const result = compile(original, text);
  const generated = `${output}/${basename(original, ".ts")}.js`;
  const map = `${generated}.map`;
  await writeFile(generated, result.outputText);
  await writeFile(map, result.sourceMapText);
  transforms[generated] = { original, map, compilerVersion, originalHash: hash(text), generatedHash: hash(result.outputText), mapHash: hash(result.sourceMapText) };
}
await writeFile(`${output}/transforms.json`, JSON.stringify(transforms, null, 2)+"\n");
console.log(`${output}/transforms.json`);
