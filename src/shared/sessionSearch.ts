export interface SessionSearchResult {
  sessionId: string;
  projectId: string;
  workspaceId: string;
  title: string;
  project: string;
  workspace: string;
  excerpt: string;
}

export interface SessionSearchResponse {
  results: SessionSearchResult[];
  truncated: boolean;
}

export function parseSessionSearchResponse(value: unknown): SessionSearchResponse {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)
    || !("truncated" in value) || typeof value.truncated !== "boolean") throw new Error("Invalid session search response");
  const results = value.results.map((item: unknown): SessionSearchResult => {
    if (typeof item !== "object" || item === null
      || !("sessionId" in item) || typeof item.sessionId !== "string"
      || !("projectId" in item) || typeof item.projectId !== "string"
      || !("workspaceId" in item) || typeof item.workspaceId !== "string"
      || !("title" in item) || typeof item.title !== "string"
      || !("project" in item) || typeof item.project !== "string"
      || !("workspace" in item) || typeof item.workspace !== "string"
      || !("excerpt" in item) || typeof item.excerpt !== "string") throw new Error("Invalid session search result");
    return { sessionId: item.sessionId, projectId: item.projectId, workspaceId: item.workspaceId, title: item.title, project: item.project, workspace: item.workspace, excerpt: item.excerpt };
  });
  return { results, truncated: value.truncated };
}
