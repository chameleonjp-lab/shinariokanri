import type { ID, ProjectContent, ProjectData, ProjectSnapshot } from './types';
import { createEntity, newId } from './model';
import { initializeRuntimeState } from './conditions';
import { captureRuntimeContent } from './runtimeVersions';
import { resolvePinnedWorlds } from './pinnedWorlds';
import { adoptedRecord } from './adoption';
import { jsonBytes, sha256 } from '../storage/json';
import { resolveReuseContent } from './reuse';

/** New author-supplied starts are always partial; the normal editor retains their drafts. */
export async function preparePartialCheckpoint(project: ProjectData, options: { contentVersionId?: ID; entryId?: ID; worldSnapshots?: Record<ID, ProjectContent> } = {}) {
  const requested = structuredClone(options), version = requested.contentVersionId ?? project.projectId;
  const content = await captureRuntimeContent(project, version, { worldSnapshots: requested.worldSnapshots });
  if (requested.entryId && !content.entities.some(entity => entity.id === requested.entryId && entity.kind === 'flow_node' && adoptedRecord(entity))) throw new Error('選んだ開始点が対象版にありません。');
  const fixedVersion = version === project.projectId ? newId() : version;
  const view = resolveReuseContent(content, content.snapshots);
  const referenceEntities = resolvePinnedWorlds(view, requested.worldSnapshots ?? {}).worlds.flatMap(world => world.entities);
  const state = initializeRuntimeState(view, fixedVersion, referenceEntities);
  state.provenance = 'partial'; state.presentationPosition = requested.entryId ?? null;
  const { snapshots: _snapshots, history: _history, authorAlternatives: _alternatives, ...fixedContent } = content;
  const snapshots: ProjectSnapshot[] = version === project.projectId ? [{ id: fixedVersion, content: fixedContent, contentHash: await sha256(jsonBytes(fixedContent)), createdAt: new Date().toISOString(), versionLabel: `途中開始の固定版 ${content.revision}` }] : [];
  const checkpoint = createEntity(project.projectId, 'checkpoint', '途中開始の状態', { contentVersionId: fixedVersion, contentRevision: content.revision, runtimeState: state, origin: 'partial' });
  return { checkpoint, snapshots };
}
