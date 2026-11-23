# PI WEB 1.202611.5 staging verification

**Not activated. The full browser gate is red.** The staging merge combines the fork’s conversation-search commit `b5be63ff` with upstream `v1.202611.5` (`09d6e5fb`). No deployment or service configuration change was needed to test it.

The conflict resolutions retain archived conversation search, activity sorting, chat timestamps, and cached chat-line identity while adopting upstream’s heartbeat-based usage statistics, terminal-aware status badges, and standalone tool rendering. Six fork test cases initially failed on the new statistics timing; the revised assertions check forwarding and status updates without requiring fresh token and cost calculations on every read.

| Staging check | Result |
| --- | --- |
| Full isolated ordinary suite | 9,892 passed, 35 skipped; exit 0. Output included localStorage warnings, a refused localhost connection, and a happy-dom teardown AbortError. |
| Cached typecheck, full ESLint, Knip | Passed |
| Production build, artifact tests, installed-package smoke | Passed; 17 artifact tests, npm 12.0.1 smoke |
| Disposable daemon with host Pi 1.6.0 | Health and runtime routes reported the intended versions on an isolated socket; exited cleanly on SIGTERM. No model call or live deployment test. |
| Dependency audit | Nine moderate findings in the development dependency tree; none with development dependencies omitted. No dependency changes applied. |
| Full browser matrix | 566 passed, 5 failed, 9 skipped; exit 1. One failure passed on focused rerun. |

The five failing browser cases were WebKit focus after **Reset order** and **Show secret**, Chromium and touch drop targeting on the final row, and touch edge autoscroll. All five test/profile pairs also failed against the exact upstream tag. Touch autoscroll passed on the staging rerun. The first Chromium failure was a visibility assertion; focused staging and upstream runs failed later on the drop indicator instead. The initial visibility failure is not independently attributed. The two WebKit failures recorded for `.3` did not recur.

Before activation, decide whether to fix or explicitly accept the browser failures. Review the broader effect of `archive_self` on tracked descendants; cross-project messaging is optional and defaults off. Use the [fork activation procedure](fork-updates.md#4-plan-activation-and-backup), not the in-app restart buttons, for a checkout with a separately named client service.
