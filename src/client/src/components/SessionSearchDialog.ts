import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { LocalizationController } from "../localization/browser";
import { stylesheetIntegrationCapability } from "../plugins/styles";
import { sessionsApi } from "../api";
import type { SessionSearchResponse, SessionSearchResult } from "../../../shared/sessionSearch";
import { sessionSearchMessages as messages } from "../sessionSearchMessages";
import { uiDialogStyles, uiSelectionStyles } from "./ui/dialogStyles";
import "./ModalSurface";

@customElement("session-search-dialog")
export class SessionSearchDialog extends LitElement {
  constructor() {
    super();
    stylesheetIntegrationCapability.createController(this);
    new LocalizationController(this);
  }
  @property() machineId = "local";
  @property() machineName = "";
  @property({ attribute: false }) onClose?: () => void;
  @property({ attribute: false }) onOpen?: (result: SessionSearchResult) => void;
  @state() private query = "";
  @state() private response: SessionSearchResponse | undefined;
  @state() private error = "";
  @state() private searching = false;
  private controller: AbortController | undefined;

  override disconnectedCallback(): void {
    this.controller?.abort();
    super.disconnectedCallback();
  }
  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("machineId")) {
      this.controller?.abort();
      this.controller = undefined;
      this.response = undefined;
      this.error = "";
      this.searching = false;
    }
  }
  protected override updated(changed: PropertyValues): void {
    if (changed.has("response")) this.renderRoot.querySelector<HTMLButtonElement>(".result")?.focus();
  }
  private async search(): Promise<void> {
    if (this.query.trim() === "" || this.searching) return;
    const controller = new AbortController();
    this.controller = controller;
    this.searching = true;
    this.error = "";
    this.response = undefined;
    try {
      const response = await sessionsApi.search(this.query, this.machineId, controller.signal);
      if (!controller.signal.aborted) this.response = response;
    } catch (error) {
      if (!controller.signal.aborted) this.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.controller === controller) this.searching = false;
    }
  }
  override render() {
    return html`<modal-surface .label=${messages.t("title")} .initialFocus=${"input"} .onClose=${this.onClose}>
      <header class="ui-dialog-header"><h2 class="ui-dialog-title">${messages.t("title")}</h2><button class="ui-button ui-button--icon" aria-label=${messages.t("close")} @click=${this.onClose}>×</button></header>
      <p class="scope">${messages.t("scope", { machine: this.machineName || this.machineId })}</p>
      <form class="ui-dialog-search-row" @submit=${(event: Event) => { event.preventDefault(); void this.search(); }}>
        <input class="ui-dialog-search" aria-label=${messages.t("query")} placeholder=${messages.t("placeholder")} maxlength="500" .value=${this.query} @input=${(event: Event) => { if (event.target instanceof HTMLInputElement) this.query = event.target.value; }}>
      </form>
      <div class="ui-dialog-body" aria-busy=${this.searching}>
        ${this.error ? html`<p role="alert">${this.error}</p>` : nothing}
        <div role="status">${this.searching ? messages.t("searching") : this.response?.truncated === true ? messages.t("truncated") : this.response?.results.length === 0 ? messages.t("empty") : nothing}</div>
        <div class="ui-selection-list">${this.response?.results.map((result) => html`<button class="ui-button ui-selection-option result" @click=${() => this.onOpen?.(result)}>
          <strong>${result.title}</strong><span class="ui-selection-detail">${result.project} · ${result.workspace}</span><span class="excerpt">${result.excerpt}</span>
        </button>`)}</div>
      </div>
    </modal-surface>`;
  }
  static override styles = [uiDialogStyles, uiSelectionStyles, css`
    .scope { margin: 12px; color: var(--pi-muted); }
    .ui-dialog-search-row { margin-inline: 12px; }
    .result:focus { background: var(--pi-selection-bg); }
    .result { display: flex; flex-direction: column; align-items: stretch; text-align: start; }
    .result > * { overflow-wrap: anywhere; }
    .excerpt { white-space: pre-wrap; }
  `];
}
