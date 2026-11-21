# Step 1 results: per-test coverage pilot on AI1

Step 1 of the [coverage-first plan](test-redundancy-analysis.md) was executed as a bounded session-search pilot on 2026-11-19. The collector produced stable per-test source evidence. No redundancy recommendations, test removals, or service changes were made.

Follow-up: [broader validation](test-redundancy-broader-validation.md) found order/timing-sensitive coverage and demonstrated that repeatable time-window attribution can still mislead. This report preserves the initial pilot; use the follow-up for current suitability and limitations.

## Scope and environment

- Checkout: `ai1:~/src/pica-web`, cloned from the fork at `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`.
- AI1 branch: `analysis/per-test-coverage`. Analysis tooling and this report are uncommitted additions; production source and the root package manifests remain unchanged.
- Host: Linux x86-64, AMD Ryzen AI MAX+ 395, 16 physical cores / 32 threads, 122 GiB RAM, local NVMe storage. About 88 GiB RAM was available at preflight.
- Node `22.22.1`, npm `11.11.0`, Vitest `5.0.4`, `@vitest/coverage-istanbul` `5.0.4`.
- Nine tests in three files: the session-search engine, daemon search route, and happy-dom search dialog. This is not the full repository suite or the separate Playwright/browser-profile suite.
- Each benchmark run had separate HOME, TMPDIR, XDG paths, PI WEB data/config paths, and daemon socket path. Tests used their fixtures, not real session history. No application service was started or restarted. Existing AI1 web and session-daemon PIDs and start times were unchanged at completion.

## Collector choice and boundary

Stryker's [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) uses its own per-test mutation coverage and disables ordinary code-coverage reporting. That is useful for later mutation experiments, but is not already the source-location map required here. Teamscale's individual Vitest-case integration remains unverified; no commercial product was installed.

The pilot uses Vitest's existing Istanbul instrumentation and source-map libraries. A small custom runner captures counter differences around each test's execution. It does not implement its own instrumenter or TypeScript mapping algorithm. The runner calls the existing `TestRunner.getTestFn()` wrapper, preserving test-context and fixture behavior.

Three phases are recorded separately:

1. **Setup:** work between task start and the test-function wrapper.
2. **Body:** execution inside the test-function wrapper, including awaited asynchronous work.
3. **Teardown:** work after the wrapper until task completion.

Module imports and suite-level setup outside those boundaries remain in the aggregate coverage report, not in a test's body map. Dynamically imported code or fixtures executed inside the test wrapper are body-time execution, not proof that assertions verify them. Istanbul collects only instrumented JavaScript in the worker; native tools and separately spawned processes are not covered.

Tests within a worker must be sequential; explicit concurrent tests and retries/repeats are rejected. Separate files can run in isolated fork workers in parallel. Counter resets or changed coverage identities fail collection rather than silently producing plausible results. Background work left running by a previous test can still contaminate attribution: repeatability is evidence of stability, not a proof of ownership.

Raw phase records are remapped to original TypeScript statement, function, and branch-arm locations. Normalized evidence contains source hashes, test identities and expanded parameterized names, source positions, environment, duration, phase-specific location IDs, and a location dictionary. The normalizer checks accepted records against the runner's independent JSON results and refuses failed or incomplete runs.

## Verification

The collector-control fixture passed assertions for:

- Separating setup, body, and teardown functions.
- Keeping import-time execution in aggregate coverage but out of per-test phases.
- Distinct parameterized cases and branch arms.
- Awaited asynchronous execution.
- A deliberately throwing test body, using Vitest's expected-failure mechanism.
- No fabricated record for a skipped test.
- Correct original TypeScript coordinates after removal of type-only lines.

A separate negative probe added a concurrent test. It exited **1**, as expected, with `Per-test coverage requires sequential tests within each worker`. This was a deliberate rejection check, not a passing ordinary test run.

All **12 final benchmark runs passed all nine tests**, without skips: baseline and collection, two repetitions each at one, two, and three workers. All six collections produced identical source hashes, test identities, and phase-specific location sets after excluding durations.

The evidence contains:

- 60 loaded source files in the source-hash catalog.
- 569 observed locations across all test phases: 325 statements, 66 functions, and 178 branch arms.
- 467 locations in test bodies, across 11 production source files. The remaining loaded files do not necessarily have body-time execution.
- About 4.74 MB of raw per-test records per run, normalized to about 218 KB. Raw records repeat source-map metadata; this representation is suitable for a pilot, not yet optimized for the full suite.

JavaScript syntax checks, Python syntax checking, production-source/package-manifest diff checks, and the six-run stability check passed. Full-suite tests, full-project lint/typecheck, browser tests, and build/package checks were not run: no production behavior changed. These results do not certify other platforms or collectors.

## Performance observations

