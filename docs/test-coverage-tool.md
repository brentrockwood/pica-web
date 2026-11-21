# Per-test execution coverage

Use this repository-only CLI to find tests that execute overlapping source lines. Each selected test runs in a fresh Vitest process and fork worker. The command collects evidence, checks completeness, normalizes supported descendant coverage, and writes an index and deterministic candidate pairs.

**Execution overlap is not assertion equivalence or permission to delete tests.** Collection/imports, setup, the selected test and awaited cleanup all contribute. The tool does not separate those phases or decide whether to reuse, extend, add or remove a test.

## Setup

The validated collection environment is **Linux, Node 22.22.1, Python 3.10+, Vitest 5.0.4, TypeScript 6.0.3, GNU time and strace**. AI1 used Python 3.14.4 and strace 6.19. macOS/Windows collection is not supported; there is no silent untraced fallback. Use a trusted checkout with the normal root dependencies installed (`npm ci` for a new checkout). Do not run tests against live service state.

From the repository root:

```sh
python3 scripts/test-coverage-pilot/coverage.py setup
python3 scripts/test-coverage-pilot/check-cli.py
node scripts/test-coverage-pilot/check-native-points.mjs
```

Setup installs locked analysis dependencies under `.analysis/tools` and `.analysis/converter` with `npm ci --ignore-scripts`. It links the isolated Istanbul provider from `node_modules/@vitest/coverage-istanbul`. It does not change root package manifests, install global tools, or manage services. It refuses to replace a different provider installation or different analysis manifests. Registry access is needed for setup; collection uses installed dependencies. The tracked dependency lockfiles pin Vitest/Istanbul 5.0.4 and `v8-to-istanbul` 9.3.0, including its source-map decoder dependency.

If strace/GNU time or the pinned Node version is unavailable, provision them through the host's normal development procedure before collection. A failed setup/preflight is not usable coverage.

## Collect

This bounded real-test sample contains 16 existing tests in six files: theme validation, search, pin persistence, project configuration, DOM lifecycle and model catalog behavior. It includes expanded parameterized titles, real filesystem work and an `rg` subprocess.

```sh
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/real-cases.json \
  --jobs 4 --repeat 2 --output .analysis/coverage-tool-demo-final
python3 scripts/test-coverage-pilot/check-results.py .analysis/coverage-tool-demo-final real
```

**Every output directory must be new.** Change the output name when repeating a command; existing evidence is never overwritten. `--jobs` defaults to 1. Opt into parallelism only after checking that the selected tests do not use shared fixed paths, ports or external state. Each job receives private HOME/temp/XDG/config/data/socket/cache/report paths, but all jobs share the checkout, dependencies, host, credentials and network. This is not a security sandbox.

Select one test without writing a manifest:

```sh
python3 scripts/test-coverage-pilot/coverage.py run \
  --file src/shared/themePreference.test.ts \
  --title 'rejects invalid preferences: null' \
  --output .analysis/theme-null
```

Or supply a JSON array:

```json
[
  {
    "key": "theme-null",
    "file": "src/shared/themePreference.test.ts",
    "title": "rejects invalid preferences: null"
  }
]
```

`file` is an existing repository-relative file; `key` is a unique alphanumeric/hyphen/underscore output name. `title` is the **exact expanded leaf title**, not a regex or suite-qualified name. It must be unique within the collected file, including skipped cases. Duplicate names are rejected rather than guessed; rename/disambiguation support is outside this tool's boundary. The saved per-job `selection.json` lists collected full names, options and results when diagnosing a mismatch. A filter matching no test is never a success.

`--repeat N` compares complete line sets from separate fresh runs. Any difference excludes the test from candidates; the tool does not substitute their intersection. One repetition makes no repeatability claim. `--timeout` defaults to 120 seconds per collection/conversion. Collection timeout kills the newly launched job's process group, records exit 124, and excludes it. Arbitrary detached processes remain outside this cleanup guarantee.

## Read the results

