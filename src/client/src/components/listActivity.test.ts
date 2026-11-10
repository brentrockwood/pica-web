// @vitest-environment happy-dom

import { LitElement, html } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localization } from "../localization/browser";
import { ListActivityController, renderListActivity } from "./listActivity";

class ActivityHost extends LitElement {
  readonly activity = new ListActivityController(this);
  override render() { return html`<button>Action</button>${renderListActivity("2026-01-01T00:00:00Z", this.activity.now)}`; }
}
customElements.define("test-list-activity", ActivityHost);

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const items = [{ id: "z" }, { id: "a" }, { id: "m" }, { id: "unknown" }];
const name = (item: { id: string }) => item.id;
const activity = { a: "2026-01-01T00:00:00Z", m: "2026-01-02T00:00:00Z", z: "invalid" };

describe("list activity ordering", () => {
  it("defaults to recent, keeps unknowns at the end stably, and supports name/manual without mutating input", () => {
    const controller = new ActivityHost().activity;
    expect(controller.order(items, name, activity).map(name)).toEqual(["m", "a", "z", "unknown"]);
    controller.sortMode = "name";
    expect(controller.order(items, name, activity).map(name)).toEqual(["a", "m", "unknown", "z"]);
    controller.sortMode = "manual";
    expect(controller.order(items, name, activity)).toEqual(items);
    expect(items.map(name)).toEqual(["z", "a", "m", "unknown"]);
  });

  it("holds existing IDs until both pointer and focus leave, but updates data, removes rows, and appends arrivals", async () => {
    const host = new ActivityHost();
    document.body.append(host);
    await host.updateComplete;
    const controller = host.activity;
    controller.order(items, name, activity);
    host.dispatchEvent(new Event("pointerenter"));
    const button = host.shadowRoot?.querySelector("button");
    button?.focus();
    const changed = [{ id: "a", label: "updated" }, { id: "z" }, { id: "new" }];
    const newer = { z: "2026-02-01T00:00:00Z", new: "2026-03-01T00:00:00Z" };
    expect(controller.order(changed, name, newer)).toEqual([changed[0], changed[1], changed[2]]);
    host.dispatchEvent(new Event("pointerleave"));
    expect(controller.order(changed, name, newer).map(name)).toEqual(["a", "z", "new"]);
    button?.blur();
    await Promise.resolve();
    expect(controller.order(changed, name, newer).map(name)).toEqual(["new", "z", "a"]);
  });

  it("applies explicit manual moves while focused", async () => {
    const host = new ActivityHost();
    document.body.append(host);
    await host.updateComplete;
    host.activity.sortMode = "manual";
    host.activity.order(items, name, activity);
    host.shadowRoot?.querySelector("button")?.focus();
    expect(host.activity.order([...items].reverse(), name, activity)).toEqual([...items].reverse());
  });
});

it("refreshes relative timestamps while hovered and cleans the clock on disconnect/reconnect", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
  const host = new ActivityHost();
  document.body.append(host);
  await host.updateComplete;
  const time = host.shadowRoot?.querySelector("time");
  expect(time?.textContent).toBe(localization.relativeTime(-1, "minute"));
  expect(time?.dateTime).toBe("2026-01-01T00:00:00.000Z");
  expect(time?.title).toBe(localization.date(Date.parse("2026-01-01T00:00:00Z"), { dateStyle: "full", timeStyle: "long" }));
  host.dispatchEvent(new Event("pointerenter"));
  vi.advanceTimersByTime(60_000);
  await host.updateComplete;
  expect(time?.textContent).toBe(localization.relativeTime(-2, "minute"));
  host.remove();
  expect(vi.getTimerCount()).toBe(0);
  document.body.append(host);
  expect(vi.getTimerCount()).toBe(1);
  host.remove();
  expect(vi.getTimerCount()).toBe(0);
  expect(renderListActivity(undefined, Date.now())).toBeNull();
  expect(renderListActivity("not a date", Date.now())).toBeNull();
});

it("uses the current clock for newly received activity between timer ticks", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const host = new ActivityHost();
  document.body.append(host);
  await host.updateComplete;
  vi.setSystemTime(new Date("2026-01-01T00:00:19Z"));
  expect(host.activity.now).toBe(Date.parse("2026-01-01T00:00:19Z"));
});
