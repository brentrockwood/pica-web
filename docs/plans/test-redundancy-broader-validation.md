# Broader collection validation: what the process taught us

Completed on AI1, 2026-11-19, following the [nine-test pilot](test-redundancy-step-1.md). Brent asked to prioritize learning about the method over conclusions about particular tests. No test was removed or changed, and no redundancy recommendation was made.

Subsequent decision: Brent rejected this collector's time-window attribution as unfit for the intended purpose. The [isolated collection experiment](test-redundancy-isolated-collection.md) supersedes the recommendation below to optimize its representation first.

The collector is useful for **candidate discovery with uncertainty attached**. It is not yet a trustworthy basis for claiming that a test has no unique protection. The important boundary is execution during a test's time window versus behavior actually verified by that test.

## Experiments

The [selection manifest](../../scripts/test-coverage-pilot/broader-files.json) contains 21 files: session lifecycle, persistence, subprocess management, module reload/mocking, configuration/filesystem behavior, DOM components, and asynchronous controllers, plus the original search pilot. It contains **297 cases: 295 passed and two Windows-only cases skipped on Linux**.

We ran:

- Baselines at one, four, and eight workers, plus two shuffled-order baselines.
- Six successful instrumented runs: one worker, four workers twice, eight workers, and four workers with shuffle seeds 17 and 29.
- Six selected real tests individually, comparing each with its grouped execution.
- Controlled examples for delayed work, shared caches, module reload, first-use dynamic import, subprocesses, and worker threads.
- Negative probes for runtime skips, retry configuration, and empty evidence.

All **11 successful grouped runs** had exactly the same passing/skipped test inventory. There was also an initial failed collection, described below; it is not included as a successful run. Production source and root package manifests remain unchanged at revision `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`.

## 1. Repeatability is necessary, but insufficient

A controlled pair makes this visible without relying on timing luck:

- Test A starts an async operation that waits on an unresolved promise, then finishes.
- Test B releases that promise and awaits the operation.
- The production helper executed after the wait is attributed to B, not A.

The same map appeared in both repeated runs. Running B alone produced no body-time production coverage. The collector correctly measures **when** code executed, but does not establish **which test caused or owns** that work. This is not proof that a real test is wrong; it is a demonstrated limit of time-window attribution.

The real sample also had small timing-sensitive differences. A session activity refresh branch varied around an awaited operation, and subprocess tests sometimes exercised termination fallback or already-settled callback paths. These are plausible scheduling differences based on the source; the experiment does not prove the precise cause of every difference.

**Consequence:** stable results are useful evidence, not a causal guarantee. Background work and asynchronous cleanup need explicit qualification. Moving to more cores cannot solve that attribution problem.

## 2. Shared initialization moves between tests

Shuffling order changed which tests executed lazy initialization. Concrete examples:

- Localization formatter construction in `src/client/src/localization/service.ts`.
- The shared builtin-extension factory promise in `src/server/sessions/builtinExtensionFactories.ts`.

When a later consumer ran alone, it acquired the initialization coverage previously performed by an earlier test. The assertions and behavior under test had not changed.

Against the first four-worker collection:

| Comparison | Tests with changed phase-specific locations |
| --- | ---: |
| One worker | 1 / 295 |
| Four workers, repeat | 1 / 295 |
| Eight workers | 2 / 295 |
| Shuffled, seed 17 | 14 / 295 |
| Shuffled, seed 29 | 6 / 295 |

Across these comparisons, **18 distinct tests varied; 277 remained identical in the observed runs**. The numbers describe this sample, not a general error rate. Three of the six individually run tests differed from their grouped maps: two acquired initialization coverage, and one differed on an async activity-refresh branch.

**Consequence:** “this is the only test that covers these lines” may mean “this happened to be the first consumer.” Likewise, a later consumer can appear subsumed simply because its dependencies were already initialized. Do not discard initialization coverage globally; classify it and avoid treating incidental first-use ownership as a removal argument.

