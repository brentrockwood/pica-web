# Isolated collection experiment

Completed on AI1 on 2026-11-19. This follows Brent's rejection of the [time-window collector](test-redundancy-broader-validation.md) as unsuitable for accurate test attribution. The experiment tested a fresh execution per selected test, parallelized across independent jobs. It did not optimize the old collector or attempt test removal.

Follow-up: the [unified-index experiment](test-redundancy-unified-index.md) combines the main/descendant formats at source-line granularity and adds completeness gates plus an OS-audited subprocess probe. Use that report for the current boundary and remaining gaps.

## Result

**Fresh-process isolation passed the controlled attribution checks.** Twelve cases ran in four batches: two sequential batches and two batches with four concurrent jobs, for 48 successful selected-test executions. All 12 main-worker execution footprints matched across the four batches, and the expected native descendant coverage was present only in the appropriate jobs.

| Question | Observed answer |
| --- | --- |
| Do two tests executing the same function both receive its coverage? | Yes. The independent left/right cases both recorded `choose`, with their own branch execution. |
| Does shared initialization still belong only to the first test? | No. Both independently executed cache consumers recorded `fillCache`. |
| Can work from A land in B's map? | Not in the control. A's delayed work was released and awaited in A's `afterAll`; A recorded `backgroundOnly`, while B's separate execution did not. |
| Are setup and cleanup included? | Yes. The standard aggregate included import, `beforeEach`, `afterEach`, and awaited `afterAll` work. |
| Are child-process and worker-thread functions observable? | Yes. Native V8 reports recorded `childOnly` once in the child case and once in the thread case, with the same original-source offsets. |
| Do real fixture-heavy tests behave consistently? | The selected session-list lifecycle and model-catalog cases had identical main-worker footprints across all four runs. |

B's standalone control intentionally has no pending work; it is a negative attribution control, not a proposed regression test. Full lifecycle execution also remains distinct from behavior verified by assertions.

## Execution boundary

Each job launches a new Vitest command, which creates a fresh isolated fork worker and selects exactly one test from exactly one file. The orchestration verifies the successful test's filename and title, not just process exit status. Each job has separate HOME, temp, XDG, PI WEB state/config/socket, Vite cache, and coverage-output paths.

The repository, installed dependencies, host OS, and user identity remain shared. This is process/state isolation for trusted tests, **not a security sandbox or complete filesystem/network isolation**. It does not protect against tests writing hard-coded host paths or affecting external services. Containers or microVMs remain options if a broader sample needs stronger isolation.

AI1 has accessible KVM, Docker, and Podman. None was used or installed for this experiment; no container or VM was launched. No live PI WEB service was started or restarted.

## Collection method

This experiment does not use the custom per-test runner from the earlier pilot.

1. **Main test worker:** ordinary Vitest 5.0.4 Istanbul coverage, remapped by the provider to original source. Because only one test executes, the aggregate belongs to that selected case's lifecycle. Module collection/imports and fixture hooks are included; this is not a body-only or assertion-only map. Imports needed to collect the containing file may also serve unselected tests.
2. **Node descendants:** `NODE_V8_COVERAGE` points to that job's private directory. The controlled child process inherits it, and the controlled worker thread emits its own native report. The checker verifies positive execution counts, original file URL, function name, and offsets against the actual source text. It checks the Node 22 filename's thread identifier as additional evidence for the worker case.
3. **Completion:** the controlled child and worker are explicitly awaited, and A's delayed work is drained by its fixture's `afterAll`. Artifacts are inspected after the Vitest command exits.

This avoids moving one test's unfinished work into another test's counters. It does **not** yet establish a generic rule that all arbitrary background work or detached descendants have completed. The main Istanbul report is taken at Vitest's coverage boundary, not after every conceivable later callback.

Native coverage is not automatic for non-Node children, children that strip the coverage environment, hard-killed processes that cannot flush, or separate browser contexts. Those boundaries still need explicit instrumentation or an incomplete-coverage result. The experiment proved the selected Node controls, not universal descendant coverage.

