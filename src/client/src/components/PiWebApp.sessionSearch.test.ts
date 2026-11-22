// @vitest-environment happy-dom

import { LitElement } from "lit";
import { afterEach, expect, it, vi } from "vitest";
import { initialAppState } from "../appState";
import { AppShellController } from "../appShell/appShellController";
import { sessionSearchMessages } from "../sessionSearchMessages";
import { ActionPalette } from "./ActionPalette";
import { PiWebApp } from "./PiWebApp";
import { SessionSearchDialog } from "./SessionSearchDialog";
import { AppContextBar } from "./appShell/AppContextBar";
import { AppNavigationPanel } from "./appShell/AppNavigationPanel";
import { installNativeDialogFake } from "./nativeDialog.testSupport";

installNativeDialogFake();

// Keep the real app render and callbacks without starting network/bootstrap work.
class SessionSearchApp extends PiWebApp {
  override connectedCallback(): void { LitElement.prototype.connectedCallback.call(this); }
}
customElements.define("session-search-test-app", SessionSearchApp);

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountApp(mobile = false, paletteOpen = false): Promise<SessionSearchApp> {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const app = new SessionSearchApp();
  Reflect.set(app, "state", {
    ...initialAppState(),
    mainView: "navigation",
    actionPaletteOpen: paletteOpen,
    selectedMachine: { id: "remote", name: "Remote", kind: "remote", createdAt: "now", updatedAt: "now" },
  });
  const shell: unknown = Reflect.get(app, "appShell");
  if (!(shell instanceof AppShellController)) throw new Error("Missing app shell");
  shell.isMobileNavigationLayout = mobile;
  shell.isDesktopSideBySideLayout = !mobile;
  document.body.append(app);
  await app.updateComplete;
  return app;
}

async function expectSearchDialog(app: PiWebApp): Promise<SessionSearchDialog> {
  await app.updateComplete;
  const dialog = app.shadowRoot?.querySelector("session-search-dialog");
  expect(dialog).toBeInstanceOf(SessionSearchDialog);
  if (!(dialog instanceof SessionSearchDialog)) throw new Error("Missing conversation search dialog");
  await dialog.updateComplete;
  expect(dialog.machineId).toBe("remote");
  return dialog;
}

it.each([
  { surface: "navigation panel", mobile: false, selector: "app-navigation-panel" },
  { surface: "mobile context bar", mobile: true, selector: "app-context-bar" },
])("opens conversation search from the $surface and closes it through the dialog", async ({ mobile, selector }) => {
  const app = await mountApp(mobile);
  expect(app.shadowRoot?.querySelector("session-search-dialog")).toBeNull();
  const surface = app.shadowRoot?.querySelector(selector);
  if (!(surface instanceof AppNavigationPanel || surface instanceof AppContextBar)) throw new Error("Missing search surface");
  await surface.updateComplete;
  const button = surface.shadowRoot?.querySelector<HTMLButtonElement>(`button[aria-label="${sessionSearchMessages.t("title")}"]`);
  expect(button).toBeInstanceOf(HTMLButtonElement);
  button?.click();
  const dialog = await expectSearchDialog(app);
  dialog.shadowRoot?.querySelector<HTMLButtonElement>(`button[aria-label="${sessionSearchMessages.t("close")}"]`)?.click();
  await app.updateComplete;
  expect(app.shadowRoot?.querySelector("session-search-dialog")).toBeNull();
});

it.each(["search", "find"])("finds and opens conversation search from the palette using '%s'", async (query) => {
  const app = await mountApp(false, true);
  const palette = app.shadowRoot?.querySelector("action-palette");
  if (!(palette instanceof ActionPalette)) throw new Error("Missing action palette");
  await palette.updateComplete;
  const action = palette.actions.find((item) => item.id === "app.sessions.find");
  expect(action).toBeDefined();
  const input = palette.shadowRoot?.querySelector("input");
  if (input === null || input === undefined) throw new Error("Missing palette input");
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await palette.updateComplete;
  const button = [...(palette.shadowRoot?.querySelectorAll<HTMLButtonElement>(".options button") ?? [])]
    .find((candidate) => candidate.querySelector("strong")?.textContent === action?.title);
  expect(button).toBeDefined();
  button?.click();
  // App actions run asynchronously, after the palette closes.
  await vi.waitFor(() => { expect(app.shadowRoot?.querySelector("session-search-dialog")).toBeInstanceOf(SessionSearchDialog); });
  await expectSearchDialog(app);
  expect(app.shadowRoot?.querySelector("action-palette")).toBeNull();
});
