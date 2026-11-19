import type { FastifyInstance } from "fastify";
import type { Project, ClientSession } from "../types.js";
import type { WorkspaceCatalogResolver } from "./workspaceCatalogRoutes.js";
import { searchSessionFiles, type SearchableSession } from "../sessions/sessionSearch.js";
import { requestCancellation } from "../requestCancellation.js";
import { isRecord } from "../sessions/sessionFileFormat.js";

interface Dependencies {
  projects: { list(): Promise<Project[]> };
  workspaces: WorkspaceCatalogResolver;
  sessions: { listSearchSessions(cwd: string): Promise<Pick<ClientSession, "id" | "path" | "name" | "firstMessage">[]> };
}

export function registerSessionSearchRoutes(app: FastifyInstance, dependencies: Dependencies): void {
  app.post("/sessions/search", async (request, reply) => {
    const query = isRecord(request.body) ? request.body["query"] : undefined;
    if (typeof query !== "string" || query.trim() === "" || query.length > 500) return reply.code(400).send({ error: "Enter search text (1–500 characters)." });
    const cancellation = requestCancellation(request, reply);
    const controller = new AbortController();
    const abort = () => { controller.abort(new Error("Session search cancelled.")); };
    cancellation.signal.addEventListener("abort", abort, { once: true });
    if (cancellation.signal.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const work = async () => {
        const sessions: SearchableSession[] = [];
        for (const project of await dependencies.projects.list()) {
          controller.signal.throwIfAborted();
          const resolution = await dependencies.workspaces.resolve(project);
          controller.signal.throwIfAborted();
          await dependencies.workspaces.reconcileProject(project, resolution);
          if (resolution.status === "degraded") throw new Error(`Workspace discovery unavailable for ${project.name}.`);
          for (const workspace of resolution.workspaces) {
            controller.signal.throwIfAborted();
            for (const session of await dependencies.sessions.listSearchSessions(workspace.path)) {
              if (session.path === "") continue;
              sessions.push({ sessionId: session.id, path: session.path, projectId: project.id, workspaceId: workspace.id, title: (session.name ?? "") !== "" ? session.name ?? session.id : session.firstMessage.slice(0, 120) || session.id, project: project.name, workspace: workspace.label });
            }
          }
        }
        return searchSessionFiles(sessions, query, controller.signal);
      };
      const response = await Promise.race([work(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Session search exceeded 10 seconds. Try a more specific search.");
          controller.abort(error);
          reject(error);
        }, 10_000);
      })]);
      return await reply.header("cache-control", "no-store").send(response);
    } catch (error) {
      return await reply.code(503).send({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
      cancellation.signal.removeEventListener("abort", abort);
      cancellation.dispose();
    }
  });
}
