# Unified source-line index and completeness checks

Completed on AI1, 2026-11-19 local time (artifacts extend into November 20 UTC), following the [isolated collection experiment](test-redundancy-isolated-collection.md).

Follow-up: [parent-side worker discovery](test-redundancy-worker-audit.md) now detects workers that suppress their own hooks, with nested-worker and lifecycle checks. The limitations below describe this earlier experiment; use the follow-up for the current worker boundary.

The experiment now produces a **common source-line-to-tests index** from main-worker Istanbul coverage and descendant V8 coverage. It preserves source hashes and provider/process provenance, and excludes observations that fail completeness checks. Linux OS launch auditing additionally detects a Node child that suppresses every collection hook, without requiring a declared expected source.

This is a bounded reference pipeline, not a generally complete collector. In particular, worker-thread discovery remains preload-based, and supported descendant source mapping currently covers plain JavaScript rather than arbitrary transformed scripts.

## Common representation

The common unit is an **original-source executable statement-start line**. For the main worker, line hits come from the normal remapped Istanbul report. For native descendants, `v8-to-istanbul` 9.3.0 converts V8 ranges; the adapter retains only canonical executable statement-start lines. It reuses the primary report's statement definitions when available, otherwise derives them with the existing Istanbul instrumenter for supported JavaScript.

This avoids treating every syntactic line in a V8 range, such as a closing brace, as an additional independent executable location. It does not make statement/branch metrics identical across providers. Multiple statements on one line remain one line-level observation, and branch distinctions can be lost at this common granularity. Original branch/function reports remain available; the tool does not merge their IDs or sum unlike execution counts.

Every output line retains its provider, artifact path, and process/thread context. Production sources and the selected test's source must match a manifest captured before execution. Unknown native transformations, query-bearing source URLs, and native source-map directives are rejected as unmapped rather than guessed. Original TypeScript from the main worker remains supported through Vitest's existing remapper.

## Verified shared attribution

The index entry for `scripts/test-coverage-pilot/fixtures/child-subject.mjs:1` lists exactly:

```text
child
main-shared
thread
```

These are three independent tests that execute the same helper through a child process, the main test worker, and a worker thread. The native and main-worker adapters agree on the source location.

Additional assertions verify that:

- Both left/right tests own the shared condition line, while the right-only return line is not credited to the left test.
- Both isolated cache consumers receive initialization coverage.
- Deferred work drained in A's cleanup is credited to A, not B.
- Positive normalized line sets and provider classifications remain identical across sequential and parallel repetitions.

The primary index contains **1,744 locations across 13 accepted tests**, backed by 52 accepted observations. Its source-hash catalog contains 122 production/fixture/test files. The readable index is about 340 KB; it is not a compressed storage benchmark.

## Completeness is a gate, not an assumption

The collector writes `scope-complete` or `incomplete`, with reasons. `scope-complete` means the observation satisfied the **specified source/Node execution boundary**, not that every possible process or runtime was observed. Every result explicitly records `exhaustiveDescendantDiscovery: false`.

The boundary checks are:

1. Exactly one selected test passed, with the expected file and title.
2. The main worker registered itself and produced its normal aggregate report.
3. Each observed Node descendant has a coverage artifact and an exit receipt.
4. Declared native source expectations, when used, have positive observed execution.
5. With OS auditing enabled, successful launches of the selected Node executable match registered contexts.
6. Referenced source hashes and native mappings are valid.

Incomplete maps are saved for diagnosis but return exit code **2** and are excluded from the accepted index. Invalid inputs/source drift fail rather than leaving an old accepted output behind. Unified outputs and context receipts use atomic writes.

### Deliberately missing coverage

Two test cases intentionally pass their application assertions while making their coverage unacceptable:

- **Suppressed child:** the child executes the helper successfully but clears both `NODE_OPTIONS` and `NODE_V8_COVERAGE`.
- **Killed child:** the child executes the helper and then kills itself with SIGKILL before orderly shutdown. The parent asserts that result.

The first declared-expectation experiment rejected both cases. The killed child sometimes left a partial native report; a report's existence alone was not enough, and the missing exit receipt caused rejection.

### OS launch audit

AI1 already had `strace` 6.19. The follow-up wraps each isolated job with:

```text
strace -ff -qq -e trace=execve,execveat
```

The audit follows the job's process tree and records successful executions. A launched Node PID without a corresponding preload registration produces `node-launch-unregistered`. This caught the suppressed child in all four repetitions **after removing every declared native-source expectation** from those cases.

The parser currently supports the ordinary successful `execve` form used by these jobs. An unrecognized successful exec form, unresolved executable, or multiple Node re-execs in one PID prevents acceptance. Non-Node executables remain recorded but are outside the selected-Node coverage boundary. The tracer is attached only to the newly launched test jobs, not existing services.

This improves process discovery independently of coverage hooks. It does not identify every uninstrumented worker thread: worker threads do not execute a new Node binary through `execve`. A worker that suppresses both its preload and its coverage can still evade this discovery mechanism. That is a remaining correctness requirement before claiming exhaustive collection.

## Experiments and results

### Unified conversion

Fifteen cases ran twice sequentially and twice with four independent jobs: **60 successful selected-test executions**. Thirteen cases per batch were accepted; the two intentional incomplete cases were rejected each time:

- 52 accepted observations.
- 8 intentionally incomplete observations excluded from the index.
- All accepted line sets/provider classifications stable across the four batches.