A useful next-stage representation would distinguish a repeatedly observed core from variable locations, retaining both rather than silently replacing the evidence with their intersection. Even the core remains execution evidence, not assertion equivalence.

## 3. Zero observed coverage can accompany useful assertions

Two controls asserted successful execution in a separate child process and a worker thread. Both passed. Both had **empty body-time production maps** because Istanbul instrumentation in the Vitest worker did not extend into those execution contexts.

This differs from a test that performs no meaningful verification. It is a visibility limit. Native tools, external services, and separate browser processes need their own collection boundaries too; those were not newly instrumented here.

**Consequence:** never rank an empty map as automatically redundant. Track what was observable and whether the test crosses an uninstrumented boundary.

## 4. Validate the evidence pipeline, not just test exit codes

The broader run exposed two collector/harness assumptions:

### Lazy imports

The initial instrumented run failed the builtin-extension suite before its first test. The collector required Istanbul's global store to exist at task entry, but the suite deliberately imports its first production module inside the test after setting mocks.

The fix treats an absent initial store as an empty baseline. Coverage-file disappearance and counter reset still fail collection. A dedicated first-import control now passes, as do the four real module-reset/mocking tests. The original nine-test pilot's evidence remained unchanged after the fix.

### Empty selections

The first attempt to run individual nested tests used the JSON reporter's space-delimited full names in an anchored CLI filter. Vitest filters nested names with ` > ` separators, so all tests were skipped while the process exited zero.

Those six attempts are retained as **invalid empty selections**, not successful comparisons. The filters were corrected to match unique title suffixes, each replacement was checked to execute exactly one test, and the comparisons were rerun. The harness and normalizer now reject empty evidence; the comparator rejects zero matching identities and changed source hashes. A small assertion-based check verifies those failure boundaries.

Tests are compared using file, expanded name hierarchy, and source location, with identity/environment checks—not merely array position or total counts. Durations are excluded from coverage stability comparisons.

### Explicit limits retained

Configured retries and concurrent tests remain unsupported. Runtime skips also need work: a skip can bypass the runner's completion hook and leave active attribution state behind, causing the next test to fail the sequential-execution guard. A baseline runtime-skip control passed; its instrumented counterpart failed as expected. We did not silently disable or skip these categories to make collection green.

**Consequence:** runner success, expected inventory, evidence completeness, source revision, and comparison cardinality are separate checks. A green command is not enough.

## 5. Representation and normalization dominate scaling

AI1 still runs the tests quickly. The prototype does substantially more work than the tests themselves because it repeatedly clones and serializes complete coverage maps, then repeatedly remaps their source coordinates.

| Workers | Baseline | Collection | Normalization | Collection + normalization |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8.22 s | 36.71 s | 13.60 s | 50.31 s |
| 4 | 3.01 s | 10.54 s | 13.53 s | 24.07 s |
| 8 | 1.55 s | 9.29 s | 13.56 s | 22.85 s |

These are individual observations, not statistically robust estimates. The four-worker baseline was the initial baseline and included cold work; later samples used warm caches. The second four-worker collection also took 10.54 seconds. Shuffle changes also change scheduling, so those runs are not directly controlled performance comparisons.

At eight workers, collection used about 52.6 CPU-seconds; normalization used another 20.8 CPU-seconds. Warm successful collections reported essentially no filesystem input blocks. Maximum RSS from GNU time was roughly 584–673 MiB across the successful unshuffled collections; this is not simultaneous summed worker memory. The initial cold, failed collection reached about 1.56 GiB.

One successful collection wrote about **975 MB of raw test records**, normalized to **12.8 MB**. An inventory of the raw representation found:

| Quantity | Observed value |
| --- | ---: |
| Repeated file/phase entries | 29,746 |
| Entries containing any executed counter | 2,972 |
| Distinct coverage-definition variants | 205 |
| Unique definitions, serialized once | 6.02 MB |
| Nonzero counters referencing those definitions | 1.47 MB |
| Estimated definitions plus sparse counters | 7.49 MB |

