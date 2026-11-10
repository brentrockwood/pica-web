# Updating the pica-web fork

This checkout is a customized fork, not an installation of the upstream npm package. Updating the global `pi-web` command does not update services running from this source tree. The built-in updater follows the current branch's tracking remote; it does not integrate releases from a different upstream repository or resolve fork conflicts.

Latest prepared integration: [1.202611.1 status and verification](fork-update-1.202611.1.md).

Use this procedure for upstream integrations. Keep preparation separate from activation: development services can reload source changes immediately, even before the session daemon restarts.

## 1. Inspect without changing the running application

From the fork checkout:

```sh
git status --short
git remote -v
git branch -vv
git worktree list
npm view @jmfederico/pi-web version
git fetch upstream --tags
```

`origin` should be the fork and `upstream` the original PI WEB repository. Choose an exact published release tag, rather than moving `upstream/main`. Inspect the complete release notes since the previous integration:

```sh
release=v1.202611.1 # Replace with the selected release.
git show "$release:CHANGELOG.md"
git log --oneline HEAD.."$release"
git log --oneline "$release"..HEAD
git diff --stat HEAD..."$release"
```

Check which checkout and commands the installed services actually use. On macOS, inspect `~/Library/LaunchAgents/com.pi-web.*.plist` and running processes; on Linux, inspect the installed systemd user units. Do not assume a global CLI binary belongs to the running source version.

## 2. Prepare away from live autoreload

Get approval before creating a worktree. Start from the commit actually deployed, including its local fixes—not a potentially stale `main` branch. Record that commit for rollback.

```sh
git rev-parse HEAD
# Example paths and branch; choose unused names for each integration.
git worktree add ../worktrees/pica-web/update-1.202611.1 \
  -b chore/upstream-1.202611.1 HEAD
cd ../worktrees/pica-web/update-1.202611.1
git merge --no-commit --no-ff v1.202611.1
```

The relative paths above assume the live checkout is `~/src/pica-web`, placing the worktree under `~/src/worktrees/pica-web/`. Use absolute paths if that layout differs.

Resolve conflicts by preserving behavior, not by accepting an entire side. Inspect even cleanly merged fork changes against the new release. Review each local-only commit: a fix may already exist upstream under a different commit ID.

Current fork regression checklist:

- Lab (`pica`) theme registration, CSS, localization, and initial loading colours.
- Mermaid diagrams follow the active theme and retain their safe isolated rendering.
- Submitted prompts appear while awaiting server receipt, then reconcile without duplicates.
- Collapsing the workspace pane returns to Chat and preserves the selected tool.
- Chat tables wrap within the available width, including long links and code.
- Optional gateway-wide chat timestamps survive config persistence and appear on conversation, system, expanded activity, and image-source messages.
- Navigation activity includes inactive sessions, preserves pinned trees, and pauses automatic sorting while hovered or focused, including action menus. Keep upstream Needs-input flags alongside activity timestamps.

Do not start a second PI WEB instance with the inherited environment of a live session. Any isolated runtime test must use its own data directory, config, socket or TCP endpoint, and ports. Component browser fixtures do not need a session daemon.

## 3. Verify the integration

Install dependencies in the worktree, not the live checkout:

```sh
npm ci
npm run generate:material-icons
npm run typecheck:cached
npm run lint
npm run knip
node scripts/test-fork-update.mjs
npm run build
npm run check:artifacts
node scripts/test-fork-browser.mjs
```

The explicit icon-generation step also works when npm lifecycle scripts are disabled. The fork test runner enables lifecycle scripts only for its subprocess, without changing global npm policy. It runs the ordinary Vitest suite with two workers and forwards extra Vitest arguments, so `node scripts/test-fork-update.mjs src/client/src/pendingPrompts.test.ts` is a focused run.

The runner gives tests temporary HOME, Pi agent/MCP configuration, PI WEB state/config/socket paths, and empty user/system Git configuration. It retains the nested-session marker and cleans up its temporary directory afterward. This avoids reading the live agent's MCP configuration and requiring signed fixture commits. It is configuration isolation, not a sandbox: PATH and unrelated environment variables remain inherited, and tests still execute with your permissions. Generate assets before invoking it; it deliberately bypasses npm's pretest hook.

