import { html, type ReactiveController, type ReactiveControllerHost } from "lit";
import { localization } from "../localization/browser";
import definitions from "./listActivity.messages";

const messages = localization.registerMessages("core.listActivity", definitions);
export type ListSortMode = "recent" | "name" | "manual";
export type ListActivityMap = Readonly<Record<string, string>> | undefined;

function activityMillis(value: string | undefined): number {
  const time = value === undefined ? NaN : Date.parse(value);
  return Number.isFinite(time) ? time : -Infinity;
}

/** One instance per list. Call order() once per render; it retains IDs, never row data.
 * Automatic order pauses during hover/focus, including descendant popovers.
 * Manual order always follows the caller so explicit move actions remain immediate.
 */
export class ListActivityController implements ReactiveController {
  private mode: ListSortMode = "recent";
  private ids: string[] = [];
  private hovered = false;
  private focused = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  get now(): number { return Date.now(); }

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
  }

  get sortMode(): ListSortMode { return this.mode; }
  set sortMode(mode: ListSortMode) {
    this.mode = mode;
    this.host.requestUpdate();
  }

  private readonly pointerEnter = () => { this.hovered = true; };
  private readonly pointerLeave = () => { this.hovered = false; this.host.requestUpdate(); };
  private readonly focusIn = () => { this.focused = true; };
  private readonly focusOut = () => {
    queueMicrotask(() => {
      this.focused = this.host.matches(":focus-within") || this.host.shadowRoot?.activeElement != null;
      this.host.requestUpdate();
    });
  };

  hostConnected(): void {
    this.host.addEventListener("pointerenter", this.pointerEnter);
    this.host.addEventListener("pointerleave", this.pointerLeave);
    this.host.addEventListener("focusin", this.focusIn);
    this.host.addEventListener("focusout", this.focusOut);
    this.timer = setInterval(() => { this.host.requestUpdate(); }, 30_000);
  }

  hostDisconnected(): void {
    this.host.removeEventListener("pointerenter", this.pointerEnter);
    this.host.removeEventListener("pointerleave", this.pointerLeave);
    this.host.removeEventListener("focusin", this.focusIn);
    this.host.removeEventListener("focusout", this.focusOut);
    clearInterval(this.timer);
    this.timer = undefined;
    this.hovered = this.focused = false;
  }

  order<T extends { id: string }>(items: readonly T[], name: (item: T) => string, activity: ListActivityMap): T[] {
    let ordered = [...items];
    if (this.mode !== "manual" && (this.hovered || this.focused)) {
      const byId = new Map(items.map((item) => [item.id, item]));
      ordered = [];
      for (const id of this.ids) {
        const item = byId.get(id);
        if (item !== undefined) { ordered.push(item); byId.delete(id); }
      }
      ordered.push(...byId.values());
    } else if (this.mode === "recent") {
      ordered.sort((a, b) => activityMillis(activity?.[b.id]) - activityMillis(activity?.[a.id]));
    } else if (this.mode === "name") {
      const collator = new Intl.Collator(localization.language);
      ordered.sort((a, b) => collator.compare(name(a), name(b)));
    }
    this.ids = ordered.map((item) => item.id);
    return ordered;
  }

  renderSortControl(includeManual = true) {
    return html`<select class="ui-select list-sort" aria-label=${messages.t("sort")} .value=${this.mode}
      @change=${(event: Event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        const value = event.target.value;
        if (value === "recent" || value === "name" || value === "manual") this.sortMode = value;
      }}>
      <option value="recent">${messages.t("recent")}</option>
      <option value="name">${messages.t("name")}</option>
      ${includeManual ? html`<option value="manual">${messages.t("manual")}</option>` : null}
    </select>`;
  }
}

/** Unknown/invalid activity has no date. The clock is supplied by the list controller. */
export function renderListActivity(value: string | undefined, now: number) {
  const time = activityMillis(value);
  if (!Number.isFinite(time)) return null;
  const seconds = (time - now) / 1000;
  const magnitude = Math.abs(seconds);
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] = magnitude < 60 ? ["second", 1]
    : magnitude < 3600 ? ["minute", 60] : magnitude < 86400 ? ["hour", 3600]
      : magnitude < 2592000 ? ["day", 86400] : magnitude < 31536000 ? ["month", 2592000] : ["year", 31536000];
  return html`<small class="list-activity"><time datetime=${new Date(time).toISOString()}
    title=${localization.date(time, { dateStyle: "full", timeStyle: "long" })}>${localization.relativeTime(Math.round(seconds / divisor), unit)}</time></small>`;
}
