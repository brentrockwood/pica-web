export interface MermaidTheme {
  background: string;
  surface: string;
  text: string;
  border: string;
  line: string;
  darkMode: boolean;
}

const colors = {
  background: ["--pi-bg", "#ffffff"],
  surface: ["--pi-surface", "#f4f4f4"],
  text: ["--pi-text", "#222222"],
  border: ["--pi-border", "#888888"],
  line: ["--pi-accent", "#555555"],
} as const;

export function readMermaidTheme(element: HTMLElement): MermaidTheme {
  const style = getComputedStyle(element);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Mermaid theme colors require a canvas context");
  const color = (key: keyof typeof colors): string => {
    const [property, fallback] = colors[key];
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = fallback;
    context.fillStyle = style.getPropertyValue(property).trim() || fallback;
    context.fillRect(0, 0, 1, 1);
    // Mermaid's theme calculations require hex, even when a theme uses CSS color functions.
    return `#${Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  };
  return { background: color("background"), surface: color("surface"), text: color("text"),
    border: color("border"), line: color("line"), darkMode: style.colorScheme === "dark" };
}

export function isMermaidTheme(value: unknown): value is MermaidTheme {
  return typeof value === "object" && value !== null
    && Object.keys(colors).every((key) => {
      const color: unknown = Reflect.get(value, key);
      return typeof color === "string" && /^#[\da-f]{6}$/iu.test(color);
    })
    && "darkMode" in value && typeof value.darkMode === "boolean";
}
