import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import type { SessionSearchResponse, SessionSearchResult } from "../../shared/sessionSearch.js";
import { isRecord, tryParseEntry } from "./sessionFileFormat.js";

export interface SearchableSession extends Omit<SessionSearchResult, "excerpt"> { path: string }
const MAX_LINE_CHARS = 8 * 1024 * 1024;
const MAX_RESULTS = 50;

/** Only decoded user/assistant text participates; tools, thinking and metadata do not. */
export function conversationExcerpt(line: string, query: string): string | undefined {
  const entry = tryParseEntry(line);
  const message = entry?.["message"];
  if (entry?.["type"] !== "message" || !isRecord(message) || (message["role"] !== "user" && message["role"] !== "assistant")) return undefined;
  const content = message["content"];
  const texts = typeof content === "string" ? [content] : Array.isArray(content)
    ? content.flatMap((part: unknown) => isRecord(part) && part["type"] === "text" && typeof part["text"] === "string" ? [part["text"]] : []) : [];
  for (const text of texts) {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index !== -1) {
      const start = Math.max(0, index - 80);
      const end = Math.min(text.length, index + query.length + 160);
      return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
    }
  }
  return undefined;
}

function candidates(paths: string[], query: string, signal: AbortSignal): Promise<Set<string>> {
  // JSON escapes can hide any character (including Unicode). Include every file
  // containing a backslash, then verify decoded text rather than risk false negatives.
  // JS lowercasing expands dotted I; rg simple folding does not. Keep it as a candidate too.
  const args = ["--no-config", "--fixed-strings", "--ignore-case", "--files-with-matches", "--null", "--text", "-e", JSON.stringify(query.toLowerCase()).slice(1, -1), "-e", "\\", "-e", "İ", "--", ...paths];
  return new Promise((resolve, reject) => {
    execFile("rg", args, { signal, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null && error.code !== 1) {
        reject(new Error(error.code === "ENOENT" ? "Find session requires ripgrep (rg) on this machine." : `Session search failed: ${stderr || error.message}`));
      } else resolve(new Set(stdout.split("\0").filter(Boolean)));
    });
  });
}

/** Paths come only from the session catalog, never from the request. No shell or recursive scan. */
export async function searchSessionFiles(sessions: readonly SearchableSession[], query: string, signal: AbortSignal): Promise<SessionSearchResponse> {
  const results: SessionSearchResult[] = [];
  let truncated = false;
  const seen = new Set<string>();
  for (let offset = 0; offset < sessions.length; offset += 100) {
    signal.throwIfAborted();
    const batch = sessions.slice(offset, offset + 100);
    const matches = await candidates(batch.map((session) => session.path), query, signal);
    for (const session of batch) {
      signal.throwIfAborted();
      if (!matches.has(session.path) || seen.has(session.sessionId)) continue;
      const stream = createReadStream(session.path, { encoding: "utf8", signal });
      let pending = "";
      let skipping = false;
      let excerpt: string | undefined;
      try {
        for await (const chunk of stream) {
          signal.throwIfAborted();
          const parts = String(chunk).split("\n");
          for (let index = 0; index < parts.length; index++) {
            const part = parts[index] ?? "";
            if (!skipping) {
              if (pending.length + part.length > MAX_LINE_CHARS) { skipping = true; truncated = true; pending = ""; }
              else pending += part;
            }
            if (index < parts.length - 1) {
              if (!skipping) excerpt = conversationExcerpt(pending, query);
              pending = "";
              skipping = false;
              if (excerpt !== undefined) break;
            }
          }
          if (excerpt !== undefined) break;
        }
        if (excerpt === undefined && !skipping && pending !== "") excerpt = conversationExcerpt(pending, query);
      } finally { stream.destroy(); }
      if (excerpt !== undefined) {
        results.push({ sessionId: session.sessionId, projectId: session.projectId, workspaceId: session.workspaceId, title: session.title, project: session.project, workspace: session.workspace, excerpt });
        seen.add(session.sessionId);
        if (results.length === MAX_RESULTS) return { results, truncated: true };
      }
    }
  }
  return { results, truncated };
}
