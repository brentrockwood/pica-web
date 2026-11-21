# Bounded retrospective test-design trial

## Result

The source-first pass found the right existing test family in all three selected fixes. Its proposed tests demonstrated the original regression in each case. That was not enough to establish equivalent protection: two targeted fault experiments exposed meaningful omissions in the initial recommendations. Both omissions could be repaired inside the existing fixtures, without a new analyzer or coverage collection.

Keep the cheap pass as the default, but distinguish **detecting the reported bug** from **protecting the changed contract**. A small amount of deliberate boundary review was useful here; an unconditional second reviewer or mutation gate is not supported by this sample.

## Method and evidence boundary

Trial run: 2026-11-21, in the authorized tracked subsession. Read the test-design-review skill, testing policy, harness guidance, and development checks before selection. Also read repository architecture and documentation guidance. This report is the only repository file owned by the trial. No production or test changes were made in the canonical checkout; no branch switch disturbed the parent's concurrent instruction edits.

Private artifacts are under `/Users/br/.local/state/pi-web-test-design-trial/`:

- `candidates.txt`: 100 matching Git subjects examined for selection.
- `case{1,2,3}/metadata.txt`, `started.txt`, `initial.md`: selection evidence and frozen recommendations.
- `case*/historical.diff`: revealed historical changes.
- `case*/parent/`: ordinary `git archive <fix>^` copies, subsequently used as disposable execution directories, **not pristine parent snapshots now**.
- `case*/proposed.test`, `revised.test`, and case 3's `revised-corrected.test`: separate test designs.
- `case*/*.log`: full runner output, including expected failures and one trial editing error.
- `runs.json`, `fault-runs.json`, `revised-runs.json`, `correction-runs.json`, `lint-runs.json`: measured exits and elapsed seconds.
- `prepare.py`, `run.py`, `deeper.py`, `revise.py`: one-off reproduction scripts, not an analyzer or proposed project tooling. The correction is preserved as an artifact; `revise.py` still reproduces the recorded editing error.

All three initial recommendations were saved at **07:49:26 UTC**, before the first fixed production or historical test diff was displayed. They were not subsequently rewritten. Parent production and assertions were inspected using `git show`, `rg`, and `sed`; commit metadata and changed filenames were visible. Bug descriptions were the commit subjects, not independently sourced issue reports. The `revealed.txt` files mark artifact preparation after reveal, not the exact instant of first display.

This is **not fully blind evaluation**. In particular, “restrict plugin discovery to the project-specific tag” reveals the intended solution. The other subjects also cue the desired behavior. This metadata contamination is recorded in every initial recommendation. There was no known fixed-diff/test contamination before freezing recommendations. Implementations were written after reveal from those saved recommendations, so only the recommendations—not their exact implementation details—were withheld-diff decisions. Later revisions and fault choices are explicitly hindsight-informed.

Selection favored small, local behavior runnable with installed dependencies. The selected cases include a controller, a DOM-driven website script, and a plugin-rendering integration; none requires a live service. No coverage collector, install, remote host, browser service, daemon operation, publication, or notification was used. Each copy links to existing `node_modules`; Vitest ran with `--no-cache`. Dependencies were not installed or edited.

## Case 1: restored session ordering

**Fix:** `1f2d1caa26b6f7dcfac701ed16db5073c227c500`, “restore sessions into date order.”

**Initial inspection.** `src/client/src/controllers/sessionController.ts`, `restoreSession` and `replaceSession`, showed that restoration replaced the row in place. The first test in `sessionController.reloadSelection.test.ts` already checked metadata removal, returned navigation data, and preservation of an unrelated selection. Its equal timestamps could not distinguish reordering. Other tests covered selected restoration, view-only navigation, stale routes, and scoped failure. The `PiWebApp.ts` restore caller navigates using the returned session.

**Decision: extend.** Give the archived session a later modified date and change the first scenario's order assertion. Keep the metadata and selection assertions; do not build another controller fixture. The initial design caught the bug, with one intended ordering assertion failing before and the complete eight-test family passing after.

**Deeper review changed the recommendation.** The server's `piSessionService.ts` listing sorts active sessions newest-first and appends separately sorted archived sessions. My initial review had not followed that producer far enough. It under-specified two meaningful boundaries: restoring into the middle rather than merely the front, and keeping a newer still-archived row behind active rows. The historical regression has two parameter rows and includes a still-archived session. These are not interchangeable examples of “date ordering.”

