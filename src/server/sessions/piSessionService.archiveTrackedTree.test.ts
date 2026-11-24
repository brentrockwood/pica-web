import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../piSdk.js";
import { createPiWebCustomToolDefinitions, PiSessionService, type PiSessionListEntry } from "./piSessionService.js";
import { CapturingSessionEventHub, emptyArchiveStore, fakeRuntime, sessionGateway, sessionRecord, sessionRef, stubExtensionToolContext } from "./piSessionService.testSupport.js";
import type { ArchivedSessionRecord, ArchiveSessionInput } from "./sessionArchiveStore.js";
import { SessionNotificationStore } from "./sessionNotificationStore.js";
import { readArchiveProvenance } from "./sessionSummaryScanner.js";
import { parsePersistedParentSubsessionLink } from "./subsessionProvenance.js";

function fixture(childFile = sessionRecord("child").path) {
  const records: PiSessionListEntry[] = ["root", "child", "grandchild", "independent", "fork"].map((id) => ({
    ...sessionRecord(id),
    ...(id === "child" ? { path: childFile } : {}),
    ...(["child", "fork"].includes(id) ? { parentSessionPath: sessionRecord("root").path } : {}),
    ...(id === "grandchild" ? { parentSessionPath: childFile } : {}),
  }));
  const runtimes = new Map(records.map((record) => {
    const manager = SessionManager.inMemory(record.cwd, { id: record.id, ...(record.parentSessionPath === undefined ? {} : { parentSession: record.parentSessionPath }) });
    return [record.id, fakeRuntime(record.id, { sessionManager: manager, sessionFile: record.path })];
  }));
  const runtime = (id: string) => {
    const found = runtimes.get(id);
    if (found === undefined) throw new Error(`Missing fixture runtime: ${id}`);
    return found;
  };
  function link(parent: string, child: string) {
    runtime(parent).session.sessionManager.appendCustomEntry?.("pi-web.subsession.link", {
      spawnedBySessionId: parent, spawnedSessionId: child, spawnedSessionFile: runtime(child).session.sessionFile, cwd: "/workspace",
    });
  }
  link("root", "child");
  link("child", "grandchild");
  // A fork may carry copied links, but they still belong to the original parent.
  runtime("fork").session.sessionManager.appendCustomEntry?.("pi-web.subsession.link", {
    spawnedBySessionId: "root", spawnedSessionId: "child", spawnedSessionFile: sessionRecord("child").path,
  });
  const archived: ArchivedSessionRecord[] = [];
  const toArchived = (input: ArchiveSessionInput): ArchivedSessionRecord => ({
    ...input, originalPath: input.path, archivePath: `/archive/${input.sessionId}.jsonl`, archivedAt: "2026-01-03T00:00:00Z",
  });
  const archiveMany = vi.fn((inputs: readonly ArchiveSessionInput[]) => {
    const saved = inputs.map(toArchived);
    archived.push(...saved);
    return Promise.resolve(saved);
  });
  const list = vi.fn(() => Promise.resolve(records.filter((record) => !archived.some((item) => item.sessionId === record.id))));
  const gateway = sessionGateway(records);
  const open = vi.fn((path: string) => {
    const record = records.find((row) => row.path === path || `/archive/${row.id}.jsonl` === path);
    if (record === undefined) throw new Error(`Missing fixture file: ${path}`);
    return runtime(record.id).session.sessionManager;
  });
  const readProvenance = vi.fn<typeof readArchiveProvenance>((path) => {
    const record = records.find((row) => row.path === path || `/archive/${row.id}.jsonl` === path);
    if (record === undefined) return Promise.resolve(undefined);
    const manager = runtime(record.id).session.sessionManager;
    const parent = manager.getHeader?.()?.parentSession;
    return Promise.resolve({ id: manager.getSessionId(), cwd: record.cwd, ...(parent === undefined ? {} : { parentSession: parent }),
      links: manager.getEntries?.().map(parsePersistedParentSubsessionLink).filter((link) => link !== undefined) ?? [] });
  });
  const notifications = new SessionNotificationStore();
  const restore = vi.fn(() => Promise.resolve());
  const hub = new CapturingSessionEventHub();
  const onSessionArchived = vi.fn(() => undefined);
  const service = new PiSessionService(hub, {
    agentDir: "/tmp/pi-web-archive-tree-test", modelRuntime: runtime("root").session.modelRuntime,
    sessionManager: {
      ...gateway, list, readArchiveProvenance: readProvenance, create: () => runtime("fork").session.sessionManager,
      open,
    },
    archiveStore: { ...emptyArchiveStore(), list: () => Promise.resolve([...archived]),
      get: (id) => Promise.resolve(archived.find((record) => record.sessionId === id)), archiveMany, restore,
      deleteArchivedMany: (ids) => {
        const removed = archived.filter((row) => ids.includes(row.sessionId));
        for (const row of removed) archived.splice(archived.indexOf(row), 1);
        return Promise.resolve(removed.map((row) => row.sessionId));
      } },
    createAgentRuntime: (_factory, options) => Promise.resolve(runtime(options.sessionManager.getSessionId()).runtime),
    spawnTargets: { resolveSpawnTarget: () => Promise.resolve({ allowed: true, cwd: "/workspace" }) },
    notificationStore: notifications, onSessionArchived, heartbeatIntervalMs: 60_000,
  });
  function request(sessionId = "root") {
    const root = runtime(sessionId);
    root.emit({ type: "message_end", message: {
      role: "toolResult", toolName: "archive_self", toolCallId: "archive-call", isError: false, details: { archiveSelf: true },
    } });
    root.emit({ type: "turn_end" });
    root.emit({ type: "agent_settled" });
  }
  return { service, runtime, records, archived, readProvenance, open, archiveMany, toArchived, list, notifications, hub, onSessionArchived, restore, request };
}

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe("tracked self-archive trees", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("archives tracked descendants through an archived parent, preserving independent sessions and forks", async () => {
    const f = fixture();
    f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
      archivePath: "/archive/child.jsonl", parentSessionPath: "/sessions/./root.jsonl", archivedAt: "2026-01-02T00:00:00Z" });
    try {
      f.runtime("child").session.sessionFile = "/archive/child.jsonl";
      for (const id of ["root", "child", "grandchild", "independent", "fork"]) await f.service.status(sessionRef(id));
      await expect(f.service.detachParent(sessionRef("child", "/workspace/."))).rejects.toThrow("Archived sessions are read-only. Restore");
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ sessionId: "root" }), expect.objectContaining({ sessionId: "grandchild" }),
      ]); });
      expect(f.runtime("root").calls.dispose).toBe(1);
      expect(f.runtime("grandchild").calls.dispose).toBe(1);
      expect(f.runtime("independent").calls.dispose).toBe(0);
      expect(f.runtime("fork").calls.dispose).toBe(0);
      expect(f.service.activeCount()).toBe(2);
      expect(f.onSessionArchived).toHaveBeenCalledOnce();
    } finally { await f.service.dispose(); }
  });

  it("rejects an archived intermediary replaced after it was opened for viewing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "archive-open-view-"));
    const archivePath = join(dir, "child.jsonl");
    const f = fixture();
    const header = { type: "session", version: 3, id: "child", cwd: "/workspace", timestamp: "2026-01-02T00:00:00Z" };
    const parentSession = sessionRecord("root").path;
    try {
      await writeFile(archivePath, JSON.stringify({ ...header, parentSession }) + "\n");
      f.archived.push({ sessionId: "child", cwd: header.cwd, originalPath: sessionRecord("child").path,
        archivePath, parentSessionPath: parentSession, archivedAt: header.timestamp });
      await f.service.status(sessionRef("root"));
      const child = f.runtime("child").session;
      child.sessionFile = archivePath;
      f.open.mockImplementationOnce((path) => {
        child.sessionManager = SessionManager.open(path);
        return child.sessionManager;
      });
      await f.service.status(sessionRef("child"));
      f.readProvenance.mockImplementation(readArchiveProvenance);
      await f.service.checkSelfArchive("root");
      const detached = JSON.stringify(header) + "\n";
      const replacement = join(dir, "replacement.jsonl");
      await writeFile(replacement, detached);
      await rename(replacement, archivePath);
      expect(child.sessionManager.getHeader?.()?.parentSession).toBe(parentSession);
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow("archival: child");
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow("archival: child");
      expect(await readFile(archivePath, "utf8")).toBe(detached);
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("child").calls.dispose).toBe(0);
    } finally { await f.service.dispose(); await rm(dir, { recursive: true, force: true }); }
  });

  it.each(["active", "unopened"])("rejects stale archive ancestry when the %s transcript header is detached", async (state) => {
    const f = fixture();
    f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
      archivePath: "/archive/child.jsonl", parentSessionPath: sessionRecord("root").path, archivedAt: "2026-01-02T00:00:00Z" });
    const child = f.runtime("child").session;
    child.sessionManager = SessionManager.inMemory("/workspace", { id: "child" });
    child.sessionFile = "/archive/child.jsonl";
    try {
      await f.service.status(sessionRef("root"));
      if (state === "active") await f.service.status(sessionRef("child"));
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow(/archival: child/);
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow(/archival: child/);
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("root").calls.dispose).toBe(0);
    } finally { await f.service.dispose(); }
  });

  it.each([
    { file: "empty", bytes: "", error: "archival: child" },
    { file: "detached legacy", bytes: '{"type":"session","version":1,"id":"child","cwd":"/workspace"}\n', error: "archival: child" },
    { file: "foreign-workspace", bytes: JSON.stringify({ type: "session", id: "child", cwd: "/other", parentSession: sessionRecord("root").path }), error: "archival: child" },
    { file: "legacy with a busy child on a prior branch", bytes: [
      { type: "session", version: 1, id: "child", cwd: "/workspace", parentSession: sessionRecord("root").path },
      { type: "custom", id: "spawn", parentId: null, customType: "pi-web.subsession.link", data: {
        spawnedBySessionId: "child", spawnedSessionId: "grandchild", spawnedSessionFile: sessionRecord("grandchild").path,
      } },
      { type: "custom", id: "current", parentId: null, customType: "other" },
    ].map((entry) => JSON.stringify(entry)).join("\n"), error: "active sessions before archiving: grandchild" },
  ])("rejects a $file archived transcript without opening it in the SDK or changing its bytes", async ({ bytes, error }) => {
    const dir = await mkdtemp(join(tmpdir(), "archive-readonly-"));
    const archivePath = join(dir, "child.jsonl");
    const f = fixture();
    try {
      await writeFile(archivePath, bytes);
      f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
        archivePath, parentSessionPath: sessionRecord("root").path, archivedAt: "2026-01-02T00:00:00Z" });
      f.readProvenance.mockImplementation(readArchiveProvenance);
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("grandchild"));
      f.runtime("grandchild").session.isStreaming = true;
      f.open.mockClear().mockImplementation((path) => SessionManager.open(path));
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow(error);
      await expect(f.service.archiveTree(sessionRef("child"))).rejects.toThrow(error);
      expect(f.open).not.toHaveBeenCalled();
      expect(await readFile(archivePath)).toEqual(Buffer.from(bytes));
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); await rm(dir, { recursive: true, force: true }); }
  });

  it("refuses a cold unarchived root whose header cannot establish its workspace", async () => {
    const f = fixture();
    try {
      f.readProvenance.mockResolvedValue({ id: "root" });
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow("archival: root");
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("does not inherit archival authority from spawn links copied into a fork", async () => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("fork"));
      await f.service.status(sessionRef("child"));
      f.runtime("child").session.isStreaming = true;
      await f.service.checkSelfArchive("fork");
      f.request("fork");
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ sessionId: "fork" })]); });
      expect(f.runtime("child").calls.dispose).toBe(0);
    } finally { await f.service.dispose(); }
  });

  it.each(["root clone", "active child clone", "duplicate listed child"])("refuses an ambiguous %s without closing either file", async (scenario) => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      if (scenario === "active child clone") await f.service.status(sessionRef("child"));
      const id = scenario === "root clone" ? "root" : "child";
      const listed = f.records.find((row) => row.id === id);
      if (listed === undefined) throw new Error("missing row");
      const clone = { ...listed, path: `/clones/${id}.jsonl` };
      f.list.mockResolvedValue([...(scenario === "duplicate listed child" ? f.records : f.records.filter((row) => row !== listed)), clone]);
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow(`Ambiguous session file while preparing archival: ${id}`);
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow(`Ambiguous session file while preparing archival: ${id}`);
      expect(f.runtime("root").calls.dispose).toBe(0);
      expect(f.runtime("child").calls.dispose).toBe(0);
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("retains conflicting parent edges rather than dropping a busy subtree", async () => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("grandchild"));
      f.runtime("grandchild").session.isStreaming = true;
      f.list.mockResolvedValue([...f.records, { ...sessionRecord("replacement"), path: sessionRecord("child").path }]);
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow("Ambiguous session file");
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("ignores an old spawn entry when neither colliding file still has the parent", async () => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      const detached = sessionRecord("child");
      f.list.mockResolvedValue([...f.records.filter((row) => row.id !== "child"), detached, { ...detached, path: "/clones/child.jsonl" }]);
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ sessionId: "root" })]); });
    } finally { await f.service.dispose(); }
  });

  it("uses the unique listed file for an index-only archived intermediary", async () => {
    const f = fixture();
    try {
      f.archived.push({ sessionId: "child", cwd: "/workspace", archivedAt: "2026-01-02T00:00:00Z" });
      f.list.mockResolvedValue(f.records);
      await f.service.status(sessionRef("root"));
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ sessionId: "root" }), expect.objectContaining({ sessionId: "grandchild" }),
      ]); });
    } finally { await f.service.dispose(); }
  });

  it("forgets a tracked child after confirmed deletion, not when its file merely disappears", async () => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      const child = await f.service.spawnSubsession({ spawningCwd: "/workspace", parentSessionId: "root", parentSessionFile: sessionRecord("root").path, prompt: "work" });
      const ref = sessionRef(child.sessionId);
      await f.service.stop(ref);
      f.list.mockResolvedValueOnce(f.records.filter((row) => row.id !== ref.id));
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow(`Cannot verify tracked child while preparing archival: ${ref.id}`);
      expect((await f.service.archiveMany([ref])).archivedSessionIds).toEqual([ref.id]);
      f.list.mockResolvedValue(f.records.filter((row) => row.id !== ref.id));
      expect((await f.service.deleteArchivedMany([ref])).deletedSessionIds).toEqual([ref.id]);
      await f.service.checkSelfArchive("root");
    } finally { await f.service.dispose(); }
  });

  it("checks the busy live child when the parent's spawn entry could not be persisted", async () => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      vi.spyOn(f.runtime("root").session.sessionManager, "appendCustomEntry").mockImplementation(() => { throw new Error("write failed"); });
      const child = await f.service.spawnSubsession({ spawningCwd: "/workspace", parentSessionId: "root", parentSessionFile: sessionRecord("root").path, prompt: "work" });
      f.runtime(child.sessionId).session.isStreaming = true;
      await expect(f.service.checkSelfArchive("root")).rejects.toThrow(`active sessions before archiving: ${child.sessionId}`);
      expect(f.runtime(child.sessionId).calls.abort).toBe(0);
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("rejects a catalog captured before a child detached", async () => {
    const dir = await mkdtemp(join(tmpdir(), "archive-detach-"));
    const path = join(dir, "child.jsonl");
    const f = fixture(path);
    const metadata = deferred();
    const started = deferred();
    try {
      await writeFile(path, JSON.stringify({ type: "session", id: "child", cwd: "/workspace", parentSession: sessionRecord("root").path }) + "\n");
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("child"));
      f.list.mockImplementationOnce(async () => { started.release(); await metadata.promise; return f.records; });
      const archival = f.service.archiveTree(sessionRef("root"));
      await started.promise;
      await f.service.detachParent(sessionRef("child"));
      metadata.release();
      await expect(archival).rejects.toThrow("Session lifecycle changed");
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("child").calls.dispose).toBe(0);
    } finally { metadata.release(); await f.service.dispose(); await rm(dir, { recursive: true, force: true }); }
  });

  it.each(["isStreaming", "isCompacting", "isBashRunning", "pendingMessageCount"] as const)("rejects a busy descendant (%s) through the tool before terminating", async (field) => {
    const f = fixture();
    try {
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("grandchild"));
      if (field === "pendingMessageCount") f.runtime("grandchild").session[field] = 1;
      else f.runtime("grandchild").session[field] = true;
      const tool = createPiWebCustomToolDefinitions("/workspace", false, undefined, undefined, false, undefined,
        (id) => f.service.checkSelfArchive(id)).find((item) => item.name === "archive_self");
      if (tool === undefined) throw new Error("Missing archive tool");
      const ctx = stubExtensionToolContext({ sessionManager: { getSessionId: () => "root" } });
      await expect(tool.execute("archive-call", {}, undefined, undefined, ctx)).rejects.toThrow("grandchild");
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("grandchild").calls.abort).toBe(0);
    } finally { await f.service.dispose(); }
  });

  it("rechecks at settlement, reports all busy descendants and never retries when they finish", async () => {
    const f = fixture();
    try {
      for (const id of ["root", "child", "grandchild"]) await f.service.status(sessionRef(id));
      await f.service.checkSelfArchive("root");
      f.runtime("child").session.isStreaming = true;
      f.runtime("grandchild").session.isStreaming = true;
      f.request();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.service.activeCount()).toBe(3);
      const notifications = f.notifications.inboxSnapshot("root", "/workspace").notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ severity: "error" });
      expect(notifications[0]?.message).toContain("child, grandchild");
      f.runtime("child").session.isStreaming = false;
      f.runtime("grandchild").session.isStreaming = false;
      f.runtime("grandchild").emit({ type: "agent_settled" });
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("rejects a descendant submission admitted while the catalog is loading", async () => {
    const f = fixture();
    const metadata = deferred();
    const prompt = deferred();
    try {
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("child"));
      f.list.mockImplementation(async () => { await metadata.promise; return f.records; });
      f.request();
      await vi.runOnlyPendingTimersAsync();
      f.runtime("child").session.prompt = () => prompt.promise;
      await f.service.prompt(sessionRef("child"), "New work");
      metadata.release();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("child").calls.abort).toBe(0);
      expect(f.notifications.inboxSnapshot("root", "/workspace").notifications[0]?.message).toContain("child");
    } finally { metadata.release(); prompt.release(); await f.service.dispose(); }
  });

  it.each(["self", "ui"] as const)("blocks descendant starts and reopening until %s tree persistence finishes", async (source) => {
    const f = fixture();
    const persistence = deferred();
    let archival: Promise<unknown> | undefined;
    f.archiveMany.mockImplementation(async (inputs) => { await persistence.promise; return inputs.map(f.toArchived); });
    try {
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("child"));
      if (source === "self") f.request();
      else archival = f.service.archiveTree(sessionRef("root"));
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledOnce(); });
      expect(f.runtime("child").calls.dispose).toBe(1);
      for (const id of ["child", "grandchild"]) {
        await expect(f.service.prompt(sessionRef(id), "New work")).rejects.toThrow("archival is in progress");
        expect(f.runtime(id).calls.prompt).toEqual([]);
      }
      persistence.release();
      await archival;
      await vi.runOnlyPendingTimersAsync();
    } finally { persistence.release(); await archival; await f.service.dispose(); }
  });

  it("lets an admitted root open finish without starting archive discovery", async () => {
    const f = fixture();
    const startup = deferred();
    const bind = vi.fn(() => startup.promise);
    f.runtime("root").session.bindExtensions = bind;
    const opening = f.service.status(sessionRef("root"));
    try {
      await vi.waitFor(() => { expect(bind).toHaveBeenCalledOnce(); });
      f.list.mockClear();
      await expect(f.service.archiveTree(sessionRef("root"))).rejects.toThrow("active sessions before archiving: root");
      expect(f.list).not.toHaveBeenCalled();
      startup.release();
      await opening;
      expect(f.service.activeCount()).toBe(1);
      expect(f.archiveMany).not.toHaveBeenCalled();
    } finally { startup.release(); await opening; await f.service.dispose(); }
  });

  it("rejects a descendant still opening without interrupting its startup", async () => {
    const f = fixture();
    const startup = deferred();
    let opening: Promise<unknown> | undefined;
    const bind = vi.fn(() => startup.promise);
    try {
      await f.service.status(sessionRef("root"));
      f.runtime("grandchild").session.bindExtensions = bind;
      opening = f.service.status(sessionRef("grandchild"));
      await vi.waitFor(() => { expect(bind).toHaveBeenCalledOnce(); });
      f.request();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.notifications.inboxSnapshot("root", "/workspace").notifications[0]?.message).toContain("grandchild");
      startup.release();
      await opening;
      expect(f.runtime("grandchild").calls.dispose).toBe(0);
    } finally { startup.release(); await opening; await f.service.dispose(); }
  });

  it("blocks restore of an archived intermediary until the cascade finishes", async () => {
    const f = fixture();
    const persistence = deferred();
    f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
      archivePath: "/archive/child.jsonl", parentSessionPath: sessionRecord("root").path, archivedAt: "2026-01-02T00:00:00Z" });
    f.archiveMany.mockImplementation(async (inputs) => { await persistence.promise; return inputs.map(f.toArchived); });
    try {
      await f.service.status(sessionRef("root"));
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => { expect(f.archiveMany).toHaveBeenCalledOnce(); });
      await expect(f.service.restore(sessionRef("child"))).rejects.toThrow("archival is in progress");
      expect(f.restore).not.toHaveBeenCalled();
      persistence.release();
      await vi.runOnlyPendingTimersAsync();
      await f.service.restore(sessionRef("child"));
      expect(f.restore).toHaveBeenCalledExactlyOnceWith("child");
    } finally { persistence.release(); await f.service.dispose(); }
  });

  it.each(["catalog", "provenance"])("rejects a stale %s read when an archived intermediary is restored during discovery", async (stage) => {
    const f = fixture();
    const metadata = deferred();
    f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
      archivePath: "/archive/child.jsonl", parentSessionPath: sessionRecord("root").path, archivedAt: "2026-01-02T00:00:00Z" });
    f.restore.mockImplementation(() => { f.archived.length = 0; return Promise.resolve(); });
    try {
      await f.service.status(sessionRef("root"));
      if (stage === "catalog") f.list.mockImplementationOnce(async () => { await metadata.promise; return f.records; });
      else f.readProvenance.mockImplementationOnce(async () => { await metadata.promise; return undefined; });
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await f.service.restore(sessionRef("child"));
      metadata.release();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("root").calls.dispose).toBe(0);
      expect(f.notifications.inboxSnapshot("root", "/workspace").notifications[0]?.message).toContain("Session lifecycle changed");
    } finally { metadata.release(); await f.service.dispose(); }
  });

  it("rejects discovery when a restore is already in flight and absent from both catalogs", async () => {
    const f = fixture();
    const restoring = deferred();
    let restore: Promise<void> | undefined;
    f.archived.push({ sessionId: "child", cwd: "/workspace", originalPath: sessionRecord("child").path,
      archivePath: "/archive/child.jsonl", parentSessionPath: sessionRecord("root").path, archivedAt: "2026-01-02T00:00:00Z" });
    f.restore.mockImplementation(() => { f.archived.length = 0; return restoring.promise; });
    try {
      await f.service.status(sessionRef("root"));
      await f.service.status(sessionRef("grandchild"));
      f.runtime("grandchild").session.isStreaming = true;
      f.list.mockResolvedValue(f.records.filter((record) => record.id !== "child"));
      restore = f.service.restore(sessionRef("child"));
      await vi.waitFor(() => { expect(f.restore).toHaveBeenCalledOnce(); });
      f.request();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("root").calls.dispose).toBe(0);
      expect(f.notifications.inboxSnapshot("root", "/workspace").notifications[0]?.message).toContain("Session lifecycle changed");
    } finally { restoring.release(); await restore; await f.service.dispose(); }
  });

  it("fails closed when reading a descendant yields a replaced transcript identity", async () => {
    const f = fixture();
    f.runtime("child").session.sessionManager = SessionManager.inMemory("/workspace", { id: "replacement" });
    try {
      await f.service.status(sessionRef("root"));
      f.request();
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).not.toHaveBeenCalled();
      expect(f.runtime("root").calls.dispose).toBe(0);
      expect(f.notifications.inboxSnapshot("root", "/workspace").notifications[0]?.message).toContain("Session changed while preparing archival: child");
    } finally { await f.service.dispose(); }
  });

  it("reports partial persistence without retrying and releases descendant reservations", async () => {
    const f = fixture();
    f.archiveMany.mockImplementation((inputs) => {
      const first = inputs[0];
      if (first !== undefined) f.archived.push(f.toArchived(first));
      return Promise.reject(new Error("archive disk unavailable"));
    });
    try {
      await f.service.status(sessionRef("root"));
      f.request();
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(() => {
        const notifications = f.notifications.inboxSnapshot("root", "/workspace").notifications;
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({ severity: "error" });
        expect(notifications[0]?.message).toContain("archive disk unavailable");
        expect(notifications[0]?.message).toContain("check the archive before retrying");
      });
      expect(f.archived.map((record) => record.sessionId)).toEqual(["root"]);
      await f.service.prompt(sessionRef("grandchild"), "Continue after failed archival");
      expect(f.runtime("grandchild").calls.prompt).toHaveLength(1);
      await vi.runOnlyPendingTimersAsync();
      expect(f.archiveMany).toHaveBeenCalledOnce();
      expect(f.onSessionArchived).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });
});
