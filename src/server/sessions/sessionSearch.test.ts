import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationExcerpt, searchSessionFiles, type SearchableSession } from "./sessionSearch.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
const message = (role: string, content: unknown) => JSON.stringify({ type: "message", message: { role, content } });

describe("session conversation search", () => {
  it("matches only literal user/assistant text, not tools, thinking, metadata or custom messages", () => {
    expect(conversationExcerpt(message("user", "A.*[B]"), "a.*[b]")).toBe("A.*[B]");
    expect(conversationExcerpt(message("assistant", [{ type: "text", text: "HELLO" }, { type: "thinking", thinking: "secret" }, { type: "toolCall", name: "secret" }]), "hello")).toBe("HELLO");
    for (const line of [message("toolResult", "secret"), message("assistant", [{ type: "thinking", thinking: "secret" }]), JSON.stringify({ type: "session_info", name: "secret" }), JSON.stringify({ type: "custom_message", content: "secret" }), "invalid"]) expect(conversationExcerpt(line, "secret")).toBeUndefined();
  });

  it("runs real rg safely on catalog files and verifies decoded escaped text, with one result per session", async () => {
    const root = await mkdtemp(join(tmpdir(), "find-session-")); roots.push(root);
    const sessions: SearchableSession[] = [];
    for (const [index, text] of [message("user", 'Say "HELLO"\nC:\\temp'), message("toolResult", 'Say "HELLO"\nC:\\temp'), message("assistant", "hello").replace("hello", "\\u0068ello")].entries()) {
      const path = join(root, `-file ${String(index)}.jsonl`);
      await writeFile(path, `${text}\n${text}\n`);
      sessions.push({ path, sessionId: String(index), projectId: "p", workspaceId: "w", project: "Project", workspace: "Workspace", title: "Title" });
    }
    const signal = new AbortController().signal;
    expect((await searchSessionFiles(sessions, '"hello"\nC:\\temp', signal)).results.map((r) => r.sessionId)).toEqual(["0"]);
    expect((await searchSessionFiles(sessions, "hello", signal)).results.map((r) => r.sessionId)).toEqual(["0", "2"]);
    expect((await searchSessionFiles(sessions, "$(touch /tmp/never-execute)", signal)).results).toEqual([]);
  });

  it("marks the result cap as incomplete and respects cancellation", async () => {
    const root = await mkdtemp(join(tmpdir(), "find-session-")); roots.push(root);
    const path = join(root, "session.jsonl"); await writeFile(path, message("user", "needle"));
    const sessions = Array.from({ length: 51 }, (_, i) => ({ path, sessionId: String(i), projectId: "p", workspaceId: "w", project: "P", workspace: "W", title: "T" }));
    const response = await searchSessionFiles(sessions, "needle", new AbortController().signal);
    expect(response.results).toHaveLength(50); expect(response.truncated).toBe(true);
    const controller = new AbortController(); controller.abort();
    await expect(searchSessionFiles(sessions, "needle", controller.signal)).rejects.toThrow();
  });
  it("keeps Unicode lowercasing expansions in the candidate set", async () => {
    const root = await mkdtemp(join(tmpdir(), "find-session-")); roots.push(root);
    const path = join(root, "unicode.jsonl");
    const session = { path, sessionId: "s", projectId: "p", workspaceId: "w", project: "P", workspace: "W", title: "T" };
    await writeFile(path, message("user", "İstanbul"));
    expect((await searchSessionFiles([session], "i", new AbortController().signal)).results).toHaveLength(1);
    await writeFile(path, message("user", "i\u0307stanbul"));
    expect((await searchSessionFiles([session], "İ", new AbortController().signal)).results).toHaveLength(1);
  });

  it("reports missing rg and filesystem errors rather than empty success", async () => {
    const session = { path: "/missing/transcript.jsonl", sessionId: "s", projectId: "p", workspaceId: "w", project: "P", workspace: "W", title: "T" };
    await expect(searchSessionFiles([session], "text", new AbortController().signal)).rejects.toThrow("Session search failed");
    vi.stubEnv("PATH", "");
    await expect(searchSessionFiles([session], "text", new AbortController().signal)).rejects.toThrow("requires ripgrep");
  });

  it("streams past oversized entries and marks skipped content incomplete", async () => {
    const root = await mkdtemp(join(tmpdir(), "find-session-")); roots.push(root);
    const path = join(root, "large.jsonl");
    await writeFile(path, `${message("user", "x".repeat(9 * 1024 * 1024))}\n${message("assistant", "needle")} `);
    const session = { path, sessionId: "s", projectId: "p", workspaceId: "w", project: "P", workspace: "W", title: "T" };
    const response = await searchSessionFiles([session], "needle", new AbortController().signal);
    expect(response.results[0]?.excerpt).toBe("needle");
    expect(response.truncated).toBe(true);
  });

});
