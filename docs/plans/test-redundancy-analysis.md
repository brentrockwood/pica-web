# Coverage-first analysis of test redundancy

Status: brainstorming preserved for continuation, 2026-11-19. No redundancy audit, coverage collector, product trial, or test deletion has been performed. The user requested this plan be saved; implementation and tool selection remain undecided.

## Goal and original idea

Identify tests that duplicate or are subsumed by other tests, then produce evidence-backed recommendations for reducing maintenance burden without losing meaningful protection. This is not an effort to reach an arbitrary test count, increase a coverage percentage, or merely select fewer tests for each commit.

Brent proposed a logical analysis pass: for example, determine whether one test verifies only a subset of what another verifies. The discussion then identified per-test coverage as a way to do most of the repetitive work deterministically. Collect which tests execute which production lines or branches, compute overlap and containment, and reserve agent reasoning for the resulting candidates.

The original workflow is:

**Per-test coverage → deterministic overlap/subset analysis → focused logical review → optional fault-injection evidence → recommendations.**

Keep that workflow distinct from the product research below. The research does not replace the plan with an AI-first clustering approach.

## Baseline and scope

Inventory at commit `88478eb8`, compared with integrated upstream release `v1.202611.3`:

| Suite | Upstream baseline | Net fork additions | Current cases |
| --- | ---: | ---: | ---: |
| Ordinary tests | 9,476 | 138 | 9,614 |
| Browser scenarios, counting each once | 121 | 5 | 126 |
| Artifact tests | 16 | 0 | 16 |
| Total | 9,613 | 143 | 9,756 |

These counts include conditionally skipped cases and expanded parameterized cases. The 126 browser scenarios run in four profiles, producing 504 executions. Windows CI repeats a subset of the ordinary suite; it is not additional distinct coverage. Package/runtime smoke scripts contain additional assertions but are not included in this case count.

“Fork additions” means net additional cases, not every test we edited. The fork also changed 53 existing test files and added 14 test files relative to that release. Do not equate upstream origin with quality, or fork origin with redundancy.

At this snapshot, Linux CI reported 9,609 ordinary tests passed and 5 skipped. The local macOS run reported 9,579 passed and 35 skipped. Those are environment-dependent executions of the same 9,614-case suite. The browser suite reported 498 passed and 6 skips: two touch-only scenarios skipped in each desktop profile, both passing in mobile Chromium. Full CI ultimately passed after provisioning ripgrep in Linux test jobs.

Use this inventory only as context. Recompute relevant counts when starting an audit on a later revision. Follow [testing policy](../testing.md), [test harnesses](../testing-harnesses.md), and [development checks](../development-checks.md).

## What counts as redundancy

Compare behavior, preconditions, execution paths, and assertions—not just test names, similar source, or overlapping coverage.

| Classification | Meaning | Possible recommendation |
| --- | --- | --- |
| Duplicate | Same relevant conditions, behavior, and checks | Keep one |
| Subsumed | Another test provides all the meaningful protection of this test | Consider removing the narrower test |
| Partly overlapping | Some repeated protection, but each has a distinct contribution | Consolidate selectively; preserve unique behavior |
| Repeated across layers | The same rule is checked in helper, service, route, and UI tests | Keep detailed rule coverage at its owner and wiring checks above it |
| Necessary overlap | Shared execution, but distinct inputs, assertions, environments, or failure modes | Keep both |

For every removal candidate, answer:

> What defect would this test catch that the retained test or tests would not?

A concrete answer defeats the redundancy claim. Lack of an answer is a candidate for investigation, not proof of safety.

For example, a test that saves a setting and checks success may be subsumed by a test that performs the same save, checks success, reloads it, and checks the persisted value. But differences in backend, authorization, state, or failure path can make both necessary.

A broad integration test does not automatically make a focused unit test expendable. The latter may be faster, more reliable, and much better at locating a failure. Sometimes the right change is to simplify the broad test rather than delete the narrow one.

## Proposed analysis stages

### 1. Establish trustworthy per-test evidence

**Intended collection host: AI1.** Brent selected it for this step because it has the strongest CPU, most cores, and most memory among the available machines. Its operating system, installed tools, available capacity, and access have not been inspected for this task. This is a placement decision, not a request to start collection or install dependencies yet.

