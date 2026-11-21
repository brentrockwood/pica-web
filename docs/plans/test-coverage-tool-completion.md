# Coverage-analysis tool: completion report

The initial delivery on AI1 on 2026-11-20 was followed by an independent review that found two accepted-coverage errors and missing counter validation. Those findings invalidate the earlier completion claim as evidence of correctness. The fixes and fresh verification below supersede that claim. Independent re-review on 2026-11-21 verified all three findings resolved and approved the tool within its documented boundary. The [operating guide](../test-coverage-tool.md) defines the current bounded contract.

## Independent re-review disposition

A fresh reviewer exercised 120 observations, including deliberate exclusions and two JSON-import normalization failures, plus 19 copied-report counter mutations. All three original findings were independently verified resolved. The 43 accepted original comparison observations retained their historical line sets, and the real sample again accepted 16 tests across 32 observations with 2,012 locations and 65 candidate pairs. These results do not establish assertion equivalence or permission to delete tests.

One non-blocking limitation remains: native `require()` of project-local JSON data triggers the conservative project-load exclusion even though JSON has no executable statements. This loses usable observations rather than admitting false candidates. Native JSON imports also remain outside the current source inventory. Broader loader support was not required for approval.

The reviewer made no source changes. Private review evidence is retained on AI1 under `.analysis/coverage-rereview-*`; raw artifacts are not part of this checkpoint. Full application and delivery verification were outside the review scope.

## Review fixes and current verification

Three changes address the findings without broadening the tool into a universal collector:

- Native statement sampling rejects conflicting equally specific V8 ranges. The ordinary class with static and unused instance initializers is now incomplete in child/worker execution, for both plain JS and the fixed TypeScript build. Main Istanbul execution still reports only lines 8, 9 and 11; unused fields and method bodies are not accepted as executed.
- A synchronous Node module-load hook records main-worker native loads outside Vitest's transform path. Ordinary `createRequire()`/`require()` project execution now produces `main-native-project-load`, even with positive unrelated helper coverage. No main-worker native report is assumed. Receipts are written during loading because the worker may terminate without an exit event. Missing audit registration/receipts also exclude observations.
- Istanbul statement/count keys must match exactly, and all required Istanbul and V8 counts must be finite, nonnegative numbers. Missing or malformed counters no longer become zero execution. Invalid Istanbul evidence removes stale normalized output; invalid native evidence is incomplete and cannot enter candidates.

The useful real-test sample did **not** shrink: the fresh final run still accepts all 16 tests across 32 observations, with **2,012 locations and 65 candidate pairs**. Conservative exclusions are specific to evidence the tool cannot reliably attribute, not hidden failures. Main CJS imports through Vitest and ordinary child CJS execution retain their expected lines.

All current paths below are relative to `/home/br/src/pica-web` on AI1. Each output was new. Checkers exited 0 unless explicitly stated otherwise.

