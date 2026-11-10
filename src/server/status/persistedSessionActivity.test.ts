import { describe, expect, it, vi } from "vitest";
import { CachedPersistedSessionActivity, SESSION_ACTIVITY_REFRESH_MS } from "./persistedSessionActivity.js";

describe("CachedPersistedSessionActivity", () => {
  it("shares loads and bounds token-driven reads, then refreshes on expiry or invalidation", async () => {
    let now = 0;
    const rows = [{ id: "s", cwd: "/work", modified: new Date("2026-01-01T00:00:00.000Z") }];
    const load = vi.fn(() => Promise.resolve(rows));
    const source = new CachedPersistedSessionActivity(load, () => now);
    const first = source.snapshot();
    expect(source.snapshot()).toBe(first);
    await first;
    for (let i = 0; i < 100; i++) await source.snapshot();
    expect(load).toHaveBeenCalledTimes(1);
    now = SESSION_ACTIVITY_REFRESH_MS;
    expect(await source.snapshot()).toBe(rows);
    expect(load).toHaveBeenCalledTimes(2);
    source.invalidate();
    await source.snapshot();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("retries failed reads instead of caching failure", async () => {
    const load = vi.fn<() => Promise<[]>>().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue([]);
    const source = new CachedPersistedSessionActivity(load);
    await expect(source.snapshot()).rejects.toThrow("unavailable");
    await expect(source.snapshot()).resolves.toEqual([]);
  });
});