The current hypothesis is that collection will be constrained more by CPU, memory, and attribution-related limits on concurrency than by disk throughput. This has not been measured. On AI1, compare a representative subset with and without per-test collection, recording wall time, CPU time, peak memory, and disk I/O; repeat warm and vary worker count. Prefer local working files rather than adding network-filesystem latency. Use isolated test state, not a live PI WEB instance's state. Pin the source revision and record runtime/OS/collector versions with results. AI1 evidence does not replace coverage of platform-specific behavior on other machines.

Prefer an existing collector or integration over new instrumentation. Ordinary aggregate coverage is insufficient: the required relation is **individual test identity ↔ executed production locations**.

For a bounded pilot, retain test identity (including parameter values), source location, execution environment, duration, and the covered source locations. Prefer branch/statement information where available; line coverage is still useful for initial screening.

Account for shared setup, teardown, import-time execution, mocks, and background work. Do not attribute every fixture/import line to a test's unique verification. Parallel tests and asynchronous work can make naive before/after coverage-counter differences incorrect. Repeat collection enough to detect unstable attribution before using the data for decisions. Stable set calculations do not make unstable input evidence reliable.

Treat each browser/runtime/platform profile explicitly. A test that adds no coverage in one environment may still protect a platform-specific contract elsewhere.

### 2. Perform deterministic candidate discovery

From the collected relation:

- Group tests with identical coverage sets.
- Find proper subset relationships between coverage sets.
- Find tests covering locations or branches that no other test covers.
- Group strongly overlapping tests for joint review.
- Rank candidates using overlap, runtime, and group size.

Use sets, bitsets, or inverted indexes rather than an LLM comparing all pairs. Ten thousand tests have roughly 50 million possible pairs. No particular algorithm or implementation language has been selected.

Coverage uniqueness is a reason to preserve or investigate a test, not a complete measure of its value. Conversely, no unique coverage does not establish that a test adds no fault-detection power.

### 3. Review candidate groups logically

Give the reviewer a compact evidence packet: the candidate tests, relevant production code, coverage relations, preconditions, assertions, and environment information. Avoid sending the whole repository for every comparison.

The reviewer should identify differences in inputs, state transitions, error handling, permissions, persistence, mocked versus real boundaries, and assertions. Assess diagnostic value and flakiness as well as nominal coverage. Produce recommendations with confidence and reasons, not automatic deletions.

Suggested report fields:

| Candidate | Retained test(s) | Coverage relation | Shared/different preconditions | Assertions covered | Distinct protection | Recommendation/confidence |
| --- | --- | --- | --- | --- | --- | --- |

Useful findings include “keep,” “remove candidate,” “consolidate,” “simplify a higher-layer test,” and “insufficient evidence.”

### 4. Optionally validate uncertain cases with faults

Targeted mutation testing or fault injection can distinguish tests that execute the same code but detect different defects. Keep three claims separate:

1. Coverage containment: deterministic fact about observed execution.
2. Equivalent detection of injected faults: experimental evidence about those specific faults.
3. Behavioral/assertion subsumption: a stronger logical claim requiring review.

Do not assume an ordinary mutation run yields the complete test-by-mutant detection matrix. Tools may stop after the first failing test; verify collection behavior before treating missing observations as evidence.

Fault-injection results are corroboration, not a universal proof that removal is safe.

### 5. Propose changes separately from analysis

Start with one coherent subsystem. Session search was suggested as a small pilot; session lifecycle as a larger, more revealing alternative. Neither has been selected.

The initial deliverable is a report, not code deletion. Judge the pilot by whether the candidate groups are stable, the recommendations are understandable, and the evidence materially reduces review effort. If it works, expand to other subsystems. Any subsequent deletion/refactoring batch should retain the selected behavioral protection and run the appropriate checks.

## Decisions still open

- Pilot subsystem and budget.
- Collector: existing product, Stryker data, or minimal custom integration.
- Coverage granularity and treatment of setup/teardown/concurrency.
- Candidate ranking and reporting format.
- Whether and when to add mutation evidence.
- How to retain evidence reproducibly across revisions.

