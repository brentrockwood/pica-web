import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerSessionSearchRoutes } from "./sessionSearchRoutes.js";

describe("session search route", () => {
  it("rejects invalid input before catalog access and searches only discovered workspace paths", async () => {
    const app = Fastify();
    const project = { id: "p", name: "P", path: "/project", createdAt: "now" };
    const list = vi.fn(() => Promise.resolve([project]));
    const listSearchSessions = vi.fn(() => Promise.resolve([]));
    const resolution = { projectId: "p", diagnostics: [], status: "folder" as const, workspaces: [{ id: "w", projectId: "p", path: "/authorized", label: "W", isMain: true }] };
    const resolve = vi.fn(() => Promise.resolve(resolution));
    registerSessionSearchRoutes(app, { projects: { list }, sessions: { listSearchSessions }, workspaces: { resolve, lookup: () => Promise.resolve(resolution), reconcileProject: () => Promise.resolve() } });
    try {
      for (const query of ["", " ", "a".repeat(501), 2]) expect((await app.inject({ method: "POST", url: "/sessions/search", payload: { query } })).statusCode).toBe(400);
      expect(list).not.toHaveBeenCalled();
      const response = await app.inject({ method: "POST", url: "/sessions/search", payload: { query: "text", path: "/not-authorized" } });
      expect(response.json()).toEqual({ results: [], truncated: false });
      expect(listSearchSessions).toHaveBeenCalledExactlyOnceWith("/authorized");
      resolve.mockRejectedValueOnce(new Error("Discovery unavailable"));
      const failed = await app.inject({ method: "POST", url: "/sessions/search", payload: { query: "text" } });
      expect(failed.statusCode).toBe(503); expect(failed.json()).toEqual({ error: "Discovery unavailable" });
    } finally { await app.close(); }
  });
  it("bounds stalled discovery and prevents subsequent catalog work after the deadline", async () => {
    const app = Fastify();
    let finish: ((projects: { id: string; name: string; path: string; createdAt: string }[]) => void) | undefined;
    const list = vi.fn(() => new Promise<{ id: string; name: string; path: string; createdAt: string }[]>((resolve) => { finish = resolve; }));
    const resolve = vi.fn(() => Promise.reject(new Error("Should not discover after timeout")));
    registerSessionSearchRoutes(app, { projects: { list }, sessions: { listSearchSessions: () => Promise.resolve([]) }, workspaces: { resolve, lookup: () => Promise.resolve(undefined), reconcileProject: () => Promise.resolve() } });
    await app.ready();
    try {
      vi.useFakeTimers();
      const response = app.inject({ method: "POST", url: "/sessions/search", payload: { query: "text" } });
      // Fastify injection begins on promise consumption, before advancing our deadline.
      const pending = response.then((result) => result);
      await vi.waitFor(() => { expect(list).toHaveBeenCalled(); });
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).statusCode).toBe(503);
      finish?.([{ id: "p", name: "P", path: "/project", createdAt: "now" }]);
      await Promise.resolve();
      expect(resolve).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); await app.close(); }
  });

});
