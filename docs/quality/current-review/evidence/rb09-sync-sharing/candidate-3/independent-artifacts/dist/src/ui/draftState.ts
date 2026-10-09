import type { Entity } from '../domain/types';
export type DraftState = Record<string, Entity>;
export function reconcileSavedDrafts(drafts: DraftState, submitted: Entity, saved: Entity): DraftState {
  const key = submitted.projectId + ':' + submitted.id, retained = drafts[key];
  if (!retained) return drafts;
  if (JSON.stringify(retained) === JSON.stringify(submitted)) { const next = { ...drafts }; delete next[key]; return next; }
  if (BigInt(retained.revision) >= BigInt(saved.revision)) return drafts;
  return { ...drafts, [key]: { ...retained, revision: saved.revision } };
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
