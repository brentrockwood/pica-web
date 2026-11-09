import type { Page } from "@playwright/test";

/** macOS WebKit uses Option+Tab to include buttons and links without changing OS preferences. */
export function tabKey(page: Page): string {
  return process.platform === "darwin" && page.context().browser()?.browserType().name() === "webkit"
    ? "Alt+Tab" : "Tab";
}