Collection took 15.40–15.61 seconds per sequential batch and 4.76–6.04 seconds with four jobs. Conversion is a separate step; the first complete conversion of all 60 observations took about 11.6 seconds, including a separate Node startup for each artifact directory. These are small experimental samples, not throughput guarantees.

### OS-audited follow-up

Five cases (main/shared helper, child, worker, suppressed child, killed child) ran in the same four-batch pattern: **20 successful test executions** with no declared native-source expectations.

- 12 observations accepted.
- 8 intentionally incomplete observations rejected.
- Suppression detected from an unregistered Node launch, not an expected-source declaration.
- Positive line maps matched the corresponding non-traced runs.

Five-case batch time was 4.50–4.96 seconds sequentially and 1.85–1.86 seconds with four jobs. The set differs from the fifteen-case experiment, so these are not direct tracing-overhead comparisons.

Across both final experiments, application assertions passed in all **80 executions**, while **16 observations were correctly excluded as incomplete**. “Tests passed” and “coverage accepted” are separate outcomes.

## Additional rejection checks

Copied artifacts, not original evidence, exercised these failure paths:

- A missing descendant exit receipt despite a present coverage report.
- A transformed/query-bearing native source URL without a validated mapping adapter.
- An unsupported successful `execveat` audit record.
- Changed production-source or selected-test hashes.
- A stale accepted output left from an earlier normalization attempt.

The checks passed: incomplete cases returned 2; source drift failed and removed the stale accepted output. No assertions were weakened to make the probes pass.

## Implementation observations

An ESM `--import` preload did not register the eval-based worker-thread control in this setup. The native coverage still existed, but context registration did not. Switching the registration hook to CommonJS `--require` registered that worker correctly. This is an observed Node 22.22.1/Vitest setup result, not a general claim about every preload mode.

One exploratory run left an empty main-worker exit receipt during teardown. Receipts are now atomic. Main-worker completion is established by Vitest's successful run and aggregate report, not by assuming its process-exit hook necessarily completes before the pool terminates it. Descendants still require their exit receipts. Exploratory runs remain separate from accepted evidence.

Node's compile cache remains disabled for coverage precision. The only new dependency, `v8-to-istanbul` 9.3.0, is installed under `.analysis/converter` with its own lockfile. Root package manifests, production source, and existing application tests remain unchanged.

Sources: [v8-to-istanbul usage](https://github.com/istanbuljs/v8-to-istanbul), [Node coverage propagation](https://nodejs.org/docs/latest-v22.x/api/cli.html#node_v8_coveragedir), [Node compile-cache caveat](https://nodejs.org/docs/latest-v22.x/api/module.html#module-compile-cache).

## Remaining requirements

- Inventory worker creation independently of the worker's own instrumentation, then reconcile those workers with coverage and lifecycle records.
- Define behavior for other runtimes/executables and arbitrary detached or late-running work. Node launch tracing alone is not a universal execution inventory.
- Validate adapters for transformed descendant code and original-source maps; do not accept unsupported formats silently.
- Consider stronger filesystem/network isolation for tests with broader host effects. The jobs still share the checkout, dependencies, user identity, and host OS.
- Keep lifecycle/import/setup coverage distinct from asserted protection when this index later supports redundancy analysis or the future agent test-advisor idea.

These checks do not prove immunity to deliberate profiler manipulation, and source-line execution does not establish assertion equivalence. No test deletion or automatic “test unnecessary” decision has been attempted.

## Artifacts and reproduction

Checkout: `ai1:~/src/pica-web`, branch `analysis/per-test-coverage`, production revision `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`. Node 22.22.1, Vitest/Istanbul 5.0.4.

Accepted artifact directories:

- `.analysis/unified/`: sixty-case experiment, about 212 MiB. `line-index.json` is the accepted line-to-tests index; `source-hashes.json` records pre-run source identity; each job contains `unified.json`, raw coverage, context receipts, commands, and logs.
- `.analysis/traced/`: twenty-case OS-audited experiment plus copied rejection probes, about 79 MiB at measurement. Includes per-PID `execve.*` logs and `validation.json`.
- `.analysis/converter/`: isolated conversion dependency and lockfile.
- Both experiment roots contain `provenance.json` with runtime/tool/source identity.

Exploratory artifacts are retained under `.analysis/unified-esm-preload-probe/` and `.analysis/unified-nonatomic-receipts/`, not mixed into the index.

From the existing AI1 checkout:

```sh
# Validate/rebuild the index from accepted per-job outputs.
python3 scripts/test-coverage-pilot/check-unified.py .analysis/unified

# Normalize one job. Exit 2 means explicitly incomplete, not accepted.
node scripts/test-coverage-pilot/unify-coverage.mjs \
  .analysis/traced/jobs4-r2/child .analysis/traced/source-hashes.json

# Collect a new OS-audited experiment; output must not already exist.
python3 scripts/test-coverage-pilot/isolation-experiment.py \
  .analysis/traced-next scripts/test-coverage-pilot/traced-cases.json traced
```

The last command collects raw evidence; normalize each job separately, then inspect status. `check-unifier-guards.py` creates `adapter-probes` inside the supplied traced artifact root and refuses to overwrite it; preserve the prior probe directory before rerunning.

All final selected-test executions, index assertions, and rejection checks passed their stated expectations. JavaScript/Python syntax, documentation links, whitespace, and unchanged production/package manifests were checked. Full-suite, browser-profile, build/package, and full-project static checks were not run. No live service was changed. New work remains uncommitted and unpushed.
