# Upstream integration: 1.202611.1

Status: refreshed in the existing `chore/upstream-1.202611.1` worktree; **not activated or pushed**. The live checkout remains at `79805b1945e758277f6cd089d1f91edd9778c717` on `main`, matching fetched `origin/main`. No live service restart, configuration change, or migration backup has been performed.

The staging worktree is `~/src/worktrees/pica-web/update-1.202611.1`. It must remain available until activation or an explicit cleanup decision. Follow the [fork-update runbook](fork-updates.md) for future releases and activation.

## Integration decisions

- Merge the published `v1.202611.1` tag (`98316bd8`), retaining fork history rather than replaying commits.
- Preserve pending prompt receipts, theme-aware Mermaid, and wrapping tables. Workspace-collapse behavior is now present upstream.
- Move Lab (`themes:pica`) into the declarative theme package. Preserve its Graphite base, conversation stylesheet, localization, and preference identity; supply startup colours for the gateway default.
- Update tests for the new theme catalog and shadow-DOM browser fixture. Isolate controller session storage on Node 26. Normalize existing filesystem paths in package smoke assertions to handle macOS `/var` aliases.
- Add an isolated test runner because inheriting the live Pi agent directory caused SDK tests to load real MCP configuration and hang. Also isolate Git signing configuration and enable npm lifecycle scripts within the test subprocess.

## Refresh with current fork main

Brent approved staging integration and verification after reviewing `docs/upstream-integration-handoff.md` in the live checkout. This approval does not cover publication, promotion, service-definition changes, or restart. The worktree merges `origin/main` at `79805b19` into the prepared `3a233a29` branch; the upstream target remains released `v1.202611.1`, not the two later upstream commits.

All 17 textual conflicts were resolved by behavior. The timestamp setting participates in the new configuration registry, persistence, environment enforcement, and reset/source metadata. Chat timestamps retain upstream message frames, structured session-message senders, custom renderers, and the deferred-scroll compensation. Navigation retains hover/focus ordering holds, manual moves, pinned hierarchy, copy-ID actions, loading feedback, theme hooks, and Needs-input cues. Activity uses `knownWorkspaces()` without restoring discovery on status reads; discovery publication and archival invalidate the activity cache.

The first broad checks exposed missing language-pack namespace registration and two move-action fixtures that needed Manual sorting. The navigation browser fixture also compared viewport position across intentional keyboard scrolling: it now measures geometry after ArrowDown and before Enter, retaining the selection-geometry and native keyboard assertions. All four engines passed the focused navigation rerun. A source review also found that the shared history scanner swallowed read errors before the activity service could retain its previous timestamps; activity scanning now propagates those failures without changing ordinary tolerant session-listing behavior.

Dependency manifests and lockfile are unchanged from the previously installed staging branch, so dependencies were reused rather than reinstalled. Icons were explicitly regenerated. Current refresh verification is recorded separately from the historical preparation results below.

### Refresh verification (2026-11-10)

| Check | Result |
| --- | --- |
| `node scripts/test-fork-update.mjs` | Final run passed: 737 files / 9,354 tests; 1 file / 35 tests skipped by the suite |
| `npm run typecheck:cached` | Passed after final source changes |
| `npm run lint` | Passed; scoped ESLint passed again for files changed afterward |
| `npm run knip` | Passed after final source changes |
| `npm run build` | Passed after final source changes; existing large-chunk warning remains |
| `npm run check:artifacts` | Passed after final build: 4 files / 15 tests |
| `node scripts/test-fork-browser.mjs` | Final run passed: all 396 cases across Chromium, Firefox, WebKit, and touch |
| `npm run smoke:package-install` | Passed after final build, exit 0 |
| Fork-delta secret scan | TruffleHog offline scan reported zero findings; no credential verification requests |
| Diff hygiene | Passed; all conflict entries resolved and staged |

The first full ordinary run failed 6 tests in 2 files (9,339 passed); the first full browser run failed 4 navigation cases (392 passed). The fixes and successful reruns above supersede those results, not conceal them. Final ordinary-test output still includes localhost:3000 connection-refused diagnostics and Node localStorage experimental warnings; these were not separately traced to their emitting tests. Vitest exited 0 with no failed tests.

Browser screenshots were also inspected for narrow touch navigation and timestamped system messages. The final browser run preceded only backend scanner changes; no browser source or fixture changed afterward. Final build/package checks include those backend changes and language-pack registration fixes.

Logs: `/tmp/pica-refresh-full-tests-final.log`, `/tmp/pica-refresh-browser-final.log`, `/tmp/pica-refresh-typecheck-final.log`, `/tmp/pica-refresh-lint.log`, `/tmp/pica-refresh-lint-final.log`, `/tmp/pica-refresh-knip-final.log`, `/tmp/pica-refresh-build-final.log`, `/tmp/pica-refresh-artifacts-final.log`, `/tmp/pica-refresh-package-smoke-final.log`, and `/tmp/pica-refresh-secrets.log`. These are temporary local diagnostics.

