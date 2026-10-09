import type { ID, ProjectData } from './types';
/** Explicit adoption controls visibility, while locally used participants remain reachable. */
export function adoptedWorldEntityIds(project: ProjectData): ID[] | undefined {
  const views = project.views.filter(view => view.view.startsWith('world-adoption:'));
  if (!views.length) return undefined;
  const used = project.entities.filter(entity => !entity.deletedAt).flatMap(entity => entity.kind === 'event' ? (entity.data.participants ?? []).map(participant => participant.characterId) : entity.kind === 'group' ? entity.data.members ?? [] : []);
  return [...new Set([...views.flatMap(view => view.entityIds), ...used])];
}
/** Join immutable snapshot registries without replacing a source's current editable content. */
export function mergeWorldSources(current: ProjectData[], pinned: Record<string, ProjectData>): ProjectData[] {
  const result = new Map<string, ProjectData>();
  for (const world of [...Object.values(pinned), ...current]) {
    const previous = result.get(world.projectId);
    const snapshots = new Map(previous?.snapshots.map(snapshot => [snapshot.id, snapshot]) ?? []);
    for (const snapshot of world.snapshots) if (!snapshots.has(snapshot.id)) snapshots.set(snapshot.id, snapshot);
    result.set(world.projectId, { ...world, snapshots: [...snapshots.values()] });
  }
  return [...result.values()];
}
