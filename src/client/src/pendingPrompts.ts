import type { QueuedSessionMessage } from "./api";
import type { ChatLine } from "./chatTypes";

/** Browser-only receipt tracking; never persisted as transcript history. */
export interface PendingPrompt {
  id: number;
  preview: QueuedSessionMessage;
  text: string;
  imageCount: number;
  anchor: string | ChatLine | undefined;
  anchorOccurrence: number;
  queueOccurrence: number;
  emptyHistory: boolean;
  occurrence: number;
  accepted: boolean;
  error?: string;
}

function identity(line: ChatLine): string | ChatLine {
  return line.meta?.timestamp === undefined ? line.entryId ?? line : JSON.stringify([line.meta.timestamp, line.role]);
}

export function createPendingPrompt(id: number, preview: QueuedSessionMessage, text: string, imageCount: number, messages: ChatLine[], historyTotal: number, pending: PendingPrompt[], queue: QueuedSessionMessage[] = []): PendingPrompt {
  const last = messages.filter((line) => line.role === "user").at(-1) ?? messages.at(-1);
  const anchor = last === undefined ? undefined : identity(last);
  const preceding = pending.filter((item) => item.error === undefined && item.anchor === anchor && item.text === text && item.imageCount === imageCount);
  return { id, preview, text, imageCount, anchor,
    anchorOccurrence: messages.filter((line) => identity(line) === anchor).length,
    queueOccurrence: queue.filter((item) => item.text === text && (item.attachmentCount ?? 0) === imageCount).length + pending.filter((item) => item.error === undefined && item.text === text && item.imageCount === imageCount).length + 1,
    emptyHistory: historyTotal === 0 && messages.length === 0, occurrence: Math.max(0, ...preceding.map((item) => item.occurrence)) + 1, accepted: false };
}

export function reconcilePendingPrompts(pending: PendingPrompt[], messages: ChatLine[], queue: QueuedSessionMessage[]): PendingPrompt[] {
  return pending.filter((item) => {
    if (item.error !== undefined) return true;
    // A new queue entry confirms receipt, not delivery. Existing duplicate text
    // can also be handed over once the server accepts its deduplicated send.
    const queuedCount = queue.filter((queued) => queued.text === item.text && (queued.attachmentCount ?? 0) === item.imageCount).length;
    if (queuedCount >= item.queueOccurrence || (item.accepted && queuedCount > 0)) return false;
    const anchorIndex = messages.map((line, index) => identity(line) === item.anchor ? index : -1).filter((index) => index >= 0)[item.anchorOccurrence - 1] ?? -1;
    // If pagination/branch changes dropped our boundary, keep an honest pending
    // state rather than matching an older, identical prompt.
    if (anchorIndex < 0 && !item.emptyHistory) return true;
    const matches = messages.slice(anchorIndex + 1).filter((line) => line.role === "user"
      && line.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n") === item.text
      && line.parts.filter((part) => part.type === "image").length === item.imageCount);
    return matches.length < item.occurrence;
  });
}
