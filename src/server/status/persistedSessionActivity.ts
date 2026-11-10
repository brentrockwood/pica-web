import type { PersistedSessionActivity } from "./machineStatusService.js";

export const SESSION_ACTIVITY_REFRESH_MS = 15_000;

/** Bounds directory/stat work independently of token-driven status notifications. */
export class CachedPersistedSessionActivity {
  private cached: { loadedAt: number; rows: Promise<readonly PersistedSessionActivity[]> } | undefined;

  constructor(
    private readonly load: () => Promise<readonly PersistedSessionActivity[]>,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): Promise<readonly PersistedSessionActivity[]> {
    if (this.cached !== undefined && this.now() - this.cached.loadedAt < SESSION_ACTIVITY_REFRESH_MS) {
      return this.cached.rows;
    }
    const entry = { loadedAt: this.now(), rows: this.load() };
    this.cached = entry;
    void entry.rows.catch(() => {
      if (this.cached === entry) this.cached = undefined;
    });
    return entry.rows;
  }

  /** Completion and topology mutations need not wait for the periodic refresh. */
  invalidate(): void {
    this.cached = undefined;
  }
}
