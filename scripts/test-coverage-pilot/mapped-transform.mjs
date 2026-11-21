import { basename, dirname, resolve } from "node:path";
import ts from "typescript";

export const compilerVersion = ts.version;
if (compilerVersion !== "6.0.3") throw new Error("Mapped coverage requires TypeScript 6.0.3");
export function compile(file, text) {
  return ts.transpileModule(text, {
    fileName: basename(file),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      inlineSources: true,
      sourceRoot: dirname(resolve(file)),
    },
  });
}