A bounded fault replaced the historical fix's sorting with “always prepend restored.” My original family passed all eight tests; the historical family failed its middle-insertion row. This demonstrates an actual detection gap, not inferred test overlap. The revised trial fixture uses a newer active row and an even newer still-archived row, expects `[recent, restored, old, stillArchived]`, and catches that fault. It also fails on parent production and passes on the historical fix. It does not prove equivalence to every historical assertion or justify removing a historical parameter row.

**Utility/proportionality:** good ownership decision, insufficient initial partition selection. Following the list producer and making the fixture discriminate a plausible shortcut was worth more than additional search breadth. Equal-date stability remains unexamined; no claim is made about it.

## Case 2: project-specific plugin discovery

**Fix:** `e42938f3f2bb1f70371d4f20fe2ce736824d2609`, “restrict plugin discovery to the project-specific tag.”

**Initial inspection.** `docs/plugin-search.js` is executed by `community-plugins.html`; `scripts/plugin-search.test.mjs` runs the actual script in happy-dom with fake fetch. Its first scenario explicitly expected two keyword streams. Assertions elsewhere assumed two calls, independent stream pagination, and four pending responses across an aborted search. Existing tests already covered untrusted metadata rendering, local filtering/sorting, metadata errors, pagination failure, and cancellation.

**Decision: extend and adapt affected fixtures.** Return both valid project packages and broad-only/unrelated packages from the registry fake, assert the actual listed names and the specific query, and retain escaping assertions. Update single-stream request counts, pagination, and stale-response resolution. The obsolete dual-keyword partial-failure scenario was omitted only in the disposable proposed copy; the later-page partial-catalog scenario remains. No canonical test removal is proposed by this report.

The proposed test family passes after the fix. Before it, the first failure is the unwanted broad package in actual results. Six additional failures arise from changed request/count/pagination expectations and the single-stream stale-response fixture. The stale-response timeout is a fixture/protocol mismatch, not independent proof of the discovery regression. Do not count seven failures as seven demonstrated bugs.

**Deeper review changed the recommendation.** The historical first scenario also includes a prefix-similar tag and missing keywords. My proposed fixture lacked both. Replacing exact tag membership with prefix matching made all 15 proposed tests pass, while the historical first scenario failed because it listed `similar`. The revision adds prefix-similar and absent-keyword entries to the same response fixture; it catches the fault, fails before, and passes after. This is a cheap trust-boundary distinction, not a reason to enumerate arbitrary tag strings.

The historical pagination revision additionally loads all remaining pages and checks deduplication and the final hidden load-more control. My trial did not adopt or independently validate that extra protection beyond running the historical family. The initial pagination scenario sees only the first 40 items and therefore is not evidence of full deduplication equivalence.

**Utility/proportionality:** source-first inspection found the important request-count and cancellation coupling before reveal. The narrow keyword change still required several fixture adaptations. Actual response filtering and exact membership deserve assertions; request counts alone are insufficient. No network access or coverage map was needed.

## Case 3: plain-text highlighting

**Fix:** `6e82a8d621ed66803c2af05d8698b8be6a8afbd9`, “skip syntax highlighting for plain text.”

**Initial inspection.** `pi-web-plugins/code-highlight/pi-web-plugin.ts` resolves a built-in language from explicit language or filename, while `supports` can also select a plugin grammar. `src/client/src/formatting/codeHighlight.test.ts` already has a raw-source parameter family, common-language positives, safe rendered-source assertions, and plugin-grammar/filename integration. Registry matching uses active content renderers; no dynamic coverage uncertainty prevented identifying the owner.

**Decision: extend plus add a smaller boundary.** Extend the raw-source family with `plaintext`, `text`, and `txt` fences. Add one registry-level scenario for a `.txt` file and explicit plain language over a `.js` filename. This avoids another mounted fixture for filename decisions. Four proposed cases fail before; all 22 tests pass after.

