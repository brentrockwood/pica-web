# Original TypeScript coverage from compiled descendants

Completed on AI1 on 2026-11-20 UTC, following [parent-side worker discovery](test-redundancy-worker-audit.md).

Native child-process and worker coverage now maps back to original TypeScript for a **fixed, reproducible single-source compilation path**. In the controlled cases, its executable-line sets exactly match the main worker's Istanbul results. This validates a mapping contract, not arbitrary TypeScript loaders or bundlers.

## Experiment

Two typed fixtures were compiled with the already-installed TypeScript 6.0.3, targeting ES2022 modules with external source maps and embedded original source. The original sources include erased types, separate left/right branches, an unused function, and a non-ASCII string before the branch. Compilation changes the generated line positions, so equating generated and original line numbers would give the wrong result.

Eight cases ran twice sequentially and twice with four independent jobs:

- Main-worker, child-process, and worker-thread executions of each branch of the shared TypeScript fixture.
- Each branch of a second fixture executed only in a child, without a main-worker coverage definition for that source.

All **32 selected-test executions passed**, and all 32 observations satisfied the current completeness checks. Every repetition produced exactly the expected original-source line set:

| Source and branch | Original executable lines | Routes verified |
| --- | --- | --- |
| `mapped-subject.ts`, left | 6, 7, 8 | Main worker, child, worker thread |
| `mapped-subject.ts`, right | 6, 7, 10 | Main worker, child, worker thread |
| `native-only-subject.ts`, left | 4, 5 | Child |
| `native-only-subject.ts`, right | 4, 7 | Child |

The unexecuted branch and unused function were excluded. The index has eight tests and seven distinct source-line locations; generated JavaScript locations are not mixed into it. Each native origin retains the generated-file, map, compiler, and process/thread references.

For the native-only fixture, the adapter derives original executable statement-start lines with Istanbul's TypeScript parser rather than relying on an already-loaded main-worker map. This has only been validated for the syntax in these fixtures; it is not a guarantee for every TypeScript construct or compiler-generated helper.

## Why hashes alone were insufficient

The collection captures original source, generated JavaScript, map hashes, and compiler identity before execution. The mapping adapter checks those identities, then reproduces the JavaScript and source map from the original source using the same fixed compiler settings. Only matching artifacts reach `v8-to-istanbul`.

Copied-evidence probes rejected:

- Missing transform registration.
- Generated `.analysis/` code omitted from the source inventory.
- A different compiler version.
- Mismatched original, generated-code, or map hashes.
- A map with its mappings shifted by one generated line, even after both recorded map hashes were updated to match the altered bytes.

That last probe is the important distinction: matching hashes establish consistency with recorded bytes, not that a map describes the claimed transformation. Reproduction caught the coherent but incorrect map. The adapter still trusts the pinned compiler implementation; this is not independent verification of a compiler's source-map semantics. The known-line controls provide the empirical check for this path.

The original evidence and generated build were not altered by the probes. A positive copied-evidence control was accepted.

## Regression and timing results

The latest adapter also reprocessed **48 saved worker-audit observations**. Every completeness decision, diagnostic kind, and source-line set matched the earlier output. These were artifact regressions, not 48 new test executions. Separate output directories preserve the earlier normalized records; raw inputs are hard-linked and treated as read-only.

Eight-case collection took **7.37–7.52 seconds sequentially** and **2.03–2.04 seconds with four jobs**. Final conversion of the 32 observations took **10.68 seconds**, including per-observation Node startup and compiler verification. Storage, conversion caching, and throughput optimization remain deferred.

## Limits and next step

The supported mapping path is deliberately narrow: the fixed TypeScript compiler/settings, ESM JavaScript, and one original source per map. This experiment did not validate bundling, minification, chained maps, JSX, direct `.ts` loaders, or all TypeScript lowering semantics. Such formats must not be treated as validated by this result. Unknown mapped code is rejected rather than interpreted as plain original JavaScript.

The [usable-tool follow-up](test-coverage-tool-completion.md) completes the real production-module sample. It exposed and corrected a native line-range overcredit after early return by sampling exact statement starts; main/child/worker sets now agree for that module. The [CLI guide](../test-coverage-tool.md) is the current entry point; the commands below preserve this historical experiment. The separate completeness limits still apply: parent instrumentation must be present for worker discovery; nonzero worker exits are conservatively excluded; other runtimes, arbitrary detached work, and hostile instrumentation/source mutation are not exhaustively covered. `scope-complete` remains a bounded claim.

No assertion equivalence, redundancy, mutation analysis, or test deletion was attempted.

## Artifacts and reproduction

Artifacts are on `ai1:~/src/pica-web`:

- `.analysis/mapped/`: per-case raw and unified results, `line-index.json`, validation, timings, and provenance.
- `.analysis/mapped-build/`: generated JavaScript, external maps, and the build manifest.
- `.analysis/mapped/map-probes/`: final mapping-rejection probes; the preceding run is retained separately.
- `.analysis/mapped/regression/`: outputs from replaying the earlier worker observations.
- `.analysis/mapped/tools/`: snapshot of the experiment tooling.

The runtime remained Node 22.22.1, Vitest/Istanbul 5.0.4, and `v8-to-istanbul` 9.3.0. No dependency or production source was changed.

```sh
cd ~/src/pica-web
# Both destinations must be new; build paths are repository-relative.
node scripts/test-coverage-pilot/build-mapped-fixtures.mjs .analysis/mapped-build-next
python3 scripts/test-coverage-pilot/isolation-experiment.py \
  .analysis/mapped-next scripts/test-coverage-pilot/mapped-cases.json traced \
  .analysis/mapped-build-next/transforms.json

# Normalize every collected case before checking the complete experiment.
for batch in jobs1-r1 jobs1-r2 jobs4-r1 jobs4-r2; do
  for side in left right; do
    for mode in main child worker native-only; do
      node scripts/test-coverage-pilot/unify-coverage.mjs \
        ".analysis/mapped-next/$batch/$mode-$side" \
        .analysis/mapped-next/source-hashes.json
    done
  done
done
python3 scripts/test-coverage-pilot/check-mapped.py .analysis/mapped-next
```

The checker validates all 32 outputs and creates `map-probes`; it refuses to overwrite an existing probe directory. This is the historical prototype invocation. For current collection, use the [coverage tool guide](../test-coverage-tool.md); old evidence without the main-worker load audit cannot establish current completeness.

Focused execution, mapping/rejection checks, saved-observation regressions, JavaScript/Python syntax, cached project typecheck, and standalone fixture typechecks passed. Scoped ESLint ignored the three experimental TypeScript files because no matching configuration exists; this is **not lint verification**. Full-suite, browser, build/package, and whole-project lint checks were not run. Links and whitespace were checked.

Services were unchanged. The work remains uncommitted and unpushed.