### Precision precaution

Node documents that its compile cache can reduce V8 coverage precision. The final runs therefore set `NODE_DISABLE_COMPILE_CACHE=1`. An initial exploratory run with a per-job compile-cache directory is retained separately and is not the accepted result set. OS caches and reusable transformation work were not forcibly cleared, so these are not cold-machine timing measurements.

Sources: [Node coverage environment](https://nodejs.org/docs/latest-v22.x/api/cli.html#node_v8_coveragedir), [module compile-cache caveat](https://nodejs.org/docs/latest-v22.x/api/module.html#module-compile-cache).

## Time and retained data

| Batch | Independent jobs | Twelve-case wall time |
| --- | ---: | ---: |
| First sequential | 1 | 10.00 s |
| Second sequential | 1 | 9.95 s |
| First parallel | 4 | 3.25 s |
| Second parallel | 4 | 3.29 s |

The batch contains ten controlled cases and two real tests, selected in [`isolation-cases.json`](../../scripts/test-coverage-pilot/isolation-cases.json). These short samples show that fresh executions can run concurrently at reasonable cost. They do not establish full-suite throughput or the best worker count.

The accepted artifacts occupy about 164 MiB for all 48 executions. This includes native V8 reports for runner infrastructure as well as relevant descendants, logs, and aggregate reports. It is not a compact final evidence format.

## What is still missing

We now have a better attribution boundary, but not a finished general collector:

- Main-worker Istanbul and native descendant V8 coverage remain separate schemas. The checker proves the known overlapping source functions, but there is no unified original-source statement/branch index across those formats yet.
- A general lifecycle rule must identify relevant descendants, require their coverage, and handle incomplete shutdown or stripped environments without silently accepting partial evidence.
- File collection, module imports, fixtures, and test execution should retain their provenance. Fresh execution intentionally repeats initialization; that is useful attribution, not proof that every repeated initialization statement is independently asserted.
- Process isolation needs broader testing against real filesystem/network boundaries. We have not established that it is sufficient for every repository test.
- Retries, runtime skips, and same-process concurrent tests were not newly evaluated here. The earlier custom runner's limitations are not a verdict on the stock runner used in this experiment.

The next useful step is **a unified per-test source map with explicit lifecycle/completeness metadata**, checked against these known attribution answers. Accuracy remains the gate; neither storage optimization nor test deletion is the next objective.

## Artifacts and reproduction

Checkout: `ai1:~/src/pica-web`, branch `analysis/per-test-coverage`, production revision `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`. Node 22.22.1, Vitest/Istanbul provider 5.0.4. No root package or production-source changes were needed.

Accepted artifacts: `.analysis/isolation/`:

- `metrics.json`: batch and per-job timings/resources.
- `validation.json`: attribution checks, footprint comparisons, and native source ranges.
- `provenance.json`: revision, environment, and tool/source/lockfile hashes.
- `jobs{1,4}-r{1,2}/<case>/case.json`: exact selection and command.
- Each job also retains `tests.json`, `aggregate/coverage-final.json`, `native/coverage*.json`, timing data, and logs.

The exploratory compile-cache-enabled results remain under `.analysis/isolation-compile-cache-enabled/`. Earlier pilot and broad-validation artifacts were not overwritten.

From the existing AI1 checkout:

```sh
# Inspect the accepted results.
python3 scripts/test-coverage-pilot/check-isolation.py .analysis/isolation

# Run all 48 executions again into a new directory.
python3 scripts/test-coverage-pilot/isolation-experiment.py .analysis/isolation-next
python3 scripts/test-coverage-pilot/check-isolation.py .analysis/isolation-next
```

The run refuses to overwrite an existing output directory. It depends on the already-installed isolated Istanbul provider described in the initial pilot report. It changes no services.

All 48 selected executions and the attribution checks passed. JavaScript/Python syntax, documentation links, whitespace, and unchanged production/package manifests were checked. Full-suite, browser-profile, build/package, and full-project static checks were not run. Analysis tooling, fixtures, and documentation remain uncommitted and unpushed.