**Deeper review.** The historical test adds five fence rows, including uppercase and an info-string suffix, asserts exact preserved source and an available code-block button, and includes a positive `.js` filename control. My initial family only asserts presence of raw code, not its content. Existing highlighted-JavaScript source preservation does not establish plain-source fidelity. The positive filename control was added to the revised trial scenario and validated. The stronger source-preservation assertion and historical normalization rows were reviewed and run as historical protection, not independently added to my recommendation. No fault-equivalence claim is made for this case.

The initial question about a plugin deliberately claiming plain text is resolved narrowly by source inspection: the fixed built-in-language function excludes the plaintext grammar, while plugin capability support still takes precedence. This fix is not a blanket prohibition on all third-party plain-text renderers. That precedence was not separately executed with a plain-text grammar fixture.

One revision script accidentally inserted the filename positive into an unrelated existing scenario too, where `request` was undefined. The first revised-after run failed with `ReferenceError`; this was a trial editing error, not a product regression. The erroneous log is retained. After removing only that insertion, revised-before had the same four intended failures and revised-after passed all 22 tests. Scoped ESLint then passed.

**Utility/proportionality:** the initial test boundaries were suitable, but the raw-source assertion was weaker than the historical regression. A filename positive guards against a blanket “no renderers” result. More mounting or coverage collection would not answer either assertion-quality question.

## Actual execution

Each command ran from its case's disposable `parent/` directory with Node **v26.13.1** and the currently installed dependencies, not a reinstalled historical dependency lock:

```sh
node /Users/br/src/pica-web/node_modules/vitest/vitest.mjs run \
  --config vitest.config.ts --no-cache <test-file>
```

The test files are the three files named above. “Before” means parent production plus the stated test variant; “after” means only the target production file replaced by the historical fixed version. Other files stay at the parent revision. Historical validation uses the historical fixed test file, separately from the trial proposal.

| Case | Parent baseline | Initial proposal before → after | Historical tests before → after |
| --- | --- | --- | --- |
| 1 | 8 pass, exit 0 | 1 fail / 7 pass, exit 1 → 8 pass, exit 0 | 2 fail / 7 pass, exit 1 → 9 pass, exit 0 |
| 2 | 16 pass, exit 0 | 7 fail / 8 pass, exit 1 → 15 pass, exit 0 | 7 fail / 8 pass, exit 1 → 15 pass, exit 0 |
| 3 | 18 pass, exit 0 | 4 fail / 18 pass, exit 1 → 22 pass, exit 0 | 6 fail / 18 pass, exit 1 → 24 pass, exit 0 |

| Deeper experiment | Initial proposal | Historical family | Revised proposal |
| --- | --- | --- | --- |
| Case 1: always prepend | 8 pass, exit 0 | 1 fail / 8 pass, exit 1 | 1 fail / 7 pass, exit 1 |
| Case 2: prefix tag match | 15 pass, exit 0 | 1 fail / 14 pass, exit 1 | 1 fail / 14 pass, exit 1 |

Revised proposals also passed the fixed production files: case 1, 8/8; case 2, 15/15; corrected case 3, 22/22. Their parent-production failures remained 1, 7, and 4 respectively. Fault failures were the intended order/result assertions, not setup failures. These two selected faults disprove equivalence for the initial proposals; they do not establish completeness of the revisions.

Scoped lint ran in cases 1 and 3:

```sh
node /Users/br/src/pica-web/node_modules/eslint/bin/eslint.js <test-file>
```

Both exited 0. No cached whole-project typecheck, build, browser matrix, installed-package smoke, or full suite was run: the delivered repository change is this internal report, not a production or maintained test batch. The disposable TypeScript edits were execution- and lint-checked, not typecheck-certified. No infrastructure blocker prevented the focused experiments.

## Effort and limits

The first recorded investigation timestamp was **07:48:25 UTC**; all initial recommendations were frozen **61 seconds later**. Discovery used one 100-subject history listing, three metadata/filename inspections, three parent archives, and four source/test inspection batches before the freeze. Two guessed source paths did not exist; a later search found the actual server list producer. This is useful evidence of a cheap-search miss, not a claim that protection was absent.

