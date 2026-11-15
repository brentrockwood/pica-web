# Long-session streaming latency

Branch: `perf/long-session-streaming`

## Goal

Reduce harness work that grows with session history and prevent optional rendering work from delaying visible streaming. Preserve transcript contents, event ordering, reconnect watermarks, interactive controls, and final status correctness.

## Evidence and limits

Source inspection found per-event session statistics/context scans, full current-response cloning, browser history traversal and array copying, deferred Markdown publication, and live-event buffering during periodic snapshots. Local health requests were 2–35 ms; this does not measure streaming stalls. Telegram notifications bypass the UI and may precede final model generation. No production stall has yet been profiled.

## Execution plan

1. Reduce daemon status work for streaming-only events; preserve immediate semantic state transitions and correct explicit snapshots. Add regression coverage showing historical statistics are not recomputed per text delta.
2. Remove avoidable browser history work: batch transcript changes and reuse stable derived message data where safe. Prove ordered output and unchanged historical identities with focused tests.
3. Prevent optional Markdown previews from holding back visible prose; avoid unnecessary processing/cache retention of streaming prefixes where a contained fix exists. Test repeated streaming updates and stable controls.
4. Evaluate periodic snapshot buffering and current-response cloning after those changes. Change only when correctness and measurable benefit justify it; do not weaken snapshot consistency to hide latency.
5. Run focused tests, scoped ESLint, cached project typecheck, and relevant real-browser checks. Record deterministic work-count/performance evidence rather than claiming unmeasured end-to-end speedups.
6. Review remaining bottlenecks and stop when further changes require a reproduction/profile or introduce disproportionate risk. Add a patch changeset and summarize remaining limits.

## Operational constraints

The user authorized daemon restarts. A restart interrupts active sessions, including this agent: warn before any restart and use a detached service-manager mechanism if scheduling it. Prefer isolated tests over interrupting the live daemon. Do not touch the pre-existing untracked `docs/upstream-integration-handoff.md`. Do not publish or push without a request.

## Progress

- Created branch and saved this plan before implementation.
- Daemon: skip status aggregation for assistant `message_update` events. All semantic events, explicit reads, and heartbeat status updates remain. Reuse context usage already returned by SDK statistics, with a fallback for older adapters that omit it.
- Transcript: combine adjacent text/thinking deltas only when type and stream identity match, after watermark filtering. Reuse immutable historical display slices and avoid extracting historical text on message-action cache hits.
- Formatting: retain queued work across incoming updates and publish updated content through the stable template path in one formatting turn. Skip preview lexing when sanitized markup contains no code blocks. Bound cached key/HTML content to 1,000,000 characters as well as 300 entries.
- Added a browser regression using the real preview-enabled rendering service. It checks visible progress during continuous updates and preservation of code-control DOM.

## Evidence

- A 100-delta burst performs zero historical statistics/context reads while forwarding all events. Explicit reads still return fresh state and the partial response.
- 200 compatible deltas with 1,000 historical messages reduce to one transcript-reducer call, preserving historical identities. Mixed streams, thinking/text transitions, tool events, and finalization retain sequential semantics.
- 100 repeated action-cache hits perform no additional historical-text reads.
- Negative browser control: built the original source in a temporary directory with the same preview-enabled fixture. The new streaming test failed because prose never advanced during the stream. It passes with the changes on all four browser projects.
- Small desktop Chromium rendering probe (30 updates, 1,000 loaded prose messages): median ChatView update was 5.0 ms before and 4.7 ms after; p95 was 7.7 ms before and 9.1 ms after. This is noisy and not evidence of a broad rendering speedup. It excludes model/network latency and deferred paint. Historical template traversal remains.

## Verification

Passing checks:

- Server: `npm test -- src/server/sessions/piSessionService.streamingStatus.test.ts src/server/sessions/piSessionService.transcriptSnapshot.test.ts src/server/sessions/piSessionService.activityPresentation.test.ts src/server/sessions/piSessionService.activityMarker.test.ts src/server/sessions/piSessionService.promptQueue.test.ts src/server/sessions/piSessionService.extensionDialogs.test.ts src/server/sessions/piSessionService.compaction.test.ts src/server/sessions/piSessionEvents.test.ts src/server/sessions/piSessionEvents.integration.test.ts src/server/sessions/piSessionService.unread.test.ts` — 113 tests.
- Transcript/client: `npm test -- src/client/src/chatTranscriptStore.test.ts src/client/src/chatTranscript.test.ts src/client/src/chatMessages.test.ts src/client/src/chatGroups.test.ts src/client/src/plugins/messageActions.test.ts src/client/src/controllers/sessionController.liveEvents.test.ts src/client/src/controllers/sessionController.transcriptRace.test.ts src/client/src/controllers/sessionController.streamSeed.test.ts src/client/src/components/ChatView.messageActions.test.ts` — 222 tests.
- Formatting: `npm test -- src/client/src/components/FormattedText.progressive.test.ts src/client/src/components/FormattedText.codeBlocks.test.ts src/client/src/formatting/contentRendering.test.ts src/client/src/formatting/markdown.test.ts` — 100 tests.
- `npm run test:browser -- --project=chromium --project=touch` — 40 tests.
- `CFFIXED_USER_HOME=<temporary-home> npm run test:browser -- --project=firefox` — 20 tests. Without that isolated macOS home Firefox failed to launch with “Could not find profile folder.”
- `CFFIXED_USER_HOME=<temporary-home> npm run test:browser -- test-fixtures/browser/streaming.spec.ts` — all four browser projects passed.
- Scoped ESLint, `npm run typecheck:cached`, and `git diff --check`. An unnecessary optional chain in the new browser test was corrected after the first lint run.

Checks with failures, not counted as passing:

- Full WebKit project: 18 passed, two focus tests failed (localization keyboard navigation and nested-modal focus restoration). Both failures reproduced against the original built fixture.
- `sessionController.refresh.test.ts`: 17 passed, one stale-route test failed due to preceding cached message state. The same failure reproduced in a temporary checkout of the original source; the isolated test passes. No production recovery behavior was changed to accommodate it.
- Expanded formatting suite: 282 passed, one Mermaid highlighting test failed because the test environment lacked its canvas context. The formatting subagent reproduced it with the changed production files restored to baseline.
- The negative-control streaming test intentionally failed against original code; it demonstrates that the new test catches the publication stall.

## Remaining limits and stopping point

Keep periodic snapshot reconciliation: it recovers silently stalled streams and owns ordering/watermark consistency. Do not simply disable it during streaming. Whole-response snapshot cloning, per-token activity frames, historical template traversal, and full-source Markdown parsing remain candidates for a measured follow-up. The current rendering probe does not justify a broad virtualization rewrite. No end-to-end user-session trace or heap profile was captured, and no claim is made that every observed delay is fixed.

Independent read-only review found no actionable regressions; its focused eight-file run passed 152 tests. The final stopping point is the remaining unprofiled work, not an assertion that the full suite is green.

No dependencies, transport protocol, durable transcript format, or public plugin API changed. Full repository verification and package-install smoke were not run; focused application checks apply to this scope.