These are short, sequentially scheduled samples on a lightly loaded machine, not statistically robust throughput estimates. The final benchmark followed initial validation runs and used warm caches; OS caches were not forcibly flushed.

| Workers | Baseline wall time | Collection wall time | Collection CPU time, user + system |
| --- | --- | --- | --- |
| 1, first sample | 1.55 s | 1.85 s | 2.40 s |
| 1, repeat | 1.24 s | 1.74 s | 2.29 s |
| 2, two samples | 0.80–0.81 s | 1.39–1.40 s | 2.27–2.31 s |
| 3, two samples | 0.68–0.69 s | 1.09–1.12 s | 2.21–2.30 s |

Source-map normalization is measured separately: **0.19–0.21 seconds** per collection. Thus the three-worker end-to-end collection plus normalization took **1.30–1.32 seconds**, versus **0.68–0.69 seconds** for baseline execution.

GNU time reported maximum RSS of about **239–246 MiB** for two/three-worker collection runs, versus **165–173 MiB** for the comparable baseline runs. This is GNU time's maximum-RSS accounting, **not a sampled simultaneous sum of all worker memory**.

Warm runs had essentially no filesystem input blocks. Collection reported about 16.5 MiB of filesystem output versus about 9.1 MiB for baseline, calculated from Linux's 512-byte `ru_oublock` units. The test fixtures themselves include a roughly 9 MiB transcript. These counters are not physical-device throughput or flush-time measurements; buffered output may reach storage later.

The measurements support CPU/transformation/serialization overhead over disk-read throughput as the main added cost in this pilot. They do not demonstrate CPU saturation, establish a full-suite bottleneck, or justify launching 32 workers. There are only three test files; three workers is the useful limit for this sample.

## Artifacts and reproduction

All raw data remains on AI1 under `~/src/pica-web/.analysis/`, excluded through that clone's `.git/info/exclude`:

- `provenance.json`: revision, runtime versions, host facts, root/collector lockfile hashes, and tooling checksums.
- `tools/package.json` and `tools/package-lock.json`: isolated collector dependency installation. The repository's locked dependency tree was restored with `npm ci` before measurement.
- `control/`: successful collector-control run, aggregate coverage, normalized evidence.
- `control-negative/`: expected concurrent-test rejection log.
- `pilot/metrics.json`: all 12 execution measurements.
- `pilot/{baseline,coverage}-w{1,2,3}-r{1,2}/`: test JSON reports, logs, GNU time metrics; collection directories also contain raw records, aggregate coverage, normalized evidence, and normalization metrics.
- `benchmark.log`: final orchestration output.
- `pilot-initial-missing-environment/` and corresponding initial control/log artifacts: superseded first measurements. Inspection found that the runner's config did not expose the resolved per-file environment, so those records omitted it. The collector now reads the pinned worker-state API and the validators explicitly check Node versus happy-dom. All controls and benchmarks were rerun after that fix; only `.analysis/pilot/` is accepted final evidence. An outer zsh wrapper also failed after the initial benchmark by assigning its reserved `status` variable; subsequent orchestration used Bash and checked actual process exit codes.

Tooling lives in [`scripts/test-coverage-pilot/`](../../scripts/test-coverage-pilot/). From the existing AI1 checkout:

```sh
node scripts/test-coverage-pilot/check-control.mjs .analysis/control
node scripts/test-coverage-pilot/check-stability.mjs .analysis/pilot
```

To recreate the isolated provider installation using its saved lockfile:

```sh
npm ci
npm ci --prefix .analysis/tools
mkdir -p node_modules/@vitest
ln -s ../../.analysis/tools/node_modules/@vitest/coverage-istanbul node_modules/@vitest/coverage-istanbul
npm run generate:material-icons
```

For a new checkout without that saved dependency manifest, initialize `.analysis/tools` with a private package manifest, then install exact `vitest@5.0.4` and `@vitest/coverage-istanbul@5.0.4` there, preserving its generated lockfile. Do not install the experimental provider into the root package: an exploratory `npm install --no-save` changed transitive dependencies; that tree was discarded and restored before any measurements.

`python3 scripts/test-coverage-pilot/benchmark.py` runs and validates all 12 samples and normalizes each collection. It intentionally refuses to overwrite an existing `.analysis/pilot`; preserve the previous directory before rerunning. The `.analysis/control` checks are run separately. Provider installation and generated outputs are not checked into the repository.

## Next decision

The collection method is viable for this subsystem. Before a full-suite run, use a broader representative sample to test background-task attribution, tests that reset modules or mock globals, runtime skips, fixture-heavy tests, memory scaling, and provider behavior in other environments. The prototype is intentionally pinned to Vitest 5.0.4's coverage-store and runner APIs.

Step 2 can use this pilot's normalized evidence for candidate discovery, but **no overlap or containment result is yet a removal recommendation**. Asserted behavior and failure protection still need the later review stages.