The 15 baseline/proposal/historical runs completed by **07:50:21 UTC** and consumed **19.588 seconds** of measured subprocess wall time in total. Individual runs ranged from 0.473 to 2.971 seconds. Fault experiments consumed 5.257 seconds; initial revision runs 10.347 seconds; the corrected case-3 rerun pair 1.898 seconds; scoped lint 9.052 seconds. JSON artifacts carry individual measurements. These are local, warm-dependency observations, not benchmark estimates or measured savings. Reading/thinking time was interleaved across cases; no reliable per-case human-equivalent effort or token metric was collected. Report writing and final document checks followed these runs. The first final-check timestamp was 07:53:39 UTC, 5 minutes 14 seconds after the first recorded investigation timestamp. Referenced current test and guidance paths were checked. Because the report was untracked, `git diff --no-index --check /dev/null docs/plans/test-design-review-trial.md` was also run: it exited 1 without diagnostics, so it is not reported as a passing check. A separate explicit trailing-whitespace/conflict-marker assertion passed. Ordinary `git diff --check` exited 0 but does not inspect this untracked report.

This sample is intentionally favorable to local testing, uses solution-cued subjects, and has only three selected successes. It excludes service ownership, filesystem durability, permissions, browser geometry, cross-platform behavior, and difficult historical dependency reconstruction. All three needed extension; there is no evidence here about how often reuse alone is sufficient. Similar pass/fail outcomes do not prove subsumption, nor does a smaller maintained scenario count prove lower cost.

## Guidance supported by this trial

Retain the reuse/extend/add decision and require real assertion inspection. Before calling a representative input sufficient, ask whether it distinguishes an obvious wrong implementation: “always prepend,” prefix matching at an exact-tag boundary, or blanket rejection of filename rendering. Trace an ordering contract to its producer when the local mutation alone does not define it. These are small refinements to source-first review, not new mandatory infrastructure.

Use bounded fault experiments when a proposed simplification's adequacy remains consequential and uncertain. Here they answered named questions cheaply and exposed two misses. Coverage would only show execution relationships already visible in the sources; it would not reveal the missing ordering or tag assertion. A persistent test index, new analyzer, mandatory reviewer, or unconditional mutation suite is not justified by these results. Preserve historical regressions unless a separate authorized review establishes a replacement; this trial does not authorize deletions.

## Matched A/B experiment — run 1

### Outcome

**No clear benefit from the additional procedure in this pair.** Both arms produced working tests and detected every preselected fault. An independent, assignment-blinded source review found complementary strengths, not an overall design winner. The procedure-assisted arm took longer, but it also performed some different validation; one pair cannot establish systematic overhead.

| Observation | A: ordinary guidance | B: guidance plus procedure |
| --- | --- | --- |
| Agent wall time | 234.466 s (3m 54s) | 311.038 s (5m 11s) |
| Completed task tool calls | 14 | 13 |
| Correct-production coordinator run | 42 pass, exit 0 | 37 pass, exit 0 |
| Frozen fault detection | All 7 | All 7 |
| Changed test files | 4 | 4 |
| Test diff, including new files | +239 / −22 lines | +230 / −23 lines |
| Final scoped lint | Pass | Pass |
| Project typecheck | Exit 2: missing generated theme module | Same two errors |

Test and line counts describe the outputs; they do not score quality. The fixed-code coordinator runs took 1.949 s and 1.908 s respectively, too little evidence for a runtime advantage. The 76.572-second agent-time difference is an observation, not a measured causal cost of the procedure. No token-cost or savings estimate is claimed.

### Setup and control

Selected `9271b4227700905a35a47d75874e2afee5c8314b`, **“provision bundled Pi packages only once per profile.”** The commit has substantial existing test adaptation and a new persistence boundary. It was selected from three inspected commit/stat candidates to provide migration, retry, removal, and configured-source decisions without starting services.

Both agents received ordinary parent copies with the three fixed production files applied, the production diff, the same behavioral description, and parent tests. Historical new tests were withheld. Each had a 12-minute wall-clock budget, identical tools, installed dependencies, and independent persisted Pi CLI sessions. The actual model was `openai/gpt-6-astra`, reasoning `medium`, in both arms. Runs began together at 08:33:38 UTC on 2026-11-21. A ended at 08:37:32; B at 08:38:49. Neither reached its budget.

Global context, discovered skills, extensions, and MCP were disabled for both. Both explicitly read the historical `AGENTS.md`, testing policy, harnesses, and development checks. B additionally received and read a frozen copy of the current test-design-review skill, including the refinement from the retrospective trial. A did not receive that skill. This compares the **incremental procedure against already substantial project guidance**, not against an unguided agent or a human. It also does not reproduce every current global instruction.

