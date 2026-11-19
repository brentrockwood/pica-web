import { SessionSearchDialog } from "../../src/client/src/components/SessionSearchDialog";
import { pluginStyles } from "../../src/client/src/plugins/styles";
const style = document.createElement("style");
style.textContent = `:root { --pi-bg: #161616; --pi-surface: #252525; --pi-text: #eee; --pi-border: #555; --pi-border-muted: #444; --pi-muted: #aaa; --pi-overlay: #0008; --pi-accent: #aaf; } body { margin: 0; background: var(--pi-bg); color: var(--pi-text); font-family: system-ui; }`;
document.head.append(style);
pluginStyles.registerRoot(document);
document.querySelector("#open")?.addEventListener("click", () => {
  const view = new SessionSearchDialog(); view.machineName = "Test machine";
  view.onClose = () => { view.remove(); };
  view.onOpen = (result) => { const output = document.querySelector("#opened"); if (output !== null) output.textContent = result.sessionId; view.remove(); };
  document.body.append(view);
});
document.body.dataset["ready"] = "true";