The estimate excludes small test-metadata/index overhead and does not benchmark a rewritten collector. It nevertheless demonstrates that almost all current raw volume is repetition, not irreducible evidence. Definitions must be keyed by their content, not just source filename: different transformed variants can exist for one source.

**Consequence:** before a full-suite collection, store static definitions once and per-test execution separately, then investigate reusable source mapping. Verify equivalent evidence before accepting an optimized representation. More workers alone barely help once serial normalization dominates. Four to eight workers is sufficient for the next bounded experiment; this sample gives no reason to use all 32 threads.

## Practical boundary for the next phase

Proceed with evidence-backed candidate discovery only if the results retain these distinctions:

- Stable versus variable observed execution.
- Test-body versus hook execution, with body-time fixture work still identified as execution rather than verification.
- First-use/shared initialization versus behavior specifically exercised by a test.
- Observed in-process code versus uninstrumented external execution.
- Valid evidence versus rejected/unsupported cases.

Do not use this collection to justify deletion automatically. The later assertion/precondition review remains necessary, and fault-injection evidence would address a different question: which defects the tests detect.

The next useful engineering experiment is **compacting the evidence representation while proving it preserves these maps**, rather than a full-suite run with the current nearly-gigabyte-per-sample format. Runtime-skip handling and explicit reporting of unobserved boundaries also remain open before general use.

## Artifacts and verification

All work ran in `ai1:~/src/pica-web` on `analysis/per-test-coverage`, with isolated HOME/temp/config/data/socket paths. Existing web and daemon PIDs/start times were unchanged. No deployment, service restart, or external model call was requested by the experiments.

Artifacts remain under `.analysis/broad/` on AI1, about 6.6 GiB at the end of collection:

- `baseline-*`, `coverage-*`: accepted grouped runs and GNU time measurements.
- `comparisons.json`: exact changed source locations for grouped and isolated comparisons.
- `isolated-*`: corrected single-test runs.
- `controls-r1`, `controls-r2`, `control-isolated-*`: controlled attribution demonstrations.
- `negative-*`: expected runtime-skip/retry failures and their successful baselines.
- `initial-coverage-w4`: failed first collection, not normalized or accepted.
- `empty-selection-*`: rejected earlier isolated attempts, retained for diagnosis.
- `representation.json`: storage inventory and sparse-representation estimate.
- `original-*-regression`: original pilot/control reruns; all nine pilot maps unchanged.
- `comparison-self-check.log`, `empty-selection-rejection.log`: evidence-validation checks.
- `provenance.json`: revision, tool/lockfile checksums, and environment details.

The original collector is preserved at `.analysis/pilot-tools-v1/` so the first pilot remains reproducible after the small harness fixes. Source files for the new experiments live under [`scripts/test-coverage-pilot/`](../../scripts/test-coverage-pilot/). The broader manifest is deliberately fixed, not a general suite-discovery framework.

Useful checks from the AI1 checkout:

```sh
node scripts/test-coverage-pilot/check-boundaries.mjs .analysis/broad
python3 scripts/test-coverage-pilot/check-comparison.py
node scripts/test-coverage-pilot/check-control.mjs .analysis/broad/original-controls-regression
```

A fresh individual experiment uses an unused output directory:

```sh
python3 scripts/test-coverage-pilot/run-experiment.py \
  .analysis/broad/new-run coverage 4 \
  scripts/test-coverage-pilot/broader-files.json
```

The output path must not already exist. Add `--sequence.shuffle --sequence.seed=17` for the shuffled variant. The run helper saves commands and selection, validates positive execution, and performs normalization only after a successful test run. For intentional rejection probes, inspect the saved log and verify the expected error rather than treating every nonzero exit as success.

All added JavaScript/Python files received syntax checks; collector boundary assertions, original-pilot regression checks, source/package diff checks, and local documentation-link/whitespace checks were run. Full-suite, build/package, and full-project lint/typecheck checks were not run: only experimental analysis tooling, fixtures, and documentation changed. New work remains uncommitted and unpushed.