| File | Use |
| --- | --- |
| `summary.json` | Selected/accepted/excluded counts, locations and candidate count. A missing summary means the command did not finish. |
| `line-index.json` | Source hashes, `file:line → test keys`, test identity, eligibility and links to every observation. |
| `candidates.json` | Deterministically sorted overlapping pairs: intersection, only-A/B locations, equality/containment/partial overlap, directional containment fractions, Jaccard and unique observed lines. Disjoint pairs are omitted. |
| `observations.json` | Every requested execution, including failed, skipped, unsupported, empty or incomplete ones. |
| `source-hashes.json`, `provenance.json`, `tools/` | Pre-run source identity, revision, runtime/platform, command/config/tool hashes and tool snapshot. Generated artifacts and maps are hashed when registered. |
| `run-N/<key>/` | Exact command and exit status (`case.json`), Vitest reports, logs, native reports, context/exit receipts and process/worker audits. |
| `run-N/<key>/unified.json` | Per-line provider, artifact, process/thread and source-map provenance; completeness reasons and boundary. Partial maps are diagnostic only. |

For a candidate, follow its keys through `line-index.json` to each observation's `unified.json`, then inspect the original source and assertions. Ratios use positive observed line sets: intersection divided by each test's size for containment, and by their union for Jaccard. Candidate arithmetic is quadratic within shared-location groups; this is a bounded developer tool, not a tested whole-suite scaling solution.

Exit codes:

- **0:** every requested test has accepted positive evidence; all requested repetitions agree.
- **2:** execution finished, but at least one test is excluded. Other accepted tests may have candidates. Inspect per-observation reasons; a passing assertion can still have incomplete coverage.
- **1:** invalid input, unavailable prerequisites or orchestration failure. Preserve logs; do not use an unfinished directory as a completed report.

Failed/skipped/pending tests, retries, repeats configured *inside* a test, concurrent-marked tests, ambiguous/empty selections, empty source maps, unstable repetitions, source/tool drift and incomplete coverage never participate in candidate decisions. Empty observed execution is **not** classified as no useful protection. The external `--repeat` option is separate from Vitest's unsupported test-level `repeats` option.

## Supported coverage boundary

The common unit is an original-source executable **statement-start line**, collapsed across statements on the same line. Branch distinctions and execution counts are not comparable across providers. No branch/statement equivalence or body-only coverage is claimed.

- Main worker: Vitest's standard Istanbul aggregate, with its original-source remapping and coverage exclusions. This includes imports needed to collect unselected tests in the same file. A synchronous Node load hook records native module loads before evaluation. Project modules loaded outside Vitest's transform path, including ordinary `createRequire()`/`require()` calls, exclude the observation with `main-native-project-load`, even if unrelated instrumented code contributes positive coverage. The tool does not assume that a main-worker native report exists. Load receipts are saved incrementally because Vitest may terminate that worker without an exit event; missing registration or receipts exclude the observation. This guard also conservatively excludes native `require()` of project-local JSON data; that known over-exclusion loses observations rather than admitting false candidates.
- Descendants: native V8 coverage for the selected Node executable and its worker threads. Process launches come from strace; worker creation comes from parent-side Node events. Registration, reports and closure receipts must reconcile. Suppressed hooks, missing reports/receipts, removed audit listeners and nonzero worker exits are rejected.
- Source inventory: JavaScript/TypeScript under `src`, `pi-packages`, `pi-web-plugins`, `scripts` and `extensions`, plus registered generated files/maps. Test/test-support code, collector infrastructure, dependencies and runtime internals are not candidate source. Main coverage also retains Vitest's standard exclusions. Unknown generated `.analysis` code and unregistered code under these project roots are rejected, not silently assigned zero.
- Plain descendant JavaScript and the fixed single-source TypeScript build below are supported. Native statement hits use exact source-map statement starts and innermost V8 ranges. Missing or conflicting generated positions, or conflicting counts on equally specific containing ranges, fail closed. This conservatively excludes some ordinary classes with both static and unused instance initializers; it does not credit unused fields or method bodies. Source, generated code and map hashes must match; generated code/maps must also match a deterministic compiler rebuild.

Istanbul statement maps must have exactly matching counter keys. Every statement counter and every V8 range counter used for normalization must be a finite, nonnegative number. A missing or malformed counter is not zero execution. Invalid Istanbul evidence removes any stale normalized output; invalid native evidence produces an incomplete diagnostic map, never a candidate.

A real-module check exposed why ordinary native line-range remapping was insufficient: V8 operator gaps credited a condition after an early return. Exact statement-start sampling removes that false hit. The real `themePreference.ts` check now agrees across main, child and worker execution for both successful parsing and early return, while excluding the unused validator. Compiler/source-map semantics outside the tested cases remain a boundary, not a universal guarantee.