A full release integration spans many boundaries, so use all four verification stages above here; they cover the same checks as `npm run verify`, with isolated test configuration. During conflict resolution, use focused tests first. See [development checks](development-checks.md) for browser prerequisites, installed-package smoke triggers, and platform coverage. Run the package-install smoke check when the integration changes those installed boundaries; it requires registry access and is not a live service test.

The browser runner forwards Playwright arguments (for example `--project=firefox`). On macOS it supplies a disposable `CFFIXED_USER_HOME` so Firefox can initialize without accessing the real user's protected Firefox data. It removes only that temporary home's macOS deny-delete ACLs during cleanup; no real-home permissions change. Other platforms use the normal browser environment. Browser binaries must already be installed; the wrapper does not download them.

Report failures, skipped checks, and dependency audit warnings explicitly. Do not run `npm audit fix --force` as part of an upstream merge. Review security updates separately rather than silently changing the selected release's dependency graph.

Review the final fork delta with `git diff <release-tag>` and check for secrets before committing. Finish the merge and commit the update notes only after reviewing the resolutions. Publishing the branch or changing the deployed checkout is a separate step; do not imply either happened just because tests passed.

## 4. Plan activation and backup

Before touching the live checkout:

1. Record the old/new commits, configuration paths, service definitions, ports, and launch commands. Save copies of service definitions outside Git.
2. Review every intervening release's migration and compatibility notes, including supported Pi/runtime versions. Pi and extensions are manually maintained on the interactive machine, not intentionally pinned. For managed Pi installs, service configuration should select the stable installation root rather than a version-specific release directory; validate the resolved current installation before changing definitions. Other Fleet machines may update Pi as needed for compatibility, within their approved maintenance scope.
3. Check proxy and hostname requirements without weakening access controls. Preserve public `Host` (including nonstandard ports) and browser `Origin`. See [browser request security](config.md#browser-request-security).
4. Ask for explicit approval for the interruption. Restarting the session daemon stops active session runs and terminals, including an agent performing the update.
5. Back up `$PI_WEB_DATA_DIR`, the effective global config (`$PI_WEB_CONFIG` or `~/.config/pi-web/config.json`), and any externally stored session/archive data. Keep backups private and outside the repository. Inspect configured storage paths rather than assuming the data directory contains all transcripts.

A copy made while the daemon is writing is not a guaranteed consistent backup. For a rollback-quality snapshot, quiesce writers in the approved maintenance window or use an appropriate consistent snapshot method. Verify backup completion and available disk space before applying migrations. Do not overwrite newer data with an old snapshot without separately approving that data loss.

## 5. Activate in an approved maintenance window

Use a separate terminal or a detached service-manager job, not a sleeping child of the session that will be interrupted. Inspect the source checkout's current CLI and installed definitions before choosing the restart command; a stale global CLI may implement a different service layout.

Prevent development watchers from loading a half-updated checkout or dependencies. Stop the web/UI watchers as part of the approved maintenance window, move the live checkout to the verified integration commit, install its locked dependencies, and prepare the required build outputs. Start/restart the updated web/API and development UI **before restarting the session daemon**. Never leave an old web/API writing state after a daemon migration.

Do not casually reinstall services: upstream service-layout changes may alter the service names, bind addresses, ports, retained Pi selection, and config options. Preserve the deployment's settings and review the generated definitions. Only adopt a new layout as an explicit part of activation.

If scheduling a restart from inside PI WEB, report the operation and delay before the detached job runs. On macOS use a launchd-owned handoff; on Linux use a systemd user timer. Do not report completion until an independent check confirms it.

After activation verify:

- All expected services stay running and logs show no startup/migration errors.
- The intended hostname opens through the real proxy; HTTP mutations and WebSockets work.
- Existing projects, sessions, pins, and settings remain accessible.
- A new prompt streams, a terminal works, and the fork regression checklist still holds.
- The UI/runtime reports the expected release and the live checkout has the intended commit.

If activation fails, stop and inspect before retrying. Rolling back source alone may not reverse a data migration. Use the recorded old commit and service definitions, and assess state compatibility before restoring any backup.

## 6. Leave a durable handoff

Record the integrated tag, deployed commit (or explicitly “not activated”), checks and failures, backup location, config/service changes, and remaining follow-up. Do not put private backup contents or credentials in Git.

Keep this runbook linked from the fork README. After activation, ask before removing the staging worktree or deleting its branch. Never remove a worktree with uncommitted changes. Use `git worktree list` to inventory retained worktrees; remove them with Git, not recursive filesystem deletion.