| Current check | Evidence and result |
| --- | --- |
| `check-cli.py`, `check-native-points.mjs` | Selection/arithmetic and native point, ambiguity and malformed-counter self-checks passed. |
| `check-adversarial.py .analysis/coverage-fixes-adversarial-final-v2` | 20 observations: eight accepted, eight class-descendant exclusions and four positive-helper require exclusions. Nine real-copy counter mutations and two missing-audit probes rejected as expected. Its internal collector exits 2. |
| Real sample, `--jobs 4 --repeat 2` | `.analysis/coverage-fixes-real-final`; collector and `check-results.py … real` exit 0, all 32 observations accepted. |
| Production module, `--jobs 3 --repeat 2` | `.analysis/coverage-fixes-production-final`, build `.analysis/coverage-fixes-production-build`; all 12 main/child/worker observations match known exact lines, including early return and unused-function controls. |
| Ownership controls, `--jobs 4 --repeat 2` | `.analysis/coverage-fixes-controls-final`; collector exits 2: 26 positive, 10 intentionally incomplete and four empty observations. `check-results.py … controls` and `check-unifier-guards.py` pass without weakening their comparisons. |
| Mapping fixtures, `--jobs 4 --repeat 2` | `.analysis/coverage-fixes-mapped-final`, build `.analysis/coverage-fixes-mapped-build`; 16 accepted observations, seven exact locations and all eight mapping guard cases verified by `check-mapped.py`. |
| `check-operational.py .analysis/coverage-fixes-operational-final` | Timeout/process-group cleanup, empty evidence, query-bearing source rejection, no-overwrite and selection checks retain their expected outcomes. |
| Original independent-review cases | New ordinary copied checkout `.analysis/coverage-fixes-review/checkout`; 57 fresh observations under its `.analysis/coverage-fixes-final-*`. Original syntax, extra syntax, CJS, require, mapped-class and option cases rerun. All non-finding comparison controls retain exactly the prior file/line sets. Required exclusions have precise reasons; require equality candidates are absent. Commands and assertions: `../commands-final.json`, `../verification-final.json`, `../verification-final.log`. |
| Original report mutations on new real copies | Private checkout `.analysis/coverage-fixes-final-report-mutations`: missing Istanbul statement count exits 1 with no stale output; missing native count exits 2/incomplete. The earlier empty-native-result diagnostic remains empty, which the CLI excludes; it is not accepted positive evidence. |
| Old implementation against new artifacts | `.analysis/coverage-fixes-old-normalizer-probes`: old normalizer wrongly accepts class, require and both missing-counter cases. New normalizer rejects the same inputs. The new native self-check also fails against the old sampler. |
| Legacy replay | `check-regression.py .analysis/mapped .analysis/coverage-fixes-legacy-replay` exits **1**, as its unchanged-evidence assertion no longer holds. The first observation is now explicitly incomplete with `main-native-load-audit-missing`. Old artifacts cannot prove the new audit and were not amended to pass. Fresh mapping and ownership runs replace this acceptance check. |
| TypeScript | `npm run typecheck:cached` and standalone strict `tsc` for `fixtures/ambiguous-class.ts` pass. |
| Scoped ESLint | `npm exec -- eslint scripts/test-coverage-pilot/fixtures/ambiguous-class.ts` reports the file ignored by configuration. **No effective lint verification.** |

Collection commands use the manifests and invocation forms in the operating guide; exact commands also remain in each run's `provenance.json`. The two existing guard scripts now accept fresh CLI `run-1`/`run-2` layouts as well as old prototype layouts. Known-line and rejection assertions are unchanged; the mapping checker writes a separate `mapping-line-index.json` instead of overwriting the CLI index.

Exploratory failures remain visible: `.analysis/coverage-fixes-adversarial-v1` exposed the missing main-worker exit event and failed its checker; `-v2` validated incremental receipts. A first private mapped command had an incorrectly grouped shell argument and exited 2 before collection; `mapped-v2.log` and the final explicit-argument run supersede it. No failed or excluded execution is counted as accepted.

Full application tests, whole-project lint, browser/build/package checks and dependency installation were not rerun for these repository-only tooling fixes. No Changeset is needed: these tools and developer documents are outside the npm allowlist. The reviewed source is being preserved as a Git checkpoint before the assertion-aware candidate study. The remaining boundary is deliberate: ambiguous native attribution and main-worker native project loads are excluded, not repaired through guessed counts; custom loaders, other runtimes and hostile instrumentation remain unsupported.

## Initial delivery (historical)

`python3 scripts/test-coverage-pilot/coverage.py setup|run` wraps the existing isolated runner and normalizer. It selects exact unique leaf titles, runs each test freshly, parallelizes independent jobs, preserves failed/skipped/unsupported observations, and produces the source-line index and deterministic overlap/containment candidates without manual per-case normalization. Repeated footprints must agree; incomplete or empty evidence never enters candidate calculations.

The work also adds locked isolated dependency setup, a collection-identity reporter, bounded job timeout handling, source/tool drift gates, a fixed-source builder argument for production modules, executable controls and an operating guide. No application feature or future reuse/extend/add advisor was implemented.

## Initial demonstrated run (historical)