The initially selected `openai/gpt-5.4` failed in both arms with a provider `model_not_found` error before any work. Its logs are retained. Both were restarted fresh with the coordinator's available model; a pre-work amendment records the change. The JSON CLI returned process exit 0 for those provider errors, so completion was checked from assistant events rather than inferred from process status.

No tracked-child spawn tool was exposed to this subsession. The two workers therefore used local CLI sessions with saved event streams and session IDs, not PI WEB child lifecycle tracking. They were ordinary disposable directories, not an OS sandbox. Inspection of their complete tool-call records found no access to other arms, historical test changes, or the canonical checkout beyond the supplied dependency link. File manifests confirm that final production and other original files were unchanged; each arm changed only four test files plus private scratch artifacts. Temporary fault mutations were restored.

### Frozen evaluation

The coordinator read production changes and parent tests, then saved seven faults and evaluation criteria **before dispatch and before reading historical new test contents**. After both outputs were frozen, each test set ran on correct production and each fault individually. The three primary families were reconciliation, source migration, and the new provisioning store. There were 24 coordinator runs: eight each for A, B, and the historical reference. Their aggregate measured execution time was 39.174 seconds.

| Fault | A | B | Historical reference |
| --- | --- | --- | --- |
| F1: reinstall an absent package despite completed provisioning | Detected | Detected | Detected |
| F2: record provisioning before an install that can fail | Detected | Detected | Detected |
| F3: migrate only the active profile's legacy records | Detected | Detected | Survived |
| F4: overwrite the original provisioning timestamp | Detected | Detected | Detected |
| F5: ignore profile identity when looking up provisioning | Detected | Detected | Detected |
| F6: treat malformed ledger JSON as an empty ledger | Detected | Detected | Detected |
| F7: skip configured-source updates once provisioning exists | Detected | Detected | Detected |

Every “Detected” entry was exit 1 with a relevant assertion failure; no import, setup, or infrastructure failure was credited. All three unmodified-production baselines exited 0: A 42 tests, B 37, historical reference 32. Exact failure counts, assertions, commands, and timing are in the private logs. Neither worker saw these coordinator faults. Both independently tried an F1-like fault and demonstrated a meaningful failure, then restored production and passed their final tests.

**F3 is weaker evidence than the other faults.** It contradicts the implementation's explicit all-profile migration promise, but the legacy file remains available. A later startup of another profile could migrate its records then. The experiment did not demonstrate a resulting user-visible failure from deferred migration. The historical survivor therefore does not establish that either generated suite offers a consequential improvement over the historical suite. This distinction also limits the value of reporting “7 of 7” as a score.

Parent production has a different options interface and lacks the new store module. Rather than credit missing-module/API failures as regression evidence, the coordinator used semantic faults against the fixed interface. F1 restores the original unwanted reinstall behavior without breaking the test setup. This experiment does not claim clean historical-parent fail-before execution.

### Independent source assessment

A fresh read-only assessor received anonymized X/Y test diffs and source files, relevant fixed production, and no arm prompts, decision reports, historical tests, or execution results. Random assignment was X = B and Y = A. It finished normally in 52.650 seconds. The coordinator was not blinded; the assessor's qualitative findings are secondary to the frozen executions.

Its findings, checked against the diffs:

- **A had useful extra failure-path protection:** recording an already configured identity before a source-refresh failure, recovery after a migration-write failure, and per-package continuation after a transient ledger lookup failure.
- **B had useful extra lifecycle assertions:** a subsequent shipped release still updates an already provisioned package with its filters intact; a newly introduced identity is provisioned without resurrecting a removed one; a current-source no-op performs no replacement; malformed persisted state does not trigger reconciliation writes.
- Both used small temporary directories and real persistence/settings boundaries. A used more real dismissal-store interaction; B retained a narrow dismissal-list fake in routine cases. B combined more lifecycle transitions into individual scenarios. Neither had a clear maintenance advantage.
- Neither injected actual temporary-write/rename failure or tested provisioning-record failure after a successful install. Those are unverified boundaries, not evidence that the current implementation is defective.

