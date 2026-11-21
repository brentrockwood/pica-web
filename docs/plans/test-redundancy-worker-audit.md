# Parent-side worker discovery

Completed on AI1 on 2026-11-20 UTC, following the [unified-index experiment](test-redundancy-unified-index.md).

Follow-up: the [mapped-descendant experiment](test-redundancy-mapped-descendants.md) validates one fixed TypeScript compilation/source-map path. It does not broaden the worker/runtime completeness claims established here.

The previous collector could miss a worker that suppressed both its preload and coverage. Parent-side discovery now catches that case without declaring which source should execute. Node exposes a documented `process` **`worker` event**, emitted after a Worker is created; no constructor patch or private `async_hooks` resource inspection was needed.

The preload records that event in the creating context, including PID, child thread ID, parent thread ID, and the parent's observation of the worker's exit. The adapter reconciles these records against worker registration, native coverage, and the worker's own exit receipt. Removing the audit listener leaves a rejection marker, including when the listener is subsequently restored. Records use the same atomic-write convention as the existing context receipts.

This closes the tested hidden-worker gap **when the creating parent is instrumented**. It is not an OS-level inventory of every thread or a proof against arbitrary instrumentation bypass.

## Results

Twelve cases ran twice sequentially and twice with four independent jobs. All **48 selected-test executions passed their assertions**; 28 coverage observations were accepted and 20 were deliberately rejected as incomplete. Every accepted line footprint matched across repetitions. Existing child, thread, main-worker, lifecycle, and model-catalog footprints also matched the earlier saved experiments.

| Case | Observation | Coverage decision |
| --- | --- | --- |
| Normal worker | Parent launch, worker registration, coverage, and both exit records agree | Accept |
| Hook-suppressed worker | Parent recorded the launch; worker registration and coverage were absent | Reject |
| Worker terminated after returning its result | Parent recorded exit code 1; native coverage existed, but the worker's own exit receipt was absent | Reject |
| Nested worker | Both launches recorded, with the inner worker linked to its creating worker; the helper's native coverage belongs to the inner worker | Accept |
| Rejected constructor | No worker was created and no phantom launch was recorded | Accept |
| Removed parent audit listener | Removal marker persisted despite restoring the listener afterward | Reject |
| Suppressed/killed subprocesses | Existing OS-launch and exit-receipt checks still detected the gaps | Reject |
| Main-worker helper and two real tests | No new discrepancies from parent-side auditing | Accept |

No case declared expected native sources. The checks therefore did not depend on knowing the missing code in advance.

The shared helper line is attributed to `child`, `main-shared`, `thread`, and now `nested-worker`. The nested case verifies the actual PID/thread relationship, not merely that some worker executed the helper. The rejected-constructor case is a collector control, not a claim that a test asserting only Node's argument validation adds useful project protection.

Twelve-case collection took **12.53 seconds sequentially** and **4.15–4.16 seconds with four jobs**. Conversion and validation are separate. These small batches are not full-suite throughput estimates or an isolated measure of instrumentation overhead.

## Failure checks

Copies of the collected evidence were altered to remove, separately:

- A parent's observation of worker exit.
- A worker launch record.
- A nested worker's parent registration.
- The declaration that a parent had worker auditing installed.
- A worker's native coverage report.
- The worker-audit directory.

Every altered observation was rejected. The existing guards for source/test hash drift, missing descendant closure, unsupported native mapping, unsupported successful exec records, and stale accepted output also passed. Original collected evidence was left intact.

## Boundary and remaining work

The adapter still reports `exhaustiveDescendantDiscovery: false`. Parent-side events cover the tested Node worker boundary, but depend on instrumentation in the creator. Direct listener removal is detected; arbitrary replacement or bypass of the event machinery is not proven safe. The existing launch audit covers the selected Node executable, not every runtime or executable.

Nonzero worker exits are conservatively excluded. Node uses code 1 for termination, but a worker can also exit deliberately with a nonzero code. Distinguishing an orderly expected-error exit from a forced stop remains necessary before accepting those cases. This is a collection restriction, not a statement that those tests are invalid or their assertions failed.

The subsequent [mapping experiment](test-redundancy-mapped-descendants.md) and [usable CLI](../test-coverage-tool.md) now validate a fixed TypeScript transform, including a real production module and rejection controls. Arbitrary compiler/loader support remains outside that boundary. Arbitrary detached work, other runtimes, and stronger filesystem/network isolation also remain open. No redundancy decisions, fault injection into application code, or test deletions were attempted here.

## Evidence and verification

Artifacts: `ai1:~/src/pica-web/.analysis/worker-audit/`.

- `jobs{1,4}-r{1,2}/<case>/workers/`: parent-side launch and exit records, plus removal markers where applicable.
- Per-case `unified.json`: line coverage, parent/worker relationships, provenance, and completeness decisions.
- `validation.json`: 48-execution checks, stable footprints, and shared-line ownership.
- `adapter-probes/`: final copied-evidence rejection checks; `adapter-probes-v1/` preserves the earlier check run.
- `metrics.json`, `unification-results.json`, and `provenance.json`: timings, decisions, and tool/source identity.

The platform remained Node 22.22.1, Vitest/Istanbul 5.0.4, and Linux with strace 6.19. No dependency was added. Production revision remained `4e5efc69e2ed2fa804abee9447a7f245510ec2e7`.

```sh
cd ~/src/pica-web
python3 scripts/test-coverage-pilot/check-worker-audit.py .analysis/worker-audit

# New raw collection; destination must not already exist.
python3 scripts/test-coverage-pilot/isolation-experiment.py \
  .analysis/worker-audit-next scripts/test-coverage-pilot/worker-audit-cases.json traced

# Normalize each collected case before running the checker.
node scripts/test-coverage-pilot/unify-coverage.mjs \
  .analysis/worker-audit-next/jobs1-r1/nested-worker \
  .analysis/worker-audit-next/source-hashes.json
```

`check-unifier-guards.py <artifact-root>` creates `adapter-probes` and refuses to overwrite a prior run. The worker checker also compares against saved `.analysis/traced` and `.analysis/unified` regression evidence.

Focused execution, reconciliation checks, JavaScript/Python syntax, cached project typecheck, and a separate TypeScript check of the new fixture passed. The initial standalone TypeScript invocation failed because TypeScript required `--ignoreConfig`; the corrected command passed. Scoped ESLint ignored the experimental fixture because no matching configuration exists, so it provides **no lint verification** for that file. Documentation links and whitespace were checked. Full-suite, browser, build/package, and whole-project lint checks were not run.

No services were restarted or deployed. New work remains uncommitted and unpushed.

References: Node's [`process` worker event](https://nodejs.org/docs/latest-v22.x/api/process.html#event-worker), [worker exit event](https://nodejs.org/docs/latest-v22.x/api/worker_threads.html#event-exit), and [`worker.terminate()`](https://nodejs.org/docs/latest-v22.x/api/worker_threads.html#workerterminate).
