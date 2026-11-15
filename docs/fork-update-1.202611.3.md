# Upstream integration: 1.202611.3

Status: prepared in the existing `chore/upstream-1.202611.1` worktree, with two reproduced upstream WebKit test failures noted below. Not activated or published at the time of this record.

## Authorization and priorities

The user approved the recommended update to released `v1.202611.3`, the narrow large-image validation fix, and activation/restarts as necessary. Recent-activity sorting and performance improvements are explicit priorities. Remote publication was not requested.

Preserve Recent activity as the default sort mode, activity timestamps, pinned hierarchy, and ordering holds while hovered/focused or using menus. Project/workspace drag reordering applies only in Manual mode; it must not silently replace the default or make drops appear ineffective under automatic sorting.

Preserve the streaming fixes from `2e9c02e3`: skip historical status aggregation for partial assistant updates, reuse SDK context usage, batch compatible deltas after watermark filtering, retain historical display identities, avoid full-text action-cache keys, prevent formatting publication starvation, and bound Markdown cache retention. Integrate them with upstream Markdown extensions and viewport compensation rather than replacing those features.

## Exact inputs

- Previously verified integration: `9d48e612`, including fork main `79805b19` and upstream `v1.202611.1` (`98316bd8`).
- Current live checkout/rollback source: `2e9c02e3` (`perf/long-session-streaming`).
- Target release: `v1.202611.3` (`3f22091b`).
- Additional upstream patch: `b97c0fab`, large-image base64 validation without regexp stack overflow.
- Do not include later automatic dialog dismissal or upstream-specific repository automation merely to obtain the image fix.

## Execution

1. Merge the performance branch into staging and verify the affected rendering/transcript/server contracts.
2. Merge the released target and reconcile navigation drag support with fork sorting. Add regressions for the combined behavior.
3. Apply the image fix; review clean merges affecting config, MCP, session state, and provisioning.
4. Run focused checks, then the isolated full suite, typecheck/lint/Knip, build/artifact checks, browser suite, and installed-package smoke. Record failures and reruns honestly.
5. Review and commit the verified staging result. Keep private runtime inventory and backups outside Git.
6. Before activation, inspect current service definitions, SDK selection, storage locations, and proxy behavior. Use a detached one-shot service-manager job for the authorized interruption. Stop watchers before replacing live source/dependencies; quiesce writers and verify a private backup before migrations. Start updated web/client before sessiond, then verify readiness and notify success or failure.

## Verification record — November 14

Performance was merged as `6ad35777`, preserving upstream Markdown extensions and viewport compensation. The `.3` conflicts were limited to navigation integration. The image fix was applied from `b97c0fab` without taking later upstream changes.

| Check | Result |
| --- | --- |
| Performance merge focused tests | 660 passed |
| Navigation integration focused tests | 264 passed |
| Runtime/config/MCP/provisioning focused tests | 340 passed |
| Image validation tests | 55 passed |
| Full isolated ordinary suite | 9,556 passed, 35 skipped; 757 files passed, 1 skipped; exit 0 |
| Full browser suite | 492 passed, 2 failed, 6 skipped; exit 1 |
| Typecheck, full ESLint, Knip | Passed |
| Production build and artifact checks | Passed; 16 artifact tests |
| Installed-package smoke | Passed with npm 12.0.1, including host-selected SDKs, peers, update/restart, daemon, plugin API, and PTY |
| Independent source review | No actionable regressions in the requested integration paths |

The ordinary suite emitted localStorage experimental warnings, one refused localhost connection diagnostic, and a happy-dom teardown AbortError despite exiting successfully. These diagnostics were not investigated further. The browser skips are native-touch gestures on desktop profiles; both gesture cases passed in the touch profile.

The two browser failures concern WebKit restoring focus after closing the image gallery and the MCP refresh confirmation. Both failures reproduced in an unmodified `v1.202611.3` source snapshot and in a focused staging rerun: two failures, exit 1, in each run. The relevant specs, fixtures, and focus-handling source are byte-identical to upstream. They are recorded as existing upstream failures in this macOS/WebKit environment, not integration regressions; this is still not a passing full-browser gate. Focused navigation browser checks passed, including default Recent activity, Manual-only dragging, Copy-menu holds, and pinned hierarchy. No new performance benchmark was run.

## Activation

Not activated at the time of this record. The private one-shot launchd runner is prepared but not dispatched. It will stop source watchers and the daemon, verify cloned backups and hashes before source/dependency changes, preserve the existing three-service topology and ports, and select Pi through the stable managed install root. It will fast-forward local `main` only; it will not push.

Readiness checks cover direct and proxied health/version, stored settings and projects, plugin manifests, same-origin validation and cross-origin rejection, WebSocket handshakes, and stable processes. Backup inventories, exact service definitions, target SHA, scheduling, and post-activation results belong in the private activation packet, not this repository. A failed cutover stops for inspection rather than automatically restoring state or cycling services.

The earlier generic restart attempt rejected the custom service definitions before stopping them; it did not activate the daemon-side performance work. This cutover uses the existing launchd labels directly.
