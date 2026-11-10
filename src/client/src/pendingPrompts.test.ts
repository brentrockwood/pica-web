import { describe, expect, it } from "vitest";
import { normalizeMessages } from "./chatMessages";
import { createPendingPrompt, reconcilePendingPrompts } from "./pendingPrompts";

const preview = { kind: "followUp" as const, text: "hello" };
const history = normalizeMessages([{ role: "user", content: "hello", timestamp: 1, entryId: "old" }]);
const receipt = normalizeMessages([{ role: "user", content: "hello", timestamp: 2, entryId: "new" }]);

describe("pending prompt receipts", () => {
  it("does not treat HTTP acceptance or old identical history as delivery", () => {
    const pending = { ...createPendingPrompt(1, preview, "hello", 0, history, 1, []), accepted: true };
    expect(reconcilePendingPrompts([pending], history, [])).toEqual([pending]);
    expect(reconcilePendingPrompts([pending], [...history, ...receipt], [])).toEqual([]);
  });

  it("reconciles an empty-session receipt before HTTP settles without changing history", () => {
    const pending = createPendingPrompt(1, preview, "hello", 0, [], 0, []);
    expect(reconcilePendingPrompts([pending], receipt, [])).toEqual([]);
    expect(receipt).toHaveLength(1);
  });

  it("requires separate occurrences for repeated submissions and tolerates replayed receipts", () => {
    const first = createPendingPrompt(1, preview, "hello", 0, history, 1, []);
    const second = createPendingPrompt(2, preview, "hello", 0, history, 1, [first]);
    const remaining = reconcilePendingPrompts([first, second], [...history, ...receipt], []);
    expect(remaining).toEqual([second]);
    expect(reconcilePendingPrompts(remaining, [...history, ...receipt], [])).toEqual([second]);
    expect(reconcilePendingPrompts(remaining, [...history, ...receipt, ...normalizeMessages([{ role: "user", content: "hello", timestamp: 3 }])], [])).toEqual([]);
  });

  it("hands off to new server queue entries before HTTP settles, but waits for acceptance for preexisting duplicates", () => {
    const pending = createPendingPrompt(1, preview, "hello", 0, history, 1, []);
    expect(reconcilePendingPrompts([pending], history, [preview])).toEqual([]);
    const duplicate = createPendingPrompt(2, preview, "hello", 0, history, 1, [], [preview]);
    expect(reconcilePendingPrompts([duplicate], history, [preview])).toEqual([duplicate]);
    expect(reconcilePendingPrompts([{ ...duplicate, accepted: true }], history, [preview])).toEqual([]);
  });

  it("retains observable errors even if a late receipt arrives", () => {
    const failed = { ...createPendingPrompt(1, preview, "hello", 0, history, 1, []), error: "Network error" };
    expect(reconcilePendingPrompts([failed], [...history, ...receipt], [preview])).toEqual([failed]);
  });

  it("does not match older pagination or a snapshot that lost the submission boundary", () => {
    const pending = createPendingPrompt(1, preview, "hello", 0, history, 10, []);
    const older = normalizeMessages([{ role: "user", content: "hello", timestamp: 0, entryId: "earlier" }]);
    expect(reconcilePendingPrompts([pending], [...older, ...history], [])).toEqual([pending]);
    expect(reconcilePendingPrompts([pending], receipt, [])).toEqual([pending]);
  });

  it("matches attachment counts without depending on inline image payloads or media IDs", () => {
    const pending = createPendingPrompt(1, { ...preview, hasAttachments: true, attachmentCount: 1 }, "hello", 1, [], 0, []);
    expect(reconcilePendingPrompts([pending], receipt, [])).toEqual([pending]);
    const imageReceipt = normalizeMessages([{ role: "user", content: [{ type: "text", text: "hello" }, { type: "image", mimeType: "image/png", data: "QUJD" }] }]);
    expect(reconcilePendingPrompts([pending], imageReceipt, [])).toEqual([]);
  });
});
