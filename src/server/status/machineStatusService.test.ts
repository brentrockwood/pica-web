import { describe, expect, it, vi } from "vitest";
import { CORE_STATUS_FLAGS, type MachineStatusSnapshot } from "../../shared/machineStatus.js";
import { MachineStatusService, type ActiveCwdActivity, type PersistedSessionActivity } from "./machineStatusService.js";
import type { CwdAttribution } from "./workspaceAttribution.js";

const WORKING = CORE_STATUS_FLAGS.working;
const TERMINAL = CORE_STATUS_FLAGS.terminal;
const UNREAD = CORE_STATUS_FLAGS.unread;

describe("MachineStatusService", () => {
  it("cascades persisted activity for idle sessions, compares timestamps, and reattributes/removes rows", async () => {
    const older = "2026-01-01T01:00:00.000Z";
    const newer = "2026-01-02T01:00:00.000Z";
    const history = [
      { id: "s1", cwd: "/external/worktree", modified: new Date(newer) },
      { id: "s2", cwd: "/external/worktree", modified: new Date(older) },
      { id: "s3", cwd: "/other", modified: new Date(older) },
      { id: "orphan", cwd: "/unknown", modified: new Date(newer) },
      { id: "invalid", cwd: "/other", modified: new Date(NaN) },
    ];
    const topology = {
      "/external/worktree": { projectId: "p1", workspaceId: "w1" },
      "/other": { projectId: "p1", workspaceId: "w2" },
    };
    const { service, published } = statusService({ history, topology });
    await service.refresh();
    expect(service.snapshot()).toMatchObject({
      machine: {}, projects: {}, workspaces: {}, sessions: {},
      lastActivity: {
        sessions: { s1: newer, s2: older, s3: older, orphan: newer },
        workspaces: { w1: newer, w2: older }, projects: { p1: newer },
      },
    });
    history.reverse();
    await service.refresh();
    expect(published).toHaveLength(1);
    topology["/other"] = { projectId: "p2", workspaceId: "w2" };
    history.splice(0, history.length, { id: "s3", cwd: "/other", modified: new Date(newer) });
    await service.refresh();
    expect(service.snapshot().lastActivity).toEqual({
      sessions: { s3: newer }, workspaces: { w2: newer }, projects: { p2: newer },
    });
    expect(published).toHaveLength(2);
    const latest = "2026-01-03T01:00:00.000Z";
    history[0] = { id: "s3", cwd: "/other", modified: new Date(latest) };
    await service.refresh();
    expect(service.snapshot().lastActivity).toEqual({
      sessions: { s3: latest }, workspaces: { w2: latest }, projects: { p2: latest },
    });
    expect(published).toHaveLength(3);
  });

  it("lights the project and workspace of an active session in a project the browser never opened", async () => {
    const { service, published } = statusService({
      activity: [{ cwd: "/srv/wt/feature", hasSessionActivity: true, hasTerminalActivity: false }],
      topology: { "/srv/wt/feature": { projectId: "project-1", workspaceId: "workspace-1" } },
    });

    await service.refresh();

    expect(published.at(-1)).toMatchObject({
      machine: { [WORKING]: true },
      projects: { "project-1": { [WORKING]: true } },
      workspaces: { "workspace-1": { [WORKING]: true } },
      unattributed: {},
    });
  });

  it("lights the project of an unread session completion", async () => {
    const { service } = statusService({
      unread: ["/srv/wt/feature"],
      topology: { "/srv/wt/feature": { projectId: "project-1", workspaceId: "workspace-1" } },
    });

    await service.refresh();

    expect(service.snapshot()).toMatchObject({
      machine: { [UNREAD]: true },
      projects: { "project-1": { [UNREAD]: true } },
      workspaces: { "workspace-1": { [UNREAD]: true } },
    });
  });

  it("rolls every flag of a project's workspaces up to the project and the machine", async () => {
    const { service } = statusService({
      activity: [
        { cwd: "/srv/wt/one", hasSessionActivity: true, hasTerminalActivity: false },
        { cwd: "/srv/wt/two", hasSessionActivity: false, hasTerminalActivity: true },
      ],
      unread: ["/srv/wt/two"],
      topology: {
        "/srv/wt/one": { projectId: "project-1", workspaceId: "workspace-1" },
        "/srv/wt/two": { projectId: "project-1", workspaceId: "workspace-2" },
      },
    });

    await service.refresh();

    expect(service.snapshot()).toMatchObject({
      machine: { [WORKING]: true, [TERMINAL]: true, [UNREAD]: true },
      projects: { "project-1": { [WORKING]: true, [TERMINAL]: true, [UNREAD]: true } },
      workspaces: {
        "workspace-1": { [WORKING]: true },
        "workspace-2": { [TERMINAL]: true, [UNREAD]: true },
      },
    });
  });

  it("lights only the machine row through unattributed for a cwd under no known workspace", async () => {
    const { service } = statusService({
      activity: [{ cwd: "/home/user/scratch", hasSessionActivity: true, hasTerminalActivity: false }],
    });

    await service.refresh();

    expect(service.snapshot()).toMatchObject({
      machine: { [WORKING]: true },
      projects: {},
      workspaces: {},
      unattributed: { [WORKING]: true },
    });
  });

  it("omits nodes and flags that are not set", async () => {
    const { service } = statusService({
      activity: [{ cwd: "/srv/wt/feature", hasSessionActivity: false, hasTerminalActivity: true }],
      topology: { "/srv/wt/feature": { projectId: "project-1", workspaceId: "workspace-1" } },
    });

    await service.refresh();

    const snapshot = service.snapshot();
    expect(snapshot.workspaces["workspace-1"]).toEqual({ [TERMINAL]: true });
    expect(snapshot.machine).toEqual({ [TERMINAL]: true });
    expect(snapshot.unattributed).toEqual({});
  });

  it("keeps status flags live and the last timestamps when history reads fail", async () => {
    const activity: ActiveCwdActivity[] = [];
    const { service, logger, failHistoryReads } = statusService({
      activity,
      history: [{ id: "s", cwd: "/repo", modified: new Date("2026-11-01T00:00:00Z") }],
      topology: { "/repo": { projectId: "p", workspaceId: "w" } },
    });
    await service.refresh();
    const previous = service.snapshot().lastActivity;
    failHistoryReads();
    activity.push({ cwd: "/repo", hasSessionActivity: true, hasTerminalActivity: false });
    await service.refresh();
    expect(service.snapshot().machine).toEqual({ [WORKING]: true });
    expect(service.snapshot().lastActivity).toEqual(previous);
    expect(logger.warn.mock.calls[0]?.[0]["err"]).toBeInstanceOf(Error);
    expect(logger.warn.mock.calls[0]?.[1]).toBe("session activity timestamps could not be refreshed");
  });

  it("publishes nothing while the computed tree is unchanged", async () => {
    const activity: ActiveCwdActivity[] = [{ cwd: "/srv/wt/feature", hasSessionActivity: true, hasTerminalActivity: false }];
    const { service, published } = statusService({
      activity,
      topology: { "/srv/wt/feature": { projectId: "project-1", workspaceId: "workspace-1" } },
    });

    await service.refresh();
    await service.refresh();
    activity[0] = { cwd: "/srv/wt/feature", hasSessionActivity: true, hasTerminalActivity: true };
    await service.refresh();

    expect(published).toHaveLength(2);
    expect(published.map((snapshot) => snapshot.revision)).toEqual([1, 2]);
  });

  it("publishes when one child finishes while another session keeps the same cwd working", async () => {
    const sessions = [{ sessionId: "child-1", cwd: "/repo" }, { sessionId: "child-2", cwd: "/repo" }];
    const { service, published } = statusService({
      activity: [{ cwd: "/repo", hasSessionActivity: true, hasTerminalActivity: false }],
      sessions,
      topology: { "/repo": { projectId: "project-1", workspaceId: "workspace-1" } },
    });
    await service.refresh();
    const first = service.snapshot();
    expect(first.sessions).toEqual({ "child-1": { [WORKING]: true }, "child-2": { [WORKING]: true } });

    sessions.shift();
    await service.refresh();
    await service.refresh();

    expect(service.snapshot().sessions).toEqual({ "child-2": { [WORKING]: true } });
    expect(service.snapshot().workspaces).toEqual(first.workspaces);
    expect(service.snapshot().machine).toEqual(first.machine);
    expect(published.map((snapshot) => snapshot.revision)).toEqual([1, 2]);
  });

  it("always exposes a complete session map and merges working with catalog unread flags", async () => {
    const sessions = [{ sessionId: "unread-0", cwd: "/repo" }];
    const unread = ["/repo", "/scratch"];
    const { service } = statusService({ sessions, unread });
    expect(service.snapshot().sessions).toEqual({});

    await service.refresh();

    expect(service.snapshot().sessions).toEqual({
      "unread-0": { [WORKING]: true, [UNREAD]: true },
      "unread-1": { [UNREAD]: true },
    });
    sessions.length = 0;
    unread.length = 0;
    await service.refresh();
    expect(service.snapshot().sessions).toEqual({});
  });

  it("keeps one epoch and a monotonic revision across publications", async () => {
    const unread: string[] = [];
    const { service, published } = statusService({ unread });

    await service.refresh();
    unread.push("/home/user/scratch");
    await service.refresh();
    unread.length = 0;
    await service.refresh();

    expect(published.map((snapshot) => snapshot.revision)).toEqual([1, 2]);
    expect(new Set(published.map((snapshot) => snapshot.epochId)).size).toBe(1);
    expect(service.snapshot().epochId).toBe(published[0]?.epochId);
  });

  it("recomputes once more when a change is reported while a pass is in flight", async () => {
    const unread: string[] = [];
    const { service, published, attribute } = statusService({ unread });

    const first = service.refresh();
    unread.push("/home/user/scratch");
    service.notifyChanged();
    await first;

    expect(attribute).toHaveBeenCalledTimes(2);
    expect(published).toHaveLength(1);
    expect(published[0]?.unattributed).toEqual({ [UNREAD]: true });
  });

  it("keeps serving the last snapshot and logs when a status source fails", async () => {
    const { service, published, logger, failUnreadReads } = statusService({
      unread: ["/home/user/scratch"],
    });
    await service.refresh();
    const lastGood = service.snapshot();

    failUnreadReads();
    await service.refresh();

    expect(service.snapshot()).toBe(lastGood);
    expect(published).toHaveLength(1);
    expect(logger.warn.mock.calls).toHaveLength(1);
    const [details, message] = logger.warn.mock.calls[0] ?? [];
    expect(message).toBe("machine status projection could not be recomputed");
    expect(details?.["err"]).toBeInstanceOf(Error);
  });

  it("logs instead of rejecting into the daemon when publication fails", async () => {
    const { service, logger, failPublication } = statusService({ unread: ["/home/user/scratch"] });
    failPublication();

    await expect(service.refresh()).resolves.toBeUndefined();

    expect(service.snapshot().revision).toBe(1);
    const [details, message] = logger.warn.mock.calls[0] ?? [];
    expect(message).toBe("machine status projection could not be published");
    expect(details?.["err"]).toBeInstanceOf(Error);
  });
});

