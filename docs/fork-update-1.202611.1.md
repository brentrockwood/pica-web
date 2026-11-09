# Upstream integration: 1.202611.1

Status: prepared on `chore/upstream-1.202611.1`; **not activated or pushed**. The live checkout remains at `f8c0f138` on `fix/wrapping-chat-tables`. No live service restart, configuration change, or migration backup has been performed.

The staging worktree is `~/src/worktrees/pica-web/update-1.202611.1`. It must remain available until activation or an explicit cleanup decision. Follow the [fork-update runbook](fork-updates.md) for future releases and activation.

## Integration decisions

- Merge the published `v1.202611.1` tag (`98316bd8`), retaining fork history rather than replaying commits.
- Preserve pending prompt receipts, theme-aware Mermaid, and wrapping tables. Workspace-collapse behavior is now present upstream.
- Move Lab (`themes:pica`) into the declarative theme package. Preserve its Graphite base, conversation stylesheet, localization, and preference identity; supply startup colours for the gateway default.
- Update tests for the new theme catalog and shadow-DOM browser fixture. Isolate controller session storage on Node 26. Normalize existing filesystem paths in package smoke assertions to handle macOS `/var` aliases.
- Add an isolated test runner because inheriting the live Pi agent directory caused SDK tests to load real MCP configuration and hang. Also isolate Git signing configuration and enable npm lifecycle scripts within the test subprocess.

## Verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 10 moderate lint-tool dependency advisories accepted by the user; no audit-driven dependency changes |
| `node scripts/test-fork-update.mjs` | Passed: 733 files / 9,289 tests; 1 file / 35 tests skipped by the suite |
| `npm run typecheck:cached` | Passed |
| Whole-project ESLint plus affected-file rechecks | Passed after fixing a browser-test type assertion |
| `npm run knip` | Passed |
| `npm run build` | Passed; existing large-chunk warning remains |
| `npm run check:artifacts` | Passed: 4 files / 15 tests |
| `npm run smoke:package-install` | Passed after realpath normalization |
| Table wrapping: Chromium, WebKit, touch | Passed: 3 browser tests, covering 320/560/900px widths |
| Chromium + touch browser suite | 197 passed / 1 failed: touch Playground dark “Missing message anatomy” |
| Earlier full browser run | Not passing: Firefox profile launch failure; WebKit focus/click/scroll failures; Playground failure. The fork table-fixture failure from that run was subsequently fixed |
| Bun smoke | Not run; Bun smoke path comparisons were normalized but its runtime behavior remains unverified |
| Live proxy, startup, migrations, and post-activation behavior | Not run; live deployment was intentionally untouched |

Earlier unisolated full-suite attempts timed out. The completed isolated run supersedes those attempts for ordinary tests, not the separate browser failures. Browser failures remain unresolved; they must not be described as a passing browser gate. Windows/Linux CI has not been run for this integration.

Temporary verification logs are under `/tmp/pica-update-*`; the successful installed-package smoke log is `/tmp/pi-web-update-1.202611.1-package-smoke.fahuvtn8.log`. These are local diagnostic files, not durable artifacts.

## Activation decisions still needed

1. Approve the maintenance window and explicitly accept interruption of active sessions and terminals.
2. Preserve the customized macOS bind addresses/ports when handling the existing separate web, client, and sessiond launchd jobs. The upstream consolidated `ui-dev` layout is not yet installed. Generic service commands do not manage the custom client label.
3. Replace version-specific Pi release selectors in the service definitions with the validated stable managed-install root. Pi and extensions on the interactive machine are manually maintained, not intentionally pinned; Fleet machines update as necessary. No Pi or extension update was performed here.
4. Verify that the reverse proxy preserves public Host (including port) and Origin. Choose a restricted hostname policy after confirming the real access names; no host policy was silently selected here.
5. Take and verify a private, consistent backup in the maintenance window, including external transcript paths and launchd definitions. Account for the session-pin migration and any state changes before attempting rollback.
6. Activate updated web/API and client before sessiond, then verify streaming, terminals, pins, themes, and access through the actual proxy.

Do not promote this branch automatically on the strength of the ordinary tests: the browser gate and deployment-specific checks above are incomplete.