From `ai1:~/src/pica-web`:

```sh
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/real-cases.json \
  --jobs 4 --repeat 2 --output .analysis/coverage-tool-demo-final
python3 scripts/test-coverage-pilot/check-results.py .analysis/coverage-tool-demo-final real
```

Both commands exited 0. The sample contains **16 real existing tests in six files, with 32 accepted fresh executions**. Repetitions had identical line sets. Results contain **2,012 original-source locations and 65 candidate pairs**: 60 partial overlaps, two directional containments and three equal sets. These are execution relations, not conclusions about assertions. Raw and normalized evidence occupies about 147 MiB; storage optimization and full-suite throughput were not attempted.

The files cover theme preferences, session search, pin persistence, project config, SessionList lifecycle and model catalog changes. This includes parameterized titles, filesystem state, a real `rg` subprocess, DOM simulation and async service behavior. The `rg` launch is recorded but its implementation is outside Node/project-source coverage.

## The real-module check found a correctness issue

The earlier mapped fixtures passed, but the first `src/shared/themePreference.ts` check showed that ordinary `v8-to-istanbul` original-line ranges could credit an unexecuted condition after an early return. Small uncovered operator gaps retained the enclosing function's count. Matching hashes and a reproducible source map did not fix this counter interpretation.

Native coverage now samples exact canonical statement starts through source-map segments and the innermost V8 range. Missing segments or conflicting generated positions are rejected, not interpolated. Evaluating a function expression is kept distinct from executing its body. Main-worker coverage still uses Vitest's normal Istanbul provider.

The final production-module check, `.analysis/coverage-tool-production`, contains **12 accepted observations across six cases**. Main/child/worker routes agree exactly:

- Valid preference: original lines 3, 5, 9–14 and 18.
- Early return: original lines 3, 5, 9 and 18; the later condition at line 13 is absent.
- The unused `requireDefaultThemePreference` body is absent in every case.

The fixed build is `.analysis/coverage-tool-build`. Generated JavaScript is not mixed into the original-source index. The run retains original/generated/map hashes, deterministic compiler rebuild checks and native process/thread/map origins. This validates the small real module and controls, not every TypeScript lowering construct.

## Initial verification results (historical)

All paths below are on AI1. Every destination was new. Failed exploratory directories remain separate.

| Check | Result |
| --- | --- |
| `coverage.py setup` | Pinned isolated installs and provider link verified; root manifests unchanged. |
| `check-cli.py` | Selection, unsupported options, exclusion, drift and deterministic candidate arithmetic passed locally and on AI1. |
| `check-native-points.mjs` | Native point/range, missing-segment and ambiguous-position guards passed. |
| Fresh real sample + `check-results.py … real` | 32/32 accepted; index/candidate calculations independently checked. |
| Production build/run + `check-results.py … production-map` | 12/12 accepted; exact known main/child/worker source lines verified. |
| `.analysis/coverage-tool-controls` + `check-results.py … controls` | 40 executions: 26 positive observations, 10 deliberately incomplete and four empty observations. Five incomplete tests and two empty controls excluded; ownership, cache initialization, awaited cleanup, nested lineage and suppression/termination/audit-removal checks passed. Collector exit 2 was expected. |
| `check-operational.py .analysis/coverage-tool-operational-v3` | Empty evidence, timeout, unsupported query-bearing native source, no-overwrite behavior and nine selection cases passed their expected outcomes. Deliberate exclusions returned 2; attempted overwrite returned 1 and preserved prior output. |
| `check-regression.py .analysis/mapped .analysis/coverage-cli-mapped-regression-v2` | All 32 saved observation statuses, diagnostic kinds and line sets unchanged. Artifact replay, not new test execution. |
| `check-mapped.py .analysis/coverage-cli-mapped-regression-v2` | Known mapped lines and missing registration/inventory, compiler/hash mismatch and coherently shifted map rejection passed. |
| `check-regression.py .analysis/worker-audit .analysis/coverage-cli-worker-regression-v2` | All 48 saved observation statuses, diagnostic kinds and line sets unchanged. |
| `check-unifier-guards.py .analysis/coverage-cli-worker-regression-v2` | Missing closure/launch/parent/report/audit, unsupported mapping/exec form, source drift and stale-output invalidation passed. |
| `check-worker-audit.py .analysis/coverage-cli-worker-regression-v2` | Worker lineage, suppressed instrumentation, termination and earlier real-test footprints passed. |
| Python AST parse, JSON parse and `node --check` | Analysis-tool syntax checks passed. |
| `npm run typecheck:cached` | Passed on AI1. |
| Standalone TypeScript check below | Passed for all three added test fixtures. |
| Scoped ESLint below | **Ignored all three fixtures** because the repository config does not include experimental scripts. This is not lint verification. |
| Documentation paths/links, whitespace, source synchronization | Checked locally and against the synchronized AI1 files. |