interface StatusServiceScenario {
  history?: PersistedSessionActivity[];
  activity?: readonly ActiveCwdActivity[];
  sessions?: readonly { sessionId: string; cwd: string }[];
  unread?: readonly string[];
  topology?: Record<string, CwdAttribution>;
}

/**
 * Assembles the service over in-memory sources. The scenario arrays stay live,
 * so a test mutates them to model a status change and calls `refresh` again.
 */
function statusService(scenario: StatusServiceScenario = {}) {
  const activity = scenario.activity ?? [];
  const unread = scenario.unread ?? [];
  const topology = scenario.topology ?? {};
  const published: MachineStatusSnapshot[] = [];
  const logger = { warn: vi.fn<(details: Record<string, unknown>, message: string) => void>() };
  let failUnreadRead = false;
  let failHistoryRead = false;
  let failPublish = false;

  const attribute = vi.fn((cwds: Iterable<string>) => Promise.resolve(
    new Map([...cwds].flatMap((cwd) => {
      const attribution = topology[cwd];
      return attribution === undefined ? [] : [[cwd, attribution] as const];
    })),
  ));

  const service = new MachineStatusService({
    ...(scenario.history === undefined ? {} : { history: { snapshot: () => failHistoryRead ? Promise.reject(new Error("history unavailable")) : Promise.resolve(scenario.history ?? []) } }),
    activity: { snapshot: () => ({ workspaces: [...activity], sessions: [...(scenario.sessions ?? [])] }) },
    unread: {
      catalogSnapshot: () => {
        if (failUnreadRead) throw new Error("unread store unavailable");
        return { sessions: unread.map((cwd, index) => ({ sessionId: `unread-${String(index)}`, cwd })) };
      },
    },
    attribution: { attribute },
    publisher: {
      publish: (snapshot) => {
        if (failPublish) throw new Error("event hub unavailable");
        published.push(snapshot);
      },
    },
    logger,
  });

  return {
    service,
    published,
    attribute,
    logger,
    failHistoryReads: (): void => { failHistoryRead = true; },
    failUnreadReads: (): void => {
      failUnreadRead = true;
    },
    failPublication: (): void => {
      failPublish = true;
    },
  };
}
