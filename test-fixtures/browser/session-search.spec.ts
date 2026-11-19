import { expect, test } from "@playwright/test";

test("explicit search, scrollable results, normal selection and dismissal", async ({ page }) => {
  let searches = 0;
  await page.route("**/api/machines/local/sessions/search", async (route) => {
    searches++;
    await route.fulfill({ json: { results: Array.from({ length: 50 }, (_, i) => ({ sessionId: `s${String(i)}`, projectId: "p", workspaceId: "w", title: `Found session ${String(i)}`, project: "Project", workspace: "feature/long-workspace-name", excerpt: "Conversation text ".repeat(20) })), truncated: true } });
  });
  await page.goto("/session-search.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  const opener = page.getByRole("button", { name: "Find session", exact: true });
  await opener.focus(); await opener.press("Enter");
  const input = page.getByRole("textbox", { name: "Conversation text" });
  await expect(input).toBeFocused();
  await input.fill("needle"); expect(searches).toBe(0);
  await input.press("Enter");
  const last = page.getByRole("button", { name: /^Found session 49 / });
  await expect(last).toHaveCount(1);
  await last.click(); await expect(page.locator("#opened")).toHaveText("s49");
  await expect(opener).toBeFocused();
  await opener.press("Enter"); await expect(input).toBeFocused(); await input.press("Escape");
  await expect(page.locator("session-search-dialog")).toHaveCount(0); await expect(opener).toBeFocused();
});
