// Built as one IIFE, executed only inside an opaque-origin sandbox frame.
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import { isMermaidTheme, type MermaidTheme } from "./mermaidTheme";

let started = false;
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== parent || started) return;
  const data = event.data;
  if (typeof data !== "object" || data === null || !("type" in data) || data.type !== "mermaid-render"
    || !("text" in data) || typeof data.text !== "string" || data.text.length > 100_000
    || !("theme" in data) || !isMermaidTheme(data.theme)) return;
  started = true;
  void draw(data.text, data.theme);
});
parent.postMessage({ type: "mermaid-ready" }, "*");

async function draw(text: string, theme: MermaidTheme): Promise<void> {
  try {
    mermaid.initialize({
      startOnLoad: false,
      htmlLabels: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      maxTextSize: 100_000,
      maxEdges: 500,
      secure: ["secure", "securityLevel", "startOnLoad", "suppressErrorRendering", "maxTextSize", "maxEdges", "htmlLabels", "flowchart"],
      theme: "base",
      themeVariables: {
        darkMode: theme.darkMode,
        background: theme.background,
        primaryColor: theme.surface,
        primaryTextColor: theme.text,
        primaryBorderColor: theme.border,
        secondaryColor: theme.surface,
        secondaryTextColor: theme.text,
        secondaryBorderColor: theme.border,
        tertiaryColor: theme.background,
        tertiaryTextColor: theme.text,
        tertiaryBorderColor: theme.border,
        textColor: theme.text,
        lineColor: theme.line,
        edgeLabelBackground: theme.background,
        clusterBkg: theme.background,
        clusterBorder: theme.border,
        noteBkgColor: theme.surface,
        noteTextColor: theme.text,
        noteBorderColor: theme.border,
      },
    });
    document.body.style.backgroundColor = theme.background;
    const { svg } = await mermaid.render("diagram", text);
    const clean = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["foreignObject", "a", "script", "image", "use"],
    });
    document.body.innerHTML = clean;
    parent.postMessage({ type: "mermaid-rendered", height: document.body.scrollHeight }, "*");
  } catch {
    document.body.replaceChildren();
    parent.postMessage({ type: "mermaid-error" }, "*");
  }
}
