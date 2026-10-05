import type { ProjectContent, WorldReference } from './types';
export interface PinnedWorldClosure { worlds: ProjectContent[]; references: WorldReference[]; errors: string[] }
/** One active immutable version per world project, including transitive dependencies. */
export function resolvePinnedWorlds(project: Pick<ProjectContent, 'worldReferences'>, snapshots: Record<string, ProjectContent>): PinnedWorldClosure {
  const worlds: ProjectContent[] = [], references: WorldReference[] = [], errors: string[] = [];
  const visited = new Set<string>(), active = new Set<string>(), projects = new Map<string, string>();
  const pending: ({ reference: WorldReference } | { exit: string })[] = [...project.worldReferences].reverse().map(reference => ({ reference }));
  let steps = 0;
  while (pending.length) {
    if (++steps > 200_000) { errors.push('共通世界の依存数が安全上限を超えています。'); break; }
    const frame = pending.pop()!;
    if ('exit' in frame) { active.delete(frame.exit); continue; }
    const reference = frame.reference, id = reference.immutableSnapshotId;
    if (active.has(id)) { errors.push('共通世界の固定版参照が循環しています。'); continue; }
    const previous = projects.get(reference.projectId);
    if (previous && previous !== id) { errors.push('同じ共通世界の異なる版が同時に参照されています。'); continue; }
    projects.set(reference.projectId, id);
    if (visited.has(id)) continue;
    const world = snapshots[id];
    if (!world || world.projectId !== reference.projectId) { errors.push('参照した共通世界の固定版がありません。'); continue; }
    visited.add(id); active.add(id); references.push(reference); worlds.push(world); pending.push({ exit: id });
    if (!Array.isArray(world.worldReferences)) { errors.push('共通世界の依存参照が不正です。'); continue; }
    for (const child of [...world.worldReferences].reverse()) pending.push({ reference: child });
  }
  return { worlds, references, errors };
}
