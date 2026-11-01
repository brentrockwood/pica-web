// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { initialize, render, sanitize } = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn(), sanitize: vi.fn() }));
vi.mock("mermaid", () => ({ default: { initialize, render } }));
vi.mock("dompurify", () => ({ default: { sanitize } }));

let frame: EventTarget;
let owner: { postMessage: ReturnType<typeof vi.fn> };
const theme = { background: "#181818", surface: "#222222", text: "#c8c8c8", border: "#424242", line: "#dedede", darkMode: true };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  frame = new EventTarget();
  owner = { postMessage: vi.fn() };
  vi.stubGlobal("window", frame);
  vi.stubGlobal("parent", owner);
  render.mockResolvedValue({ svg: "<svg>diagram</svg>" });
  sanitize.mockImplementation((svg: string) => svg);
  await import("./mermaid-engine");
});
afterEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
});

function send(data: unknown, source: unknown = owner): void {
  const event = new MessageEvent("message", { data });
  Object.defineProperty(event, "source", { value: source });
  frame.dispatchEvent(event);
}

it("applies the supplied palette without weakening sandbox rendering settings or SVG sanitization", async () => {
  expect(owner.postMessage).toHaveBeenCalledWith({ type: "mermaid-ready" }, "*");
  send({ type: "mermaid-render", text: "graph TD; A-->B", theme });
  await vi.waitFor(() => { expect(owner.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "mermaid-rendered" }), "*"); });
  const themeVariables: unknown = expect.objectContaining({ background: "#181818", primaryColor: "#222222", primaryTextColor: "#c8c8c8", primaryBorderColor: "#424242", lineColor: "#dedede", edgeLabelBackground: "#181818", darkMode: true });
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
    theme: "base", htmlLabels: false, securityLevel: "strict", startOnLoad: false, maxTextSize: 100_000, maxEdges: 500, themeVariables,
  }));
  expect(render).toHaveBeenCalledWith("diagram", "graph TD; A-->B");
  expect(sanitize).toHaveBeenCalledWith("<svg>diagram</svg>", expect.objectContaining({ FORBID_TAGS: ["foreignObject", "a", "script", "image", "use"] }));
  send({ type: "mermaid-render", text: "second source", theme });
  expect(render).toHaveBeenCalledOnce();
});

it("ignores foreign messages and malformed theme colors before accepting a valid request", () => {
  send({ type: "mermaid-render", text: "source", theme }, {});
  for (const invalid of [null, {}, { ...theme, text: "red" }, { ...theme, background: "#fff; color:red" }, { ...theme, darkMode: "true" }]) {
    send({ type: "mermaid-render", text: "source", theme: invalid });
  }
  expect(render).not.toHaveBeenCalled();
  send({ type: "mermaid-render", text: "valid", theme });
  expect(render).toHaveBeenCalledOnce();
});

it("reports rendering failure without publishing a successful preview", async () => {
  render.mockRejectedValue(new Error("bad diagram"));
  send({ type: "mermaid-render", text: "bad", theme });
  await vi.waitFor(() => { expect(owner.postMessage).toHaveBeenCalledWith({ type: "mermaid-error" }, "*"); });
  expect(owner.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "mermaid-rendered" }), "*");
});
