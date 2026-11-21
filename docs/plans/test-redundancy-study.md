# Assertion-aware redundancy study

**No test removal or consolidation is supported by the reviewed candidates.** The frozen coverage tool accepted all 105 selected tests across two isolated executions each. Reviewing ten groups exposed distinct state transitions, input boundaries and assertions behind equal or nearly contained footprints. One validation group also exposed an assertion limit: accepting any thrown error does not prove that validation rejected the input deliberately.

The method is useful for finding related tests and preparing a small review packet, not for ranking deletion safety. The clearest counterexample is session search: the oversized-entry test's entire footprint is contained in an ordinary escaped-text test, yet only the former asserts that skipped content marks the response incomplete. Statements on the same source line hide that distinction.

## Sample and outcome

The sample was fixed before viewing rankings: ten whole files covering session navigation and attention—unread state, notifications, pins/preferences, search and list lifecycle. This crosses pure state logic, injected browser controllers, real temporary-file persistence, route injection and happy-dom components. It is a deliberately related sample, not a random estimate of suite redundancy.

| Whole test group | Selected / accepted |
| --- | ---: |
| `src/server/sessions/sessionUnreadStore.test.ts` | 26 / 26 |
| `src/server/sessions/sessionNotificationStore.test.ts` | 15 / 15 |
| `src/client/src/sessionUnread.test.ts` | 16 / 16 |
| `src/client/src/sessionNotifications.test.ts` | 6 / 6 |
| `src/server/storage/sessionPinStore.test.ts` | 6 / 6 |
| `src/server/storage/navigationPreferenceStore.test.ts` | 12 / 12 |
| `src/client/src/components/SessionList.lifecycle.test.ts` | 15 / 15 |
| `src/server/sessions/sessionSearch.test.ts` | 6 / 6 |
| `src/server/sessiond/sessionSearchRoutes.test.ts` | 2 / 2 |
| `src/client/src/components/SessionSearchDialog.test.ts` | 1 / 1 |

The [manifest](../../scripts/test-coverage-pilot/study-cases.json) retains all 105 expanded identities. Vitest runtime collection found no duplicate file/leaf titles. No cases were removed after collection. Broad daemon/runtime, infrastructure and deployment tests were outside the bounded safety scope; no live state was used. File tests create private temporary directories, controllers inject APIs, routes use injection without listening, and the search subprocess reads fixtures through `execFile`, not a shell.

| Measurement | Result |
| --- | ---: |
| Accepted tests / observations | 105 / 210; 100% of this sample |
| Failed, skipped, unsupported, incomplete, empty, timed-out observations | 0 in each category |
| Unstable tests, invalid selections, source/tool drift | 0 in each category |
| Observed original-source statement-start lines | 2,096 |
| Intersecting pairs / all possible pairs | 3,421 / 5,460 |
| Equal / strict containment / partial overlap | 11 / 92 / 3,318 |
| Pairs with Jaccard ≥ 0.95 | 45 |
| Tests with at least one sample-unique line | 36; 351 such lines in total |
| Collection wall / CPU time | 86.02 s / 459.22 s |
| Retained evidence | 826 MiB allocated; 831,778,987 apparent bytes |

Collector exit was **0**. All accepted footprints matched exactly between repetitions; no intersections replaced unstable evidence. Zero exclusions here does not remove the tool's conservative exclusions elsewhere. The other 69 tests having no sample-unique lines says nothing about their assertion value.

## Ranked assertion review

For this review, pairs were ranked by descending Jaccard, then descending intersection size, then test keys. The CLI itself stores pairs in key order. We reviewed ranks **1, 3, 4, 5, 6–11, 15, 23, 24, 25 and 393**: 15 pairs involving 24 tests, organized into ten groups. Rank 393 is the strongest cross-file pair. After the first lifecycle comparisons, selection favored a new responsibility over another near-identical lifecycle pairing; rank 2 and other omitted pairs are not implicitly reviewed.

Below, `A/B/shared` counts are exact observed line-set sizes; Jaccard is shared/union. Keys resolve through the manifest and evidence index. Source line references are for checkpoint `a5f4b696dfcc37052b8fe29bbc2b4e96dbe1de05`. Dispositions apply only to these comparisons, not to every test in the sample.