Standalone fixture and scoped lint commands:

```sh
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution Bundler --types node \
  scripts/test-coverage-pilot/fixtures/selection.spec.ts \
  scripts/test-coverage-pilot/fixtures/operational.spec.ts \
  scripts/test-coverage-pilot/fixtures/production-mapped.spec.ts
npm exec -- eslint \
  scripts/test-coverage-pilot/fixtures/selection.spec.ts \
  scripts/test-coverage-pilot/fixtures/operational.spec.ts \
  scripts/test-coverage-pilot/fixtures/production-mapped.spec.ts
```

Full suite, whole-project lint, browser, build/package and installed-package checks were **not run**. Changes are confined to repository-only analysis tooling, fixtures and developer docs; they do not ship in the npm allowlist. No Changeset was added.

## Exploratory failures retained

- `.analysis/coverage-cli-real-v1`: one hand-selected parameterized title used `[]`; Vitest expands that row to `undefined`. Both zero-match observations were rejected. The manifest was corrected; the final run accepted all 16 identities.
- `.analysis/coverage-cli-production-v1`: exposed the early-return overcredit and unwanted collector-preload lines after expanding the source inventory. The exact-point adapter and explicit infrastructure exclusion corrected these. `production-v2` and the final production run passed known-line assertions.
- Initial `coverage-cli-{mapped,worker}-regression` roots: the new inventory guard first rejected the collector preload missing from old inventories. The infrastructure exclusion was moved before the project-source guard. The first replays and follow-on checks on their incomplete roots failed; `-v2` replays and all guards passed.
- The first control result-checker incorrectly required the intentionally empty background-observer control to be eligible. It now explicitly verifies its empty exclusion and attributes the drained background line only to its owner. Collection itself correctly excluded the empty case.
- `.analysis/coverage-tool-operational` and `-v2`: exploratory native `.ts` execution failed before coverage validation. AI1's Node build has no compiled-in TypeScript stripping, even with the flag. The final operational control instead executes a query-bearing JavaScript import and verifies that coverage rejects that unsupported mapping. No runtime or loader was installed to force the earlier experiment through.

## Initial handoff and remaining limits (historical)

Local `/Users/br/src/pica-web` on `docs/test-redundancy-analysis` is authoritative; the analysis scripts and changed docs are synchronized to AI1 `/home/br/src/pica-web` on `analysis/per-test-coverage`. Both retain production revision `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`. Work remains uncommitted and unpushed. Earlier uncommitted work and evidence were preserved; raw replay inputs are hard-linked and must not be edited.

Root package manifests and production source were unchanged on both hosts. AI1 sessiond/web PIDs 6819/6821 still had their original October 30 start times at final inspection. No deployment, service restart/stop, worktree, external publication or test deletion occurred.

The boundary remains narrow: parent instrumentation is required for worker discovery; nonzero worker exits are conservatively rejected; other runtimes/binaries, browsers, arbitrary detached/late work, custom loaders and hostile instrumentation mutation are not proven complete. Exact-point mapping still depends on the pinned compiler and V8 behavior. Jobs share host resources and are not a sandbox. Large runs can consume substantial storage and candidate memory. See the operating guide before widening the sample; no overlap result establishes safe removal.