A meaningful tradeoff arose outside the primary families. The old Workflows integration test invokes a real package installer. A adapted its interface but skipped that one scenario, running the other two. B substituted a fake installer that appends isolated settings, then ran all three. That obeyed the no-install constraint, but reduced protection of the real explicit-reinstall integration and duplicated some persistence behavior. B's larger executed check set is not automatically stronger protection. These disposable changes are **not** proposed as canonical replacements.

### Verification and limitations

Coordinator execution used the installed runner from each evaluation copy:

```sh
node /Users/br/src/pica-web/node_modules/vitest/vitest.mjs run \
  --config vitest.config.ts --no-cache \
  src/server/sessiond/autoInstallPiPackageSources.test.ts \
  src/server/sessiond/autoInstallPiPackages.test.ts \
  src/server/storage/piPackageProvisioningStore.test.ts
```

Each process used an isolated `PI_WEB_DATA_DIR`. Source-adapter tests register already-present local fixture paths; reconciliation installers are fakes. The coordinator excluded Workflows installation integration from all three fault matrices. A separately reported and logged two safe Workflows tests passing with the real-installer scenario skipped. B's final broader run passed 47 tests across five files, including unchanged dismissal-store tests and its mocked Workflows integration. Those differently scoped totals are not substituted for the matched primary results.

Both agents ran scoped ESLint successfully on their final four changed TypeScript files. Both ran project typecheck with build info under their private `.trial/` directory. Both ended with the same two `TS2307` errors for `./material/generated` in theme code/tests; neither generated the missing production asset. Their initial incompatible Workflows callers were corrected. Typecheck is **not passing**. No full suite, build, daemon startup, real installation, browser matrix, or cross-platform run was performed.

This is one parallel pair on one local-persistence change. Agent randomness, concurrency, dependency-cache state, and different amounts of optional checking all confound timing. Both inherited strong ordinary testing guidance, and much of the procedure's advice overlaps it. The faults were chosen from visible production and may favor easily recognized boundaries. No coverage collector, new analyzer, canonical test change, service operation, dependency installation, or publication was needed.

**Decision:** this pair supplies no evidence to strengthen or expand the procedure. It also does not establish that the procedure is useless or systematically slower. If continued, repeat paired runs with the same frozen inputs before interpreting time differences; include a case with genuinely difficult existing-test overlap before generalizing about reuse decisions. Do not promote either disposable test set or weaken historical regressions on this evidence.

### A/B artifacts

All artifacts are under `/Users/br/.local/state/pi-web-test-design-ab/run1/`:

- `preregistered.md`, `faults.json`, `F*.source`, `selection.json`, `amendment-model.md`: protocol, frozen faults, and model-access amendment.
- `prompt-A.txt`, `prompt-B.txt`, `manifest-*.json`, `changes-*.json`: treatment inputs and output integrity records.
- `sessions-A/`, `sessions-B/`, `events-*.jsonl`, `launch-*.json`, `tool-calls-*.json`: full worker provenance. `failed-launch/` retains the provider failures.
- `A/.trial/result.md`, `B/.trial/result.md`, `tests-*.diff`, `arm-summary.json`: outputs, changes, and measured task effort.
- `evaluation-runs.json`, `evaluation-{A,B,H}/*.log`, `historical-tests.diff`: all coordinator checks and the separately revealed historical reference.
- `assessment.md`, `assessment-mapping.json`, `assessment-events.jsonl`: anonymized independent source review and its provenance.
- `prepare.py`, `freeze.py`, `launch.py`, `evaluate.py`, `summarize.py`, `assess.py`: one-off experiment orchestration, not new project tooling.

Ordinary copies and logs remain for review. No worktrees or branches were created, and no cleanup of those artifacts has been requested.

## Tree-sitter-assisted discovery trial

### What was tried

Used the already-installed **ast-grep 0.51.2**, which uses Tree-sitter, rather than writing a parser or persistent analyzer. Tree-sitter CLI 0.27.2 was also available but was not needed. The task was discovery: find tests connected to `reconcileAutoInstallablePiPackages` and expose their assertions for review. It was not another test-generation A/B run.