Do not commit to a product or build a general framework before resolving the collector question and demonstrating one useful pilot. No target number of deletions has been proposed.

## Research addendum: existing tools

This was a quick documentation-level research pass, not installation, benchmarking, or compatibility verification. Distinguish permanent suite reduction from change-based test selection and smoke-suite optimization.

### Qt Coco: direct coverage-based precedent

Coco documents per-test coverage, lists of tests executing individual statements, test-benefit analysis, and optimized execution ordering. Its optimizer can omit tests that add no measured coverage. Its guide warns that coverage-only omission is not appropriate as the sole basis for reducing a full functional suite.

This closely matches the deterministic screening stage. Its documented instrumentation targets C/C++, C#, Tcl, and QML, not the project's general TypeScript/Vitest stack.

- [Coco manual: capabilities and test-benefit analysis](https://doc.qt.io/coco/about-coco.html)
- [Coverage-based test prioritization and its limitations](https://www.qt.io/quality-assurance/blog/test-case-prioritization-using-code-coverage-analysis)

### Teamscale: coverage optimization and semantic clustering

Teamscale provides Pareto Optimization using per-test coverage and runtime, plus AI Test Clustering (marked beta in the reviewed documentation). The latter embeds test contents, clusters similar tests, and ranks less-redundant tests first. Its documentation identifies low-ranked tests as retirement candidates, subject to coverage validation and expert assessment.

Embedding similarity is not a proof of assertion subsumption. It is an alternative candidate-generation method, not the deterministic coverage-first plan itself.

Integration caveat: the documented automatic test-source detection does not list Vitest. The generic file-based fallback treats an entire file as one test, which is too coarse for much of this suite. Test execution report import is not the same as individual-test source recognition or per-test coverage collection.

- [Coverage optimization and testwise information](https://docs.teamscale.com/howto/improving-test-efficiency/)
- [AI Test Clustering and redundancy reduction](https://docs.teamscale.com/howto/ai-test-clustering/)
- [Supported frameworks and generic file-based limitations](https://docs.teamscale.com/reference/supported-technologies/test-frameworks/)

### Testler: research on partial redundancy

The 2018 paper *Fine-Grained Test Minimization* describes Testler, a Java-oriented research tool that reorganizes tests and removes redundant statements while preserving assertions and coverage. Its evaluation reports retained fault-detection capability on the studied projects; that is not a universal guarantee. It is useful precedent for partial overlap, rather than a verified drop-in product for this project.

- [Paper: Fine-Grained Test Minimization, ICSE 2018](https://tsigalko18.github.io/assets/pdf/2018-Vahabzadeh-ICSE18.pdf)

### Potential sources of per-test evidence

- [Wallaby.js](https://www.wallabyjs.com/docs/intro/vs-code/) documents **Show Line Tests** for JavaScript/TypeScript. Exportability, automation, and compatibility with our exact runner version remain unverified; a line-test UI is not itself an automated deduplication pipeline.
- [StrykerJS's Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) documents per-test mutation coverage. This maps tests to mutation locations, not necessarily a ready-made source-line matrix. Inspect obtainable data and compatibility before choosing it. Its documented browser-mode limitations also matter; our separate Playwright suite needs separate consideration.
- [pytest-cov coverage contexts](https://pytest-cov.readthedocs.io/en/latest/contexts.html) and [coverage.py contexts](https://coverage.readthedocs.io/en/latest/contexts.html) demonstrate explicit per-test line attribution in Python. They establish feasibility, but are not tools for this TypeScript repository.

No turnkey Vitest product combining individual-test coverage, subset analysis, assertion-aware review, and evidence-backed retirement recommendations was verified in this pass. That is a research limit, not a claim that none exists.

## Continuation guidance

Resume by reviewing this plan with Brent and investigating existing collectors before implementing anything. A useful next bounded investigation is whether Stryker exposes suitable per-test data, alongside whether Teamscale can operate at individual Vitest-case granularity.

This document does not authorize dependency installation, commercial trials, test removal, publication, deployment, or a service restart. The user explicitly asked not to deploy while an active session is running. No restart is needed for planning or read-only research.
