// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { ChatView, chatMessageMetadataLabel } from "./ChatView";

const message = {
  role: "assistant" as const,
  entryId: "metadata-entry",
  parts: [{ type: "text" as const, text: "A reply." }],
  meta: { timestamp: "2026-10-15T20:10:00Z", model: { provider: "example", id: "model" }, thinkingLevel: "high" },
};

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

it("keeps the same Info button and focus while showing and hiding a separate metadata region", async () => {
  const view = new ChatView();
  view.messages = [message];
  document.body.append(view);
  await view.updateComplete;
  const button = view.shadowRoot?.querySelector<HTMLButtonElement>('button[aria-label="Message information"]');
  if (button === undefined || button === null) throw new Error("Expected Info button");
  const region = view.shadowRoot?.getElementById(button.getAttribute("aria-controls") ?? "");
  if (!(region instanceof HTMLElement)) throw new Error("Expected controlled metadata region");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(region.hidden).toBe(true);
  expect(button.querySelector("svg")).not.toBeNull();

  button.focus();
  button.click();
  await view.updateComplete;
  expect(view.shadowRoot?.querySelector(".msg-meta")).toBe(button);
  expect(view.shadowRoot?.activeElement).toBe(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.querySelector("svg")).not.toBeNull();
  expect(region.hidden).toBe(false);
  expect(region.textContent).toBe(chatMessageMetadataLabel(message));
  const content = view.shadowRoot?.querySelector(".conversation-content");
  if (!content) throw new Error("Expected conversation content");
  expect(content.nextElementSibling).toBe(region);

  button.click();
  await view.updateComplete;
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(region.hidden).toBe(true);
  expect(view.shadowRoot?.activeElement).toBe(button);
});

it("keeps conversational roles available to assistive technology without repeated visual headings", async () => {
  const view = new ChatView();
  view.messages = [{ ...message, role: "user", entryId: "request" }, message, { ...message, role: "system", entryId: "notice" }];
  document.body.append(view);
  await view.updateComplete;

  const headers = [...(view.shadowRoot?.querySelectorAll(".msg-header") ?? [])];
  expect(headers).toHaveLength(3);
  expect(headers[0]?.querySelector(".visually-hidden")?.textContent).toBe("user");
  expect(headers[1]?.querySelector(".visually-hidden")?.textContent).toBe("assistant");
  expect(headers[0]?.querySelector(".label")).toBeNull();
  expect(headers[1]?.querySelector(".label")).toBeNull();
  expect(headers[2]?.querySelector(".label")?.textContent).toBe("system");
  expect(view.shadowRoot?.querySelectorAll('button[aria-label="Message information"]')).toHaveLength(3);
});

it("shows only the metadata region controlled by the selected message's Info button", async () => {
  const view = new ChatView();
  view.messages = [{ ...message, role: "user", entryId: "first" }, message];
  document.body.append(view);
  await view.updateComplete;
  const buttons = [...(view.shadowRoot?.querySelectorAll<HTMLButtonElement>(".msg-meta") ?? [])];
  const first = buttons[0];
  const second = buttons[1];
  if (first === undefined || second === undefined) throw new Error("Expected two Info buttons");
  expect(first.getAttribute("aria-controls")).not.toBe(second.getAttribute("aria-controls"));
  first.click();
  await view.updateComplete;
  second.click();
  await view.updateComplete;
  expect(first.getAttribute("aria-expanded")).toBe("false");
  expect(second.getAttribute("aria-expanded")).toBe("true");
  expect(view.shadowRoot?.querySelectorAll('.msg-meta-details:not([hidden])')).toHaveLength(1);
});

it("toggles recorded timestamps for conversation, system, and headerless activity messages", async () => {
  const view = new ChatView();
  view.messages = [
    { ...message, role: "user", entryId: "user" },
    message,
    { ...message, role: "system", entryId: "system" },
    { ...message, role: "tool", entryId: "tool", parts: [{ type: "toolExecution", toolName: "read", summary: "file", status: "success" }] },
    { role: "assistant", parts: [{ type: "text", text: "No recorded time" }] },
    { ...message, entryId: "invalid", meta: { timestamp: "invalid" } },
  ];
  document.body.append(view);
  await view.updateComplete;
  const group = view.shadowRoot?.querySelector<HTMLDetailsElement>(".event-group");
  if (!group) throw new Error("Expected activity group");
  group.open = true;
  group.dispatchEvent(new Event("toggle"));
  await view.updateComplete;
  expect(view.shadowRoot?.querySelectorAll("time")).toHaveLength(0);

  view.showMessageTimestamps = true;
  await view.updateComplete;
  const times = [...(view.shadowRoot?.querySelectorAll("time") ?? [])];
  expect(times).toHaveLength(4);
  for (const time of times) {
    expect(time.dateTime).toBe(message.meta.timestamp);
    expect(time.textContent).not.toBe("");
    expect(time.textContent).not.toContain("model");
  }
  expect(view.shadowRoot?.querySelector(".group-msg.tool time")).not.toBeNull();

  view.showMessageTimestamps = false;
  await view.updateComplete;
  expect(view.shadowRoot?.querySelectorAll("time")).toHaveLength(0);
  expect(group.open).toBe(true);
});

it("shows timestamps on image outputs and each expanded source of combined outputs", async () => {
  const view = new ChatView();
  view.showMessageTimestamps = true;
  view.behaviors = { ...view.behaviors, loadImages: false };
  const output = { ...message, role: "tool" as const, parts: [{ type: "image" as const, mimeType: "image/png", data: "" }] };
  view.messages = [output];
  document.body.append(view);
  await view.updateComplete;
  expect(view.shadowRoot?.querySelectorAll("time")).toHaveLength(1);

  view.messages = [output, { ...output, entryId: "second-output" }];
  await view.updateComplete;
  const sources = view.shadowRoot?.querySelector<HTMLDetailsElement>(".image-output-sources");
  if (!sources) throw new Error("Expected combined output sources");
  sources.open = true;
  sources.dispatchEvent(new Event("toggle"));
  await view.updateComplete;
  expect(view.shadowRoot?.querySelectorAll(".image-output-source time")).toHaveLength(2);
});
