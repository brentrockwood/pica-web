// @vitest-environment happy-dom
import { readFile } from "node:fs/promises";
import { parse, walk } from "css-tree";
import { afterEach, describe, expect, it } from "vitest";
import { resolveThemePreference } from "../../theme";
import { builtInThemeCatalog } from "../../themeCatalog.testSupport";
import { PluginRegistry } from "../registry";
import { themePackPlugin } from "./index";

afterEach(() => {
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset["piWebTheme"];
});

describe("built-in CSS themes", () => {
  it("discovers Lab statically alongside the other palettes and keeps runtime file icons", async () => {
    const registry = new PluginRegistry();
    await registry.register({ id: "themes", plugin: themePackPlugin });
    expect(registry.getThemes()).toEqual([]);
    expect(registry.getThemePairs()).toEqual([]);
    expect(registry.getFileIconThemes().map(({ id }) => id)).toEqual(["themes:material"]);
    const catalog = builtInThemeCatalog();
    registry.setDeclarativeThemes(catalog.themes, catalog.themePairs);
    const themes = registry.getThemes();
    const themePairs = registry.getThemePairs();
    expect(themes.map(({ id }) => id)).toEqual(catalog.themes.map(({ id }) => id));
    expect(themePairs).toEqual(catalog.themePairs);
    const pica = themes.find((theme) => theme.id === "themes:pica");
    expect(pica).toMatchObject({ name: "Lab", colorScheme: "dark" });
    expect(pica?.stylesheets?.map(({ id, url }) => ({ id, file: url.split("/").at(-1) }))).toEqual([
      { id: "themes:pica:palette", file: "graphite.css" },
      { id: "themes:pica:conversation", file: "pica.css" },
    ]);
    for (const prefersLight of [false, true]) {
      expect(resolveThemePreference({ themes, themePairs, preference: { themeId: "themes:pica", auto: false }, prefersLight }).activeTheme?.id).toBe("themes:pica");
    }
    await registry.dispose();
  });

  it("ships complete CSS palettes with their intended background and text colors", async () => {
    const expectedColors = {
      "pi-web-dark": ["#070912", "#f7f4ff"],
      "pi-web-light": ["#f7f1e6", "#15131b"],
      classic: ["#0d1117", "#e6edf3"],
      paper: ["#ffffff", "#202020"],
      graphite: ["#181818", "#e8e8e8"],
    };
    let properties: string[] | undefined;
    for (const [id, colors] of Object.entries(expectedColors)) {
      const css = await readFile(`pi-web-plugins/themes/assets/${id}.css`, "utf8");
      const declarations = new Map<string, string>();
      walk(parse(css, { parseCustomProperty: false }), {
        visit: "Declaration",
        enter(node) {
          if (node.value.type !== "Raw") throw new Error("Expected a custom property value");
          declarations.set(node.property, node.value.value.trim());
        },
      });
      expect(css).toMatch(/^:root \{/);
      expect([...declarations.keys()]).toEqual(expect.arrayContaining([
        "--pi-font", "--pi-mono", "--pi-thinking", "--pi-tool",
        "--pi-syntax-comment", "--pi-syntax-keyword", "--pi-syntax-string",
        "--pi-syntax-number", "--pi-syntax-title", "--pi-syntax-deletion",
        "--pi-chat-conversation-bg", "--pi-chat-conversation-border",
        "--pi-chat-user-bg", "--pi-chat-user-border", "--pi-chat-system-bg",
        "--pi-chat-activity-bg", "--pi-chat-compacting-bg",
      ]));
      expect(declarations.get("--pi-syntax-deletion")).toBe("var(--pi-danger)");
      for (const value of declarations.values()) {
        for (const reference of value.matchAll(/var\((--pi-[\w-]+)/g)) {
          expect([...declarations.keys()], `${id} has an unresolved palette reference`).toContain(reference[1]);
        }
      }
      expect([declarations.get("--pi-bg"), declarations.get("--pi-text")]).toEqual(colors);
      properties ??= [...declarations.keys()].sort();
      expect([...declarations.keys()].sort()).toEqual(properties);
    }
  });
});