Not run: Bun runtime smoke (this deployment uses Node), Windows/Linux CI, physical iPad/Safari, or live proxy/startup/migration checks. No dependency reinstall or fresh audit was needed for the unchanged lockfile; the earlier accepted lint-tool advisories remain historical evidence, not a fresh audit result. Brent subsequently authorized the local merge commit. The staging worktree remains retained; no publication, promotion, or cleanup has occurred. Next: authorize publication separately, then approve the activation decisions below before touching live services.

## Historical preparation verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 10 moderate lint-tool dependency advisories accepted by the user; no audit-driven dependency changes |
| Full ordinary suite before the browser-fix follow-up | Passed: 733 files / 9,289 tests; 1 file / 35 tests skipped by the suite |
| Follow-up scroll/render, browser-wrapper, and documentation tests | Passed: 8 files / 164 tests; full ordinary suite not repeated for this bounded follow-up |
| `npm run typecheck:cached` | Passed |
| Whole-project ESLint plus affected-file rechecks | Passed after fixing a browser-test type assertion |
| `npm run knip` | Passed |
| `npm run build` | Passed; existing large-chunk warning remains |
| `npm run check:artifacts` | Passed: 4 files / 15 tests |
| `npm run smoke:package-install` | Passed after realpath normalization |
| Table wrapping: Chromium, WebKit, touch | Passed: 3 browser tests, covering 320/560/900px widths |
| `node scripts/test-fork-browser.mjs` after follow-up fixes | Passed: all 396 cases across Chromium, Firefox, WebKit, and touch |
| Repeated regressions | Passed: 36 Playground runs and 30 WebKit code-scroll/message-frame runs |
| Bun smoke | Not run; Bun smoke path comparisons were normalized but its runtime behavior remains unverified |
| Live proxy, startup, migrations, and post-activation behavior | Not run; live deployment was intentionally untouched |

A follow-up baseline run against an isolated source archive of the live `f8c0f138` commit reproduced the Firefox profile-launch failure (19/19 Firefox cases) and both existing WebKit focus failures (language-settings Apply button and nested-dialog trigger restoration; 17 other WebKit cases passed). Those failures are not new upgrade regressions. Playground and the newer browser cases do not exist in that baseline, so this comparison does not establish their regression status. The deployed UI itself was not exercised by the baseline test.

Earlier unisolated full-suite attempts timed out. The completed isolated run supersedes those attempts for ordinary tests. Initial browser runs also failed; the final 396-case browser run passed after the fixes below. Windows/Linux CI and physical Safari/iPad testing have not been run for this integration.

### Browser-failure follow-up

- Firefox: macOS denied access to the real Firefox application-data directory. The new browser wrapper supplies a disposable `CFFIXED_USER_HOME`; it does not change OS settings or permissions on the real home. All 99 Firefox cases now run and pass.
- Playground: the test measured the assistant paragraph before its independently deferred Markdown rendering finished. Wait for each measured paragraph, retaining geometry/hit-testing assertions.
- WebKit focus: use native macOS Option+Tab for full keyboard navigation. Establish focus with keyboard activation before asserting its restoration; mouse clicks need not focus buttons on macOS. Assertions remain intact.
- Message actions: click an unobscured interior point of the edge-aligned button, retaining native hit testing. Native overlay scrollbars can still overlap the button's outer edge; this does not change application layout.
- Code scrolling: fix a real transient jump in the incoming upstream deferred-rendering path. Flush completed enhancement compensation before paint through the existing viewport transaction, preserving priority and user-navigation handling. Add a focused unit regression; existing browser scroll assertions are unchanged.

Temporary verification logs are under `/tmp/pica-update-*`, `/tmp/pica-browser-final.log`, and `/tmp/pica-browser-fixes-*`; the successful installed-package smoke log is `/tmp/pi-web-update-1.202611.1-package-smoke.fahuvtn8.log`. These are local diagnostic files, not durable artifacts.

## Activation decisions still needed

1. Approve the maintenance window and explicitly accept interruption of active sessions and terminals.
2. Preserve the customized macOS bind addresses/ports when handling the existing separate web, client, and sessiond launchd jobs. The upstream consolidated `ui-dev` layout is not yet installed. Generic service commands do not manage the custom client label.
3. Replace version-specific Pi release selectors in the service definitions with the validated stable managed-install root. Pi and extensions on the interactive machine are manually maintained, not intentionally pinned; Fleet machines update as necessary. No Pi or extension update was performed here.
4. Verify that the reverse proxy preserves public Host (including port) and Origin. Choose a restricted hostname policy after confirming the real access names; no host policy was silently selected here.
5. Take and verify a private, consistent backup in the maintenance window, including external transcript paths and launchd definitions. Account for the session-pin migration and any state changes before attempting rollback.
6. Activate updated web/API and client before sessiond, then verify streaming, terminals, pins, themes, and access through the actual proxy.

The browser gate now passes. Promotion still requires the deployment-specific checks and explicit interruption approval above.
