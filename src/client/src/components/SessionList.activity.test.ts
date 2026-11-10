// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import type { SessionInfo } from "../api";
import { SessionList } from "./SessionList";

const older = "2026-11-01T12:00:00Z";
const newer = "2026-11-02T12:00:00Z";
function session(id: string, modified = older, extra: Partial<SessionInfo> = {}): SessionInfo {
  return { id, path: `/sessions/${id}.jsonl`, cwd: "/repo", created: older, modified, firstMessage: id, messageCount: 1, ...extra };
}
function ids(list: SessionList): string[] {
  return [...list.renderRoot.querySelectorAll<HTMLElement>("[data-session-id]")].map((row) => row.dataset["sessionId"] ?? "");
}
async function mount(sessions: SessionInfo[]): Promise<SessionList> {
  const list = new SessionList();
  list.sessions = sessions;
  document.body.append(list);
  await list.updateComplete;
  return list;
}
afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

it("sorts recent sessions below pins, retaining parent/child groups and exact activity times", async () => {
  const parent = session("parent");
  const child = session("child", newer, { parentSessionPath: parent.path });
  const list = await mount([parent, child, session("recent", newer), session("pinned")]);
  list.pinnedRootIds = ["pinned"];
  await list.updateComplete;
  expect(ids(list)).toEqual(["pinned", "recent", "parent", "child"]);
  expect(list.renderRoot.querySelector<HTMLTimeElement>('[data-session-id="child"] time')?.dateTime).toBe(new Date(newer).toISOString());
});

it("keeps focused rows stationary while updating timestamps, and sorts when focus leaves", async () => {
  const list = await mount([session("a"), session("b", newer)]);
  expect(ids(list)).toEqual(["b", "a"]);
  const first = list.renderRoot.querySelector<HTMLElement>('[data-session-id="b"]');
  if (!first) throw new Error("Missing session row");
  first.focus();
  list.lastActivity = { a: "2026-11-03T12:00:00Z", b: newer };
  await list.updateComplete;
  expect(ids(list)).toEqual(["b", "a"]);
  expect(list.renderRoot.querySelector<HTMLTimeElement>('[data-session-id="a"] time')?.dateTime).toBe("2026-11-03T12:00:00.000Z");
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  await Promise.resolve();
  await list.updateComplete;
  expect(ids(list)).toEqual(["a", "b"]);
});

it("uses Name sorting without changing pinned order", async () => {
  const list = await mount([session("z", newer), session("a"), session("pinned")]);
  list.pinnedRootIds = ["pinned"];
  await list.updateComplete;
  const select = list.renderRoot.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("Missing sort control");
  select.value = "name";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await list.updateComplete;
  expect(ids(list)).toEqual(["pinned", "a", "z"]);
});
