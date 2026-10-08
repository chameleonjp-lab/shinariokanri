import type { ProjectData } from '../domain/types';
import { referencedWorlds, verifySnapshotHashes, verifyWorlds, worldSnapshotContents } from './archive';
import { collectReferences, collectRelationReferences, validateProject } from '../domain/model';
import { equalJson } from './json';
import { StorageError } from './errors';

export interface WorldPinInput { world: ProjectData; snapshotId: string; dependencies?: Record<string, ProjectData> }
/** Persist only immutable selected contents, never a source world's mutable author draft. */
export async function prepareWorldPin(candidate: ProjectData, pin: WorldPinInput, known: Record<string, ProjectData>): Promise<Record<string, ProjectData>> {
  const sources = { ...known, ...pin.dependencies, [pin.snapshotId]: pin.world };
  const result: Record<string, ProjectData> = {};
  const pending = [pin.snapshotId];
  while (pending.length) {
    const id = pending.pop()!;
    if (result[id]) continue;
    const source = sources[id], snapshot = source?.snapshots.find(value => value.id === id);
    if (!source || !snapshot || snapshot.content.projectId !== source.projectId) throw new StorageError('VALIDATION_FAILED', '固定する共通世界の版が見つかりません。', id);
    const previous = known[id]?.snapshots.find(value => value.id === id);
    if (previous && !equalJson(previous, snapshot)) throw new StorageError('IMMUTABLE_SNAPSHOT', '保存済みの共通世界版を変更できません。', id);
    const retained = new Map([[snapshot.id, snapshot]]), versions = [snapshot];
    while (versions.length) {
      const version = versions.pop()!;
      const refs = [...version.content.entities.flatMap(collectReferences), ...version.content.relations.flatMap(collectRelationReferences)];
      for (const reference of refs) if (reference.scope === 'snapshot' && reference.id !== source.projectId && !retained.has(reference.id)) {
        const dependency = source.snapshots.find(value => value.id === reference.id);
        if (dependency) { retained.set(dependency.id, dependency); versions.push(dependency); }
      }
    }
    const envelope: ProjectData = { ...structuredClone(snapshot.content), snapshots: structuredClone([...retained.values()]), history: [] };
    result[id] = envelope;
    for (const reference of referencedWorlds([envelope])) pending.push(reference.immutableSnapshotId);
  }
  const selected = result[pin.snapshotId].snapshots[0];
  if (!candidate.worldReferences.some(reference => reference.immutableSnapshotId === pin.snapshotId && reference.projectId === selected.content.projectId && reference.contentHash === selected.contentHash)) throw new StorageError('VALIDATION_FAILED', '作品の固定版参照と保存対象が一致しません。', pin.snapshotId);
  const worlds = { ...known, ...result }, contents = worldSnapshotContents(worlds);
  for (const envelope of Object.values(result)) {
    const validation = validateProject(envelope, { worldSnapshots: contents });
    if (!validation.ok) throw new StorageError('VALIDATION_FAILED', validation.issues.map(issue => issue.message).join('\n'));
  }
  verifyWorlds([candidate, ...Object.values(result)], worlds);
  await verifySnapshotHashes([...Object.values(known), ...Object.values(result)]);
  return result;
}
