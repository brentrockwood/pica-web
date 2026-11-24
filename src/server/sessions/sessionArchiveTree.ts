import { resolve } from "node:path";

export interface SessionArchiveTreeCandidate {
  id: string;
  path: string;
  archived: boolean;
  parentSessionPath?: string;
}

export interface SessionArchiveTreePlan<T extends SessionArchiveTreeCandidate> {
  targets: T[];
  unarchivedTargets: T[];
  skippedAlreadyArchivedCount: number;
}

export function findArchiveCandidateByExactId<T extends SessionArchiveTreeCandidate>(candidates: readonly T[], sessionId: string): T | undefined {
  return candidates.find((candidate) => candidate.id === sessionId);
}

export function planSessionArchiveTree<T extends SessionArchiveTreeCandidate>(root: T, candidates: readonly T[]): SessionArchiveTreePlan<T> {
  const targets = sessionArchiveSubtree(root, candidates);
  const unarchivedTargets = targets.filter((target) => !target.archived);
  return {
    targets,
    unarchivedTargets,
    skippedAlreadyArchivedCount: targets.length - unarchivedTargets.length,
  };
}

function sessionArchiveSubtree<T extends SessionArchiveTreeCandidate>(root: T, candidates: readonly T[]): T[] {
  const childrenByParentPath = new Map<string, T[]>();
  for (const candidate of candidates) {
    if (candidate.parentSessionPath === undefined) continue;
    const parentPath = resolve(candidate.parentSessionPath);
    const children = childrenByParentPath.get(parentPath) ?? [];
    children.push(candidate);
    childrenByParentPath.set(parentPath, children);
  }

  const result: T[] = [];
  const visit = (candidate: T, seenPaths: Set<string>) => {
    const path = resolve(candidate.path);
    if (seenPaths.has(path)) return;
    result.push(candidate);
    const nextSeenPaths = new Set(seenPaths);
    nextSeenPaths.add(path);
    for (const child of childrenByParentPath.get(path) ?? []) visit(child, nextSeenPaths);
  };
  visit(root, new Set());
  return result;
}
