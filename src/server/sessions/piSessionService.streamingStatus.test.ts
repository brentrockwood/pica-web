import { describe, expect, it, vi } from "vitest";
import { PiSessionService } from "./piSessionService.js";
import { CapturingSessionEventHub, fakeRuntime, runtimeCreator, sessionGateway, sessionRecord, sessionRef, testModelRuntime } from "./piSessionService.testSupport.js";

function fixture() {
  const hub = new CapturingSessionEventHub();
  const fake = fakeRuntime("streaming-status", { isStreaming: true });
  const ref = sessionRef("streaming-status");
  const service = new PiSessionService(hub, {
    agentDir: "/tmp/pi-web-test-agent", modelRuntime: testModelRuntime,
    sessionManager: sessionGateway([sessionRecord(ref.id)]),
    createAgentRuntime: runtimeCreator(fake.runtime), heartbeatIntervalMs: 60_000,
  });
  const stats = vi.spyOn(fake.session, "getSessionStats");
  const context = vi.spyOn(fake.session, "getContextUsage");
  const statuses = () => hub.globalEvents.flatMap((event) => event.type === "status.update" ? [event.status] : []);
  return { hub, fake, ref, service, stats, context, statuses };
}

describe("streaming status work", () => {
  it.each([
    ["text_delta", "assistant.delta"],
    ["thinking_delta", "assistant.thinking.delta"],
    ["toolcall_delta", "pi.event"],
    ["future_delta", "pi.event"],
  ])("forwards %s without reading historical usage, including on explicit status reads", async (deltaType, clientType) => {
    const f = fixture();
    const block = { type: "text", text: "" };
    const message = { role: "assistant", content: [block] };
    try {
      const initial = await f.service.status(f.ref);
      f.fake.emit({ type: "message_start", message });
      f.stats.mockClear();
      f.context.mockClear();
      const statusCount = f.statuses().length;
      const eventCount = f.hub.sessionEvents.length;
      for (let i = 0; i < 100; i += 1) {
        block.text += "x";
        f.fake.emit({ type: "message_update", message, assistantMessageEvent: { type: deltaType, contentIndex: 0, delta: "x" } });
      }
      expect(f.stats).not.toHaveBeenCalled();
      expect(f.context).not.toHaveBeenCalled();
      expect(f.statuses()).toHaveLength(statusCount);
      expect(f.hub.sessionEvents.slice(eventCount).filter(({ event }) => event.type === clientType)).toHaveLength(100);

      expect((await f.service.status(f.ref)).cost).toBe(initial.cost);
      const snapshot = await f.service.transcriptSnapshot(f.ref);
      expect(snapshot.status.cost).toBe(initial.cost);
      expect(snapshot.partial).toMatchObject(message);
      expect(f.stats).not.toHaveBeenCalled();
      expect(f.context).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it.each([{ tokens: 42, contextWindow: 100, percent: 42 }, undefined])("reuses context usage supplied by session statistics, including unavailable usage (%j)", async (contextUsage) => {
    const f = fixture();
    try {
      const stats = { ...f.fake.session.getSessionStats(), contextUsage };
      f.stats.mockReturnValue(stats);
      const status = await f.service.status(f.ref);
      expect(status.contextUsage).toEqual(contextUsage);
      expect(f.context).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });

  it("publishes fresh status for lifecycle, tool, queue, and unknown SDK events", async () => {
    const f = fixture();
    try {
      await f.service.status(f.ref);
      f.stats.mockClear();
      f.context.mockClear();
      const types = ["agent_start", "message_start", "message_end", "tool_execution_start", "tool_execution_end", "turn_end", "queue_update", "future_runtime_event", "compaction_end", "agent_settled"];
      for (const type of types) {
        const before = f.statuses().length;
        f.fake.session.isStreaming = type !== "agent_settled";
        f.fake.emit({ type });
        expect(f.statuses()).toHaveLength(before + 1);
        expect(f.statuses().at(-1)?.isStreaming).toBe(type !== "agent_settled");
      }
      expect(f.stats).not.toHaveBeenCalled();
      expect(f.context).not.toHaveBeenCalled();
    } finally { await f.service.dispose(); }
  });
});