### 1. Deleted menu versus collapsed list — retain distinct protection

**Rank 1; equal; A/B/shared = 744/744/744; Jaccard 1.**

- A `study-07-12`: “removes a deleted session's menu before committing the refreshed list” — [test line 303](../../src/client/src/components/SessionList.lifecycle.test.ts#L303).
- B `study-07-15`: “collapses with no correction render and does not reopen a menu (open=true)” — [line 346](../../src/client/src/components/SessionList.lifecycle.test.ts#L346).

Both mount the real list and open its menu. A removes one of two sessions and checks the remaining row and absent panel in the first commit. B collapses a one-session list, checks that its body disappears without a correction render, then expands it and checks that the menu stays closed. A never collapses; B never removes a session. [SessionList lines 298–303](../../src/client/src/components/SessionList.ts#L298) handle different changes, although both condition lines execute in both tests. A's DOM assertions do not independently prove that the internal menu ID was cleared: rendering also suppresses unknown rows. Do not turn its title into a stronger claim.

Shared setup installs the popover fake, spies on scrolling and console output, records commits, and clears DOM/storage afterward. These are component-state tests, not proof of browser geometry. Only 268 of the 744 shared lines are in `SessionList.ts`; the rest include popup, localization, styling and other shared execution.

### 2. Different-ID versus same-ID archive transition — retain both parameter rows

**Rank 3; equal; 587/587/587; Jaccard 1.**

A `study-07-02` and B `study-07-03` are the expanded “reveals a different-id/same-id current-to-archive transition in its first commit” cases at [line 119](../../src/client/src/components/SessionList.lifecycle.test.ts#L119). They use the same hooks as group 1.

A selects a different archived session while retaining the current row. B replaces the current session with its archived version under the same ID. Both assert first-commit selection/expansion, connected-row scrolling after that commit, no pending correction, and no repeated scroll during later status churn. The OR condition at [production line 307](../../src/client/src/components/SessionList.ts#L307) admits these different inputs on one line. Removing its archive-status alternative would break the same-ID case while retaining the different-ID route. This is already a compact parameterized test, not duplicated test machinery.

### 3. Which notification generation survives an abort — retain distinct protection

**Rank 4; equal; 168/168/168; Jaccard 1.**

- A `study-02-14`: “moves preserved calls to the active changed-id candidate after aborting cleanup” — [line 305](../../src/server/sessions/sessionNotificationStore.test.ts#L305).
- B `study-02-15`: “retags a failed changed-id replacement back to the prior inbox” — [line 323](../../src/server/sessions/sessionNotificationStore.test.ts#L323).

Both use the in-memory store, fixed daemon ID and injected incrementing clock; each registers session 1, adds a notice, then starts a session-2 replacement. A calls `abortReplacement(candidate, "candidate")`; B uses the default prior survivor. They assert opposite cleared/resync session IDs and opposite missing inboxes. A additionally verifies a later candidate notification succeeds; B verifies the replacement notice survives in the prior inbox. [Production lines 215–250](../../src/server/sessions/sessionNotificationStore.ts#L215) choose target projection, bucket and binding with same-line expressions. Always choosing either survivor violates the other test. No daemon process is involved.

### 4. Preference persistence versus corrupt-file recovery — retain distinct protection

**Rank 5; equal; 74/74/74; Jaccard 1.**

- A `study-06-02`: “persists full replacement order and clearing across new store instances” — [line 23](../../src/server/storage/navigationPreferenceStore.test.ts#L23).
- B `study-06-12`: “does not overwrite corrupt state and can retry after a failure” — [line 62](../../src/server/storage/navigationPreferenceStore.test.ts#L62).

Each hook creates a real private directory and store. A starts absent, writes ordered IDs, replaces rather than appends, clears, and checks revisions through reopened instances. B starts with `broken` bytes, expects both write and read rejection, checks those bytes remain unchanged, removes the bad file and verifies a retry succeeds. [Production `put`/`read`, lines 100–149](../../src/server/storage/navigationPreferenceStore.ts#L100), execute the same statement lines with different exception outcomes and values. B does not test multi-ID ordering or clearing; A does not protect corrupt bytes or recovery after rejection. Twenty-four shared lines are imported configuration/constants, not either assertion's subject.

### 5. Invalid preference matrix — insufficient evidence for consolidation

**Ranks 6–11; two equal-footprint groups.** All cases use [the parameterized assertion at line 58](../../src/server/storage/navigationPreferenceStore.test.ts#L58): `expect(() => parseNavigationPreference(value)).toThrow()`.

| Keys | Exact title suffix after `rejects invalid preferences ` | A/B/shared within group |
| --- | --- | --- |
| `study-06-05`, `-06`, `-07` | `null`, `{}`, `{"ids":"a"}` | 29/29/29; Jaccard 1 |
| `study-06-08`, `-09`, `-10` | `{"ids":[1]}`, `{"ids":[""]}`, `{"ids":["  "]}` | 31/31/31; Jaccard 1 |

The bodies share setup that constructs an otherwise unused store. Twenty-four lines in each footprint are imported constants/configuration; two more come from store construction. [Parser lines 31–50](../../src/server/storage/navigationPreferenceStore.ts#L31) collapse object/array guards and type/blank checks onto individual lines. Empty and whitespace-only IDs remain distinct: replacing `id.trim()` with `id` would admit spaces but still reject empty strings.

The actual assertion also accepts accidental `TypeError`s. For example, removing the numeric element's type guard can still throw at `.trim()`, leaving that test green. Likewise, a null-property crash can satisfy the null case. Thus these tests do not establish controlled validation-error handling, and separate semantic inputs do not by themselves establish distinct fault detection. Keep the existing small matrix pending a targeted error-contract review; neither equality nor these broad assertions justify deleting rows.

### 6. New controller versus reconnect refresh — retain distinct protection

**Rank 15; B contained in A; 186/185/185; Jaccard 185/186 (0.994624).**

- A `study-03-05`: “restores the durable server snapshot for a new browser controller” — [line 62](../../src/client/src/sessionUnread.test.ts#L62).
- B `study-03-06`: “refreshes the projection again on reconnect” — [line 78](../../src/client/src/sessionUnread.test.ts#L78).

Both inject `fakeApi`; no durable server or actual reconnect transport runs. A creates two independent controllers, refreshes each once and checks membership/fresh revision-2 state. B refreshes one controller twice with revision-1 then revision-2 snapshots, asserting the newly added session appears. The [refresh loop and projection installation](../../src/client/src/sessionUnread.ts#L228) execute the same lines; A's sole extra line is `isUnread` at 132. A cannot detect an optimization that stops refreshing once a projection exists. B does not exercise independent-controller restoration or that membership accessor. Of 185 shared lines, only 80 are in the controller; imported API/protocol initialization contributes heavily.

### 7. Atomic pin updates versus invalidation callbacks — retain distinct protection

**Rank 23; A contained in B; 129/131/129; Jaccard 129/131 (0.984733).**

- A `study-05-04`: “serializes atomic pin changes with revisioned replacements and isolates opaque scope IDs” — [line 61](../../src/server/storage/sessionPinStore.test.ts#L61).
- B `study-05-05`: “publishes scoped invalidation only after committed writes, not import, no-op or failed CAS” — [line 72](../../src/server/storage/sessionPinStore.test.ts#L72).

Both use real temporary files and exercise no-op pins, stale revisions and writes. A starts two `setPinned` calls with `Promise.all`, checks neither update is lost, checks opaque scope separation, and reopens the final state. B runs sequentially with an injected spy and checks scoped callback arguments/counts, silence on import/no-op/conflict, and persisted state after a completed call. Its extra lines are [the `put` callback and return at 41–42](../../src/server/storage/sessionPinStore.ts#L41). B cannot replace A's concurrency/scope protection; A has no callback assertion. B's post-call read does not alone prove callback-versus-disk ordering within the call, despite the stronger title.

### 8. Unread completion order versus workspace identity — retain distinct protection

**Rank 24; partial overlap; 128/128/127; Jaccard 127/129 (0.984496).**

- A `study-01-03`: “uses monotonic completion orders so stale acknowledgements cannot clear newer work” — [line 72](../../src/server/sessions/sessionUnreadStore.test.ts#L72).
- B `study-01-05`: “scopes lifecycle and acknowledgements to the canonical id and cwd pair” — [line 125](../../src/server/sessions/sessionUnreadStore.test.ts#L125).

Both use an in-memory store with fixed clock/catalog ID and the shared active→idle `complete` helper. A completes one identity twice, rejects the old order, accepts the current order and verifies a repeated acknowledgement is inert. B completes the same session ID in two directories, acknowledges one and checks the other remains. [Acknowledgement lines 189–206](../../src/server/sessions/sessionUnreadStore.ts#L189) and [tuple key line 630](../../src/server/sessions/sessionUnreadStore.ts#L630) enforce independent order and identity rules. A alone executes the no-op return at 199; B alone executes the snapshot sort callback at 111. Dropping cwd from the key can leave A green while breaking B; removing the order guard has the opposite distinction.

### 9. Escaped search text versus oversized content — retain distinct protection

**Rank 25; B contained in A; 59/58/58; Jaccard 58/59 (0.983051).**

- A `study-08-02`: “runs real rg safely on catalog files and verifies decoded escaped text, with one result per session” — [line 18](../../src/server/sessions/sessionSearch.test.ts#L18).
- B `study-08-06`: “streams past oversized entries and marks skipped content incomplete” — [line 58](../../src/server/sessions/sessionSearch.test.ts#L58).

Both create and clean real temporary transcripts and invoke real `rg`. A uses user/tool/assistant records, duplicate lines, quoted/newline/backslash text, escaped Unicode, and a shell-looking query; it checks exact result IDs or an empty result. B supplies a 9 MiB entry followed by an assistant match and asserts excerpt `needle` plus `truncated: true`. [Production line 66](../../src/server/sessions/sessionSearch.ts#L66) holds the condition and all oversized-line assignments on one line, so observing that line does not establish which assignments ran. A's sole additional line is the excerpt helper's unsuccessful return at 26. A never asserts oversized-content handling; B does not cover A's decoding/role/query cases. `rg` implementation coverage remains outside the tool boundary.

### 10. Pin migration versus concurrent preference scopes — retain layer-specific protection

**Rank 393; B contained in A; 122/80/80; Jaccard 80/122 (0.655738). Strongest cross-file pair.**

- A `study-05-01`: “imports every pin scope, preserving order, revisions and cleared tombstones without modifying legacy state” — [pin test line 23](../../src/server/storage/sessionPinStore.test.ts#L23).
- B `study-06-03`: “serializes concurrent writes without losing independent scopes” — [preference test line 34](../../src/server/storage/navigationPreferenceStore.test.ts#L34).

A creates legacy preferences sequentially, migrates pins, verifies pin-only import, order/revisions/tombstones, unchanged legacy bytes, stale-CAS rejection and no later reimport. B concurrently writes projects, a `__proto__` workspace scope, and two separator-colliding pin scopes, then checks all four through a new store. Both use owned temporary files without filesystem mocks. A's setup executes the underlying [preference store](../../src/server/storage/navigationPreferenceStore.ts#L100), while its assertions also cover [pin initialization](../../src/server/storage/sessionPinStore.ts#L76). That setup containment is not a concurrency assertion. Keep the lower-layer race/key test and higher-layer migration contract; B contains no migration operation at all.

## What the method contributed

The index removed 2,039 disjoint pairs from 5,460 possibilities, but the remaining 3,421 pairs are still too many for exhaustive manual review. A 0.95 Jaccard threshold would narrow that to 45; it would also omit the strongest cross-file comparison. Coverage helped locate neighboring behavior and gave exact shared/different lines to inspect. It did not establish subsumption.

Of the ten reviewed groups, nine have concrete distinct protection and one has insufficient assertion evidence for consolidation. None supports removal. These candidates were useful as review pointers but would be misleading as deletion advice. This is not a measured whole-suite precision rate: the sample and shortlist were purposive, and neither a random review nor a text-only timing comparison was run.

Manual reasoning had to recover information absent from the index: alternative values on the same line, exception outcomes, operation counts and ordering, fresh versus reused state, callback assertions, and higher-layer setup. Shared initialization is especially prominent in the validation and browser-controller pairs. The source breakdown is diagnostic; **no phase-separated or body-only coverage was collected**, and no common baseline was subtracted.

The group-6 fault experiment proposed by this review has now been run; its result is below. A separate possible experiment would suppress only the oversized-content `truncated = true` assignment in group 9, predicting that the oversized case fails while the escaped-text case passes. That search experiment has not been run. Address the broad validation-error assertion separately if controlled rejection is the intended contract. Do not expand the collector or delete tests on this evidence.

## Targeted fault follow-up: reconnect versus new controller

On 2026-11-21, a private ordinary file copy of checkpoint `a5f4b696` was used to test group 6. The source and tests were copied with `git archive`; only installed dependencies were shared. This was not a Git worktree. Both selected tests ran in fresh isolated executions twice per phase, using the unchanged coverage CLI.

The fault inserts one line immediately after `const state = this.machine(machineId)` in `refresh()`:

```ts
if (state.projection !== undefined) return Promise.resolve();
```

This incorrectly treats an existing projection as a reason to skip fetching a newer snapshot. No test assertion was changed.

| Source state | New-controller test | Reconnect test | Collector exit |
| --- | --- | --- | --- |
| Original baseline | Pass twice | Pass twice | 0 |
| Fault inserted | Pass twice | **Fail twice** | 2, expected exclusion of failed test |
| Original source restored | Pass twice | Pass twice | 0 |

The reconnect failure is its existing assertion at [test line 90](../../src/client/src/sessionUnread.test.ts#L90): expected `catalogRevision: 2`, received `catalogRevision: 1`. The new-controller test still passes because each controller starts without a projection. There were 12 selected executions in total: ten passing and two deliberately failing. Failed mutant observations were excluded from candidate screening, not labeled accepted coverage.

The baseline reproduces the study's 186-line new-controller footprint and 185-line reconnect footprint, with strict containment; the restored footprints match the baseline exactly. This is direct fault-detection evidence that the larger-footprint test cannot replace the contained reconnect test. It is evidence about this fault, not a general mutation score or proof of assertion equivalence.

Evidence: `ai1:/home/br/src/pica-web/.analysis/unread-refresh-fault-20261121T034857Z/`. It retains `run.py`, `mutation.patch`, `results.json`, phase logs and `checkout/.analysis/{baseline,mutant,restored}/`. The script verifies exact selected identities, expected pass/fail outcomes, source/test hashes, containment and restoration. Each phase used:

```sh
python3 scripts/test-coverage-pilot/coverage.py run \
  --cases fault-cases.json --jobs 2 --repeat 2 --timeout 60 \
  --output .analysis/<baseline-or-mutant-or-restored>
```

Use a new disposable directory for reproduction. The private source was restored at the end; re-normalizing mutant evidence requires reapplying its saved patch to satisfy source hashes. Canonical source and tests were hash-checked unchanged, historical evidence was untouched, and no service operations occurred. The recommendation remains to retain both tests. No broader mutation campaign is needed to establish this specific distinction.

## Appendix: reproduction and evidence

### Identity and environment

Collection used AI1 `/home/br/src/pica-web`, branch `analysis/per-test-coverage`; the authoritative local branch is `docs/test-redundancy-analysis`. Both started clean at **`a5f4b696dfcc37052b8fe29bbc2b4e96dbe1de05`**. Before discovery, 1,417 source/tool/config/package file hashes matched across hosts. After collection, all 1,632 recorded source-inventory hashes also matched local files; source/tool/project-input checks passed on AI1. Only the new manifest was added before collection; no reviewed collector, production code, existing test or dependency manifest changed.

Runtime: Linux x86_64, kernel `7.0.0-42-generic`, glibc 2.43, Node **22.22.1**, Python **3.14.4**, Vitest/Istanbul **5.0.4**, TypeScript **6.0.3**, `v8-to-istanbul` **9.3.0**, strace **6.19**, GNU time. Dependencies were reused. Preflight resources: 2.7 TiB free, about 120 GiB available memory, near-idle load. Four jobs were safe for these private fixtures.

Full SHA-256 source/tool hashes and the tool snapshot are retained in `provenance.json`, `source-hashes.json` and `tools/` under the evidence root. The published manifest and pinned Git revision identify the study inputs without duplicating those artifact inventories here.

### Commands and retained artifacts

New evidence root: **`ai1:.analysis/coverage-study-20261121`**, relative to the checkout. Companion records: **`.analysis/coverage-study-20261121-meta`**. Historical evidence was not modified.

Runtime discovery used `node node_modules/vitest/vitest.mjs list --config vitest.config.ts --no-staticParse --maxWorkers 4 --includeTaskLocation --json=<meta>/list.json`, followed by all ten file paths above. The exact argument array is saved in `list-command.json`. `list.json` preserves suite-qualified expanded titles and locations; the manifest uses the unique expanded leaf titles. Collection's own `selection.json` independently confirmed each identity.

```sh
python3 scripts/test-coverage-pilot/check-cli.py
node scripts/test-coverage-pilot/check-native-points.mjs

/usr/bin/time -v -o .analysis/coverage-study-20261121-meta/time.txt \
  python3 scripts/test-coverage-pilot/coverage.py run \
  --cases scripts/test-coverage-pilot/study-cases.json \
  --jobs 4 --repeat 2 --output .analysis/coverage-study-20261121

python3 .analysis/coverage-study-20261121-meta/verify-study-final.py \
  .analysis/coverage-study-20261121 \
  .analysis/coverage-study-20261121-meta/final-verification
```

All four checks/commands exited 0. Output directories must be new on a rerun. The private one-off verifier does not import the collector: it checks exact selection and passing execution, unsupported options, completeness flags, positive maps, both repeat sets, source/tool hashes, all inverse-index entries, all candidate pairs and their equality/containment/Jaccard/difference arithmetic, and sample-unique lines. The small-sample `check-results.py real` mode was deliberately not used.

For any reviewed key, follow `line-index.json → tests[key].observations → run-{1,2}/<key>/unified.json`; the latter links every line to provider/context evidence. `case.json`, `selection.json`, aggregate coverage, load/launch receipts and logs remain beside it. Companion `verification.json`, `ranked-candidates.json` and `candidate-review.json` preserve audit counts, ranking and shortlist/source breakdowns; `final-verification/` repeats the audit with explicit selected-file and retry-diagnostic checks. Compact copies and the selection rationale remain in the private local study directory. Raw logs are not repository deliverables.

GNU time reports 634,088 KiB maximum RSS (largest measured process, **not** summed concurrent memory), 336 filesystem input blocks and 5,432,672 output blocks for the full collection. Per-runner totals are 276.86 elapsed seconds and 403.05 CPU seconds; these exclude some orchestration/normalization cost and are not the overall wall time. No baseline throughput comparison was run. A mid-run `du` encountered one disappearing temporary load-receipt file; the final settled size above succeeded and all completeness checks passed.

### Verification limits and safety

Manifest identities, source hashes, report paths/links and whitespace were checked. This report and manifest were verified before their research checkpoint; the collector implementation at `a5f4b696` was not changed. No test was deleted or edited, and no service operation, deployment, install, worktree, delegation or external publication occurred. AI1 service PIDs 6819/6821 retained their October 30 start times.

Full-suite, build/package, typecheck/lint and real-browser checks were not run: the changes are a study input and developer documentation, not application behavior. No mutation experiment was performed during the initial 105-test study; the later follow-up above tests one fault only. Two repetitions establish agreement only for these executions. Coverage remains statement-start-line execution including imports/setup/awaited cleanup, not branch, assertion or fault-detection equivalence. Native JSON loads, unsupported native project loads, ambiguous initializer ranges, nonzero worker exits, unsupported loaders/runtimes and non-Node implementation coverage retain the exclusions in the [operating guide](../test-coverage-tool.md). The successful selected sample does not validate those unsupported boundaries.
