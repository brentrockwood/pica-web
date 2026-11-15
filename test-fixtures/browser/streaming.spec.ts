import { expect, test } from "@playwright/test";
import type { ChatView } from "../../src/client/src/components/ChatView";
import type { FormattedText } from "../../src/client/src/components/FormattedText";

test("streaming prose advances without replacing completed code controls", async ({ page }) => {
  await page.goto("/overlays.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  const chat = await page.locator("chat-view").evaluateHandle((element: ChatView) => element);
  await chat.evaluate(async (chat) => {
    chat.messages = [{ role: "assistant", entryId: "streaming", parts: [{ type: "text", text: "```text\nstable source\n```\n\nInitial prose." }] }];
    await chat.updateComplete;
  });
  const formatted = page.locator("chat-view formatted-text");
  await expect(formatted.locator(".code-copy-button")).toBeVisible();
  const result = await formatted.evaluate(async (element: FormattedText, chat: ChatView) => {
    // Wait for the initial optional enhancement before capturing its owned DOM.
    for (let i = 0; i < 4; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => { setTimeout(resolve, 0); }));
    const copy = element.shadowRoot?.querySelector(".code-copy-button");
    if (!copy) throw new Error("Missing code control");
    let advancedDuringStream = false;
    let preservedControls = true;
    for (let i = 0; i < 30; i++) {
      const text = `\`\`\`text\nstable source\n\`\`\`\n\nInitial prose. ${" streamed".repeat(i + 1)}`;
      chat.messages = [{ role: "assistant", entryId: "streaming", parts: [{ type: "text", text }] }];
      await chat.updateComplete;
      await new Promise<void>((resolve) => requestAnimationFrame(() => { resolve(); }));
      advancedDuringStream ||= element.shadowRoot?.querySelector(".enhanced-content")?.textContent.includes("streamed") === true;
      preservedControls &&= element.shadowRoot?.querySelector(".code-copy-button") === copy;
    }
    return { advancedDuringStream, preservedControls };
  }, chat);
  await chat.dispose();
  expect(result.advancedDuringStream).toBe(true);
  expect(result.preservedControls).toBe(true);
  await expect(formatted.locator(".enhanced-content")).toContainText(" streamed".repeat(30));
});