The real corpus was the historical fixed provisioning snapshot from the preceding experiment. This was an exploratory, familiar case—not a blind evaluation. A manual source inventory identified 24 relevant static test declarations across three files: nine reconciliation declarations, thirteen source-adapter declarations, and two Workflows declarations. Parameterized rows are not counted as separate declarations. Three other declarations in those files do not invoke the target. A broad symbol search across all test extensions found no additional files; that does not rule out aliases with no occurrence of the original name.

### Results

| Search | Observed result |
| --- | --- |
| Plain symbol text search | 21 matching lines in three files, including imports |
| Call-shaped text regex | 18 call-site lines in the same three files |
| AST call pattern | The same 18 call sites in the same three files |
| AST query for enclosing tests containing a target call | 11 declarations; missed 13 helper-mediated declarations |
| AST query after manually inspecting and including the local `reconcile` helper | All 24 inventory declarations, no extra declarations |

The important improvement was **structured output**, not additional direct-call discovery. Relational queries returned complete enclosing test nodes, titles, and locations. A small output-aggregation script then associated 76 `expect`-containing expression statements with the selected declarations by source range. The resulting `review-packet.json` is something a reviewer can read without manually extracting each test body. These are syntax associations, not independent behavioral guarantees or proof that assertions observe the target's effect.

Helper tracing was not automatic. Reading the source established that local `reconcile()` constructs a wrapper whose `run()` invokes the production function; the additional query was limited to those three files. Applying a common helper name across the entire repository without checking its binding would create misleading matches.

Five alternating-order process runs per primary command produced these local median times:

- Symbol text search: 24.243 ms.
- Call-shaped text regex: 25.631 ms.
- AST call search: 196.203 ms.
- AST enclosing-test search: 250.175 ms.

Both search methods were fast at this scale; AST search was not faster. No matched agent task measured total reading time, discovery effort, or better test decisions. The known relevant file set was identical for text and AST search, so there is no demonstrated file-discovery recall advantage here.

### Multilingual check and useful failure

Small, executable TypeScript and Python fixtures represented direct calls, multiline calls, helper calls, imported aliases, a same-named local function, and mention-only strings/comments. They required no installed test framework. Node and Python execution checks both exited 0.

The same ast-grep executable queried both languages, but the rules were language/framework-specific: TypeScript `it` callbacks versus Python `test_` function definitions. Python assertion nodes were extractable directly; six were found in the controlled fixture. This verifies the multilingual mechanism, not usefulness on a real Python project.

The initial TypeScript call-template query missed a valid call with a comment between the callee and argument list. Trying `strictness: relaxed` did not recover it in this fixture, and the first self-check failed. An explicit `call_expression` rule matching the `function` field recovered it. The original outputs and failed expectation are documented; this is observed query behavior, not a diagnosed Tree-sitter bug. The revised rule also returned the same 24 declarations in the real corpus.

After that adjustment, both languages showed the same limit: the direct-name query found the direct and multiline target tests, missed the alias and helper tests, and incorrectly included the local shadow's test. Mention-only cases were excluded. Thus syntax matching removes some text noise but cannot identify a function solely from its spelling. The final fixture self-checks passed by checking these actual limitations, not by treating every match as a true relationship.

### Decision and artifacts

**Worth using as an optional discovery aid; not evidence for a multilingual redundancy detector.** Small Tree-sitter-backed queries can provide useful test boundaries and assertion context. Keep candidates distinct from established execution relationships, explicitly investigate wrappers/aliases, and test the queries themselves. Multilingual parsing does not eliminate language-specific rules or supply cross-file symbol resolution.

The next meaningful evaluation, if requested, would give fresh agents the same unfamiliar discovery task with and without this structured assistance, measuring correct relationships and end-to-end effort. The present experiment does not establish that the extra structure improves decisions or saves agent time. No persistent index, coverage collection, or larger analyzer is justified yet.

Artifacts: `/Users/br/.local/state/pi-web-test-design-ast/run1/` contains the YAML queries, `oracle.json`, raw matches, `runs.json`, `review-packet.json`, executable fixtures, `fixture-checks.json`, and `notes.md`. `measure.py` and `check-fixtures.py` only run existing tools and check this bounded experiment. No packages were installed, and no canonical production, tests, or dependencies were edited. Final query/fixture assertions and report whitespace/path checks passed; the project suite was not rerun for this read-only discovery experiment.
