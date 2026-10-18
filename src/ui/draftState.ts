import type { Entity, ProjectData } from '../domain/types';
export type DraftState = Record<string, Entity>;
export function reconcileSavedDrafts(drafts: DraftState, submitted: Entity, saved: Entity): DraftState {
  const key = submitted.projectId + ':' + submitted.id, retained = drafts[key];
  if (!retained) return drafts;
  if (JSON.stringify(retained) === JSON.stringify(submitted)) { const next = { ...drafts }; delete next[key]; return next; }
  if (BigInt(retained.revision) >= BigInt(saved.revision)) return drafts;
  return { ...drafts, [key]: { ...retained, revision: saved.revision } };
}


/**
 * A successful entity save commits its record before asynchronous workspace-draft
 * cleanup is necessarily durable. Reloading immediately can recover an old draft
 * whose revision is behind the committed record, incorrectly shadowing the saved
 * entity. Discard only exact *content* duplicates, never merely old revisions.
 *
 * This matches the storage layer's record normalization: revision/updatedAt are
 * server-managed metadata; every authored field must still match.
 */
export function removeCommittedDraftDuplicates(
  drafts: DraftState,
  project: Pick<ProjectData, 'projectId' | 'entities'>,
): DraftState {
  const keys = Object.keys(drafts).filter(key => key.startsWith(project.projectId + ':'));
  if (!keys.length) return drafts;
  const persisted = new Map(project.entities.map(entity => [entity.id, entity]));
  const payload = (entity: Entity) => Object.fromEntries(
    Object.entries(entity).filter(([field]) => field !== 'revision' && field !== 'updatedAt'),
  );
  let result = drafts;
  for (const key of keys) {
    const pending = drafts[key];
    if (!pending || key !== pending.projectId + ':' + pending.id || pending.projectId !== project.projectId) continue;
    const saved = persisted.get(pending.id);
    if (!saved || !/^(0|[1-9]\d*)$/.test(pending.revision) || !/^(0|[1-9]\d*)$/.test(saved.revision)) continue;
    if (BigInt(pending.revision) > BigInt(saved.revision)) continue;
    if (JSON.stringify(payload(pending)) !== JSON.stringify(payload(saved))) continue;
    if (result === drafts) result = { ...drafts };
    delete result[key];
  }
  return result;
}

export type JsonBufferState = Record<string, Record<string, string>>;
export function updateJsonBuffer(buffers: JsonBufferState, key: string, field: string, raw: string | undefined, expectedRaw?: string): JsonBufferState {
  if (expectedRaw !== undefined && buffers[key]?.[field] !== expectedRaw) return buffers;
  const fields = { ...(buffers[key] ?? {}) };
  if (raw === undefined) delete fields[field]; else fields[field] = raw;
  if (Object.keys(fields).length) return { ...buffers, [key]: fields };
  if (!buffers[key]) return buffers;
  const next = { ...buffers }; delete next[key]; return next;
}