`scope-complete` means complete **within these checks**, not exhaustive runtime discovery. The evidence explicitly retains `exhaustiveDescendantDiscovery: false`. Other Node binaries, non-Node code (`rg`, shells, browsers, native add-ons), dependency bodies, arbitrary detached/late work, custom loaders, query-bearing modules, direct native `.ts` execution, bundles, minifiers, chained maps and hostile event/profiler/source manipulation are not covered. Non-Node launches are recorded, not given source coverage. Do not use this tool to infer protection for those boundaries. Nonzero worker exits are conservatively excluded even when expected by the test.

## Fixed TypeScript descendant mapping

Compile import-free modules, or modules whose runtime imports already resolve as supported JavaScript. The builder does not bundle or recursively rewrite imports. Source basenames must be unique. Compilation uses TypeScript 6.0.3, ES2022/ESNext and one external map with inline original source. This is a validated narrow transform, not support for every TypeScript lowering construct.

```sh
node scripts/test-coverage-pilot/build-mapped-fixtures.mjs \
  .analysis/coverage-tool-build src/shared/themePreference.ts
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/production-mapped-cases.json \
  --jobs 3 --repeat 2 \
  --transforms .analysis/coverage-tool-build/transforms.json \
  --output .analysis/coverage-tool-production
python3 scripts/test-coverage-pilot/check-results.py .analysis/coverage-tool-production production-map
```

The builder keeps its historical name. Without source arguments it builds the original mapping fixtures. Generated outputs must stay in place, unchanged, when normalizing saved reports. Normalization checks current source bytes against their recorded hashes; it does not reconstruct a checkout from Git alone.

## Runnable verification

The sample above checks real executions and independently recomputes candidate intersections. The following controls exercise ownership, cache initialization, awaited cleanup, child/worker lineage and deliberately missing coverage:

```sh
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/control-cases.json \
  --jobs 4 --repeat 2 --output .analysis/coverage-tool-controls
# Expected exit: 2 (five incomplete controls and two empty controls).
python3 scripts/test-coverage-pilot/check-results.py .analysis/coverage-tool-controls controls

python3 scripts/test-coverage-pilot/check-operational.py .analysis/coverage-tool-operational-next
```

The operational checker expects and verifies child-command failures/exclusions: empty evidence, timeout, unsupported query-bearing native mapping, no-overwrite behavior, zero/duplicate selections, skips, assertion failure and unsupported test options. Its own exit must be 0.

Run the review regressions and mapping/ownership guards against fresh evidence:

```sh
python3 scripts/test-coverage-pilot/check-adversarial.py .analysis/coverage-adversarial-next
python3 scripts/test-coverage-pilot/check-unifier-guards.py .analysis/coverage-tool-controls
node scripts/test-coverage-pilot/build-mapped-fixtures.mjs .analysis/coverage-mapped-build-next
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/mapped-cases.json --jobs 4 --repeat 2 \
  --transforms .analysis/coverage-mapped-build-next/transforms.json \
  --output .analysis/coverage-mapped-next
python3 scripts/test-coverage-pilot/check-mapped.py .analysis/coverage-mapped-next
```

The adversarial checker verifies plain JS and mapped TS class execution across main/child/worker, positive-helper `require()` exclusions, valid CJS import/child controls, malformed positive counters and missing load audits. Its exit must be 0; its collector deliberately returns 2 for six excluded cases. Mutation probes use real copies, not hard links. The mapping checker rejects missing registrations, hashes/compiler drift and coherently shifted maps; the unifier guards reject missing ownership/closure/audits, unknown successful exec formats and stale accepted output after source drift. Each guard checker creates a new probe subdirectory; do not rerun it on the same evidence directory.

Historical prototype/review artifacts lack the required main-worker load audit and cannot establish current completeness. Recollect them rather than adding synthetic receipts or expecting the old unchanged-replay checker to pass. Preserve old evidence read-only, especially raw inputs hard-linked by earlier replays. Fresh CLI collection does not require historical artifacts.

See the [completion report](plans/test-coverage-tool-completion.md) for measured results, exploratory failures and checks not run. Earlier experiments remain under the [analysis plan](plans/test-redundancy-analysis.md). Artifacts can contain local paths and test data; do not publish raw logs without review.
