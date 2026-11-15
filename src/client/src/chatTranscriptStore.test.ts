import { applyTranscriptEvent } from "./chatTranscript";
import type { SessionUiEvent } from "./sessionSocket";
import type { ChatLine } from "./chatTypes";
import { describe, expect, it, vi } from "vitest";
import { ChatTranscriptStore, type ChatHistoryCacheAdapter } from "./chatTranscriptStore";
import type { RawMessagePage } from "./chatHistoryCache";

class MemoryChatHistoryCache implements ChatHistoryCacheAdapter {
  readonly pages = new Map<string, RawMessagePage>();

  read(sessionId: string): RawMessagePage | undefined {
    return this.pages.get(sessionId);
  }

  write(sessionId: string, page: RawMessagePage): void {
    this.pages.set(sessionId, page);
  }
}

function page(start: number, total: number, messages: unknown[]): RawMessagePage {
  return { start, total, messages };
}

describe("ChatTranscriptStore", () => {
  it("hydrates a visible transcript from cached raw history", () => {
    const cache = new MemoryChatHistoryCache();
    cache.write("s1", page(0, 2, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]));

    expect(new ChatTranscriptStore(cache).cachedView("s1")).toEqual({
      messages: [
        { role: "user", parts: [{ type: "text", text: "hi" }] },
        { role: "assistant", parts: [{ type: "text", text: "hello" }] },
      ],
      messagePageStart: 0,
      messagePageEnd: 2,
      messagePageTotal: 2,
    });
  });

  it("replaces incompatible cached snapshots even when the cache adapter cannot remove entries", () => {
    const cache = new MemoryChatHistoryCache();
    cache.write("s1", page(1, 4, [
      { role: "user", content: "old-a" }, { role: "assistant", content: "old-b" }, { role: "user", content: "old-c" },
    ]));
    const store = new ChatTranscriptStore(cache);
    const current = page(1, 3, [{ role: "user", content: "new-a" }, { role: "assistant", content: "new-b" }]);

    const view = store.mergeSnapshot("s1", current);

    expect(view.messagePageTotal).toBe(3);
    expect(store.rawHistoryPage("s1")).toEqual(current);
    expect(cache.read("s1")).toEqual(current);
    expect(store.historyRevision("s1")).toBe(1);
  });

  it("tracks the raw page end separately from normalized display messages", () => {
    const store = new ChatTranscriptStore(new MemoryChatHistoryCache());

    const view = store.mergeHistory("s1", page(0, 3, [
      { role: "user", content: "run the tool" },
      { role: "assistant", content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "src/app.ts" } }] },
      { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "text", text: "ok" }] },
    ]));

    expect(view.messages).toHaveLength(2);
    expect(view.messagePageStart).toBe(0);
    expect(view.messagePageEnd).toBe(3);
    expect(view.messagePageTotal).toBe(3);
  });

  it("keeps live streamed transcript state out of the raw history cache", () => {
    const cache = new MemoryChatHistoryCache();
    const store = new ChatTranscriptStore(cache);
    const initial = page(0, 2, [{ role: "user", content: "hi" }, { role: "assistant", content: "hel" }]);
    const updated = page(1, 3, [{ role: "assistant", content: "hello" }, { role: "user", content: "next" }]);

    let visible = store.mergeHistory("s1", initial).messages;
    visible = store.applyLiveEvent(visible, { type: "assistant.delta", text: "lo" }) ?? visible;

    expect(visible.at(-1)).toEqual({ role: "assistant", parts: [{ type: "text", text: "hello" }] });
    expect(cache.read("s1")?.messages).toEqual(initial.messages);
    expect(store.mergeHistory("s1", updated)).toEqual({
      messages: [
        { role: "user", parts: [{ type: "text", text: "hi" }] },
        { role: "assistant", parts: [{ type: "text", text: "hello" }] },
        { role: "user", parts: [{ type: "text", text: "next" }] },
      ],
      messagePageStart: 0,
      messagePageEnd: 3,
      messagePageTotal: 3,
    });
  });
});


describe("live transcript batches", () => {
  it("reduces 200 compatible deltas to one history projection without mutating inputs", () => {
    const store = new ChatTranscriptStore(new MemoryChatHistoryCache());
    const apply = vi.spyOn(store, "applyLiveEvent");
    const history: ChatLine[] = Array.from({ length: 1000 }, () => ({ role: "user", parts: [{ type: "text", text: "history" }] }));
    const events: SessionUiEvent[] = Array.from({ length: 200 }, () => ({ type: "assistant.delta", streamId: "s", text: "x" }));
    const result = store.applyLiveEvents(history, events);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(result.at(-1)?.parts).toEqual([{ type: "text", text: "x".repeat(200) }]);
    expect(history).toHaveLength(1000);
    history.forEach((line, index) => { expect(result[index]).toBe(line); });
    expect(events[0]).toEqual({ type: "assistant.delta", streamId: "s", text: "x" });
  });

  it.each([undefined, "s"])("preserves sequential semantics and boundaries (stream %s)", (streamId) => {
    const identity = streamId === undefined ? {} : { streamId };
    const delta = (text: string): SessionUiEvent => ({ type: "assistant.delta", text, ...identity });
    const events: SessionUiEvent[] = [
      delta(""), delta("a"), delta("b"),
      { type: "assistant.thinking.delta", text: "plan", ...identity },
      { type: "assistant.thinking.delta", text: " more", ...identity },
      delta("c"),
      { type: "tool.start", toolCallId: "t", toolName: "read", summary: "file", args: {} },
      delta("d"), delta("e"),
      { type: "assistant.delta", streamId: "other", text: "separate" },
      delta("f"),
      { type: "message.end", message: { role: "assistant", content: "final", ...identity } },
      delta("after"),
      { type: "message.append", message: { role: "user", content: "next" } },
      delta("new"), delta(" reply"),
    ];
    const expected = events.reduce<ChatLine[]>((lines, event) => applyTranscriptEvent(lines, event) ?? lines, []);
    const store = new ChatTranscriptStore(new MemoryChatHistoryCache());
    expect(store.applyLiveEvents([], events)).toEqual(expected);
    expect(store.applyLiveEvents([], [])).toEqual([]);
  });
});
