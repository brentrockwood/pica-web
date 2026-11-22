// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { sessionsApi } from "../api";
import { SessionSearchDialog } from "./SessionSearchDialog";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it("submits only explicitly, uses selected machine, opens results and rejects stale responses", async () => {
  const result = { sessionId: "s", projectId: "p", workspaceId: "w", title: "Title", project: "Project", workspace: "Workspace", excerpt: "Match" };
  const search = vi.spyOn(sessionsApi, "search").mockResolvedValue({ results: [result], truncated: false });
  const view = new SessionSearchDialog(); view.machineId = "remote"; view.onOpen = vi.fn(); document.body.append(view); await view.updateComplete;
  const input = view.shadowRoot?.querySelector("input"); if (input === null || input === undefined) throw new Error("Missing input");
  input.value = "literal.*"; input.dispatchEvent(new Event("input")); await view.updateComplete;
  expect(search).not.toHaveBeenCalled();
  view.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => { expect(view.shadowRoot?.querySelector(".result")).not.toBeNull(); });
  expect(view.shadowRoot?.activeElement).toBe(view.shadowRoot?.querySelector(".result"));
  expect(search).toHaveBeenCalledWith("literal.*", "remote", expect.any(AbortSignal));
  view.shadowRoot?.querySelector<HTMLButtonElement>(".result")?.click(); expect(view.onOpen).toHaveBeenCalledWith(result);
  let finish: ((response: { results: typeof result[]; truncated: boolean }) => void) | undefined;
  search.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  view.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
  view.machineId = "another"; await view.updateComplete;
  finish?.({ results: [result], truncated: false }); await view.updateComplete;
  expect(view.shadowRoot?.querySelector(".result")).toBeNull();
});
