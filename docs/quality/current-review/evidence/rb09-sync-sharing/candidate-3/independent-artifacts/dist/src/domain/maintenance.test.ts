import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyRuntimeState, newId, validateProject } from './model';
import type { Entity, ProjectContent, ProjectData } from './types';
import { deletionImpact, previewMerge } from './maintenance';
import { jsonBytes, sha256 } from '../storage/json';

async function mergeFixture(): Promise<{ project: ProjectData; source: Entity<'character'>; survivor: Entity<'character'>; oldBlockId: string; pinnedVersionId: string; sourceAliasId: string; liveCue: Entity<'cue'>; pinnedCue: Entity<'cue'>; currentVersionCue: Entity<'cue'>; pinnedCheckpoint: Entity<'checkpoint'>; currentCheckpoint: Entity<'checkpoint'>; pinnedTrace: Entity<'trace'>; currentTrace: Entity<'trace'>; pinnedReview: Entity<'review'>; currentReview: Entity<'review'> }> {
  const project = createProject('版固定参照の統合');
  const oldBlockId = newId(), survivorBlockId = newId();
  const sourceAliasId = newId();
  const alias = (id: string, text: string) => ({ id, text, reading: '', validity: { worldRange: null, routeCondition: null, presentationAnchor: null }, audienceHolderIds: [], isPublicDefault: true });
  const source = createEntity(project.projectId, 'character', '統合元', {
    body: [{
      id: oldBlockId,
      kind: 'paragraph',
      text: '源の本文',
      ruby: [{ start: 0, end: 1, text: 'みなもと' }],
      links: [{ start: 1, end: 2, target: { entityId: '', blockId: oldBlockId, start: 0, end: 1 } }],
    }],
    aliases: [alias(sourceAliasId, '源の別名')],
  });
  const survivor = createEntity(project.projectId, 'character', '残す人物', {
    body: [{ id: survivorBlockId, kind: 'paragraph', text: '残す本文' }],
    aliases: [alias(newId(), '残す別名')],
  });
  // The link points to its own source scene. It becomes a live link to the survivor when the body is adopted.
  source.data.body![0]!.links![0]!.target.entityId = source.id;
  const entry = createEntity(project.projectId, 'flow_node', '試読入口', { nodeType: 'entry', executionPolicy: 'manual_choice' });
  project.entities = [source, survivor, entry];
  const { snapshots: _snapshots, history: _history, ...snapshotContent } = structuredClone(project);
  const pinnedVersionId = newId();
  project.snapshots.push({ id: pinnedVersionId, versionLabel: '公開版1', contentHash: await sha256(jsonBytes(snapshotContent)), createdAt: '2025-03-01T00:00:00.000Z', content: snapshotContent as ProjectContent });
  const liveCue = createEntity(project.projectId, 'cue', '現在本文の演出', {
    cueType: 'camera', anchor: { entityId: source.id, blockId: oldBlockId, start: 1, end: 2 },
  });
  const pinnedCue = createEntity(project.projectId, 'cue', '公開版の演出', {
    cueType: 'camera', anchor: { entityId: source.id, blockId: oldBlockId, start: 0, end: 1, sourceVersionId: pinnedVersionId },
  });
  const currentVersionCue = createEntity(project.projectId, 'cue', '現在版を明示した演出', {
    cueType: 'camera', anchor: { entityId: source.id, blockId: oldBlockId, start: 0, end: 1, sourceVersionId: project.projectId },
  });
  const pinnedState = emptyRuntimeState(pinnedVersionId); pinnedState.seenIds = [source.id];
  const currentState = emptyRuntimeState(project.projectId); currentState.seenIds = [source.id];
  const pinnedCheckpoint = createEntity(project.projectId, 'checkpoint', '公開版の記録', { contentVersionId: pinnedVersionId, runtimeState: pinnedState, origin: 'partial' });
  const currentCheckpoint = createEntity(project.projectId, 'checkpoint', '現在版の記録', { contentVersionId: project.projectId, runtimeState: currentState, origin: 'partial' });
  const pinnedTrace = createEntity(project.projectId, 'trace', '公開版の試読', { contentVersionId: pinnedVersionId, startCheckpointId: pinnedCheckpoint.id, steps: [{ nodeId: entry.id, edgeIds: [], before: structuredClone(pinnedState), after: structuredClone(pinnedState) }] });
  const currentTrace = createEntity(project.projectId, 'trace', '現在版の試読', { contentVersionId: project.projectId, startCheckpointId: currentCheckpoint.id, steps: [{ nodeId: entry.id, edgeIds: [], before: structuredClone(currentState), after: structuredClone(currentState) }] });
  const pinnedReview = createEntity(project.projectId, 'review', '公開版への指摘', { target: { entityId: source.id, blockId: oldBlockId, start: 0, end: 1 }, targetVersionId: pinnedVersionId, body: [] });
  const currentReview = createEntity(project.projectId, 'review', '現在版への指摘', { target: { entityId: source.id, blockId: oldBlockId, start: 0, end: 1 }, targetVersionId: project.projectId, body: [] });
  const projection = createEntity(project.projectId, 'projection_profile', '人物名の公開表示', { audience: '読者', includedIds: [source.id], namePolicy: { mode: 'alias', aliasId: sourceAliasId } });
  project.entities.push(liveCue, pinnedCue, currentVersionCue, pinnedCheckpoint, currentCheckpoint, pinnedTrace, currentTrace, pinnedReview, currentReview, projection);
  return { project, source, survivor, oldBlockId, pinnedVersionId, sourceAliasId, liveCue, pinnedCue, currentVersionCue, pinnedCheckpoint, currentCheckpoint, pinnedTrace, currentTrace, pinnedReview, currentReview };
}

function runMerge(project: ProjectData, sourceId: string, survivorId: string, field: 'source' | 'survivor' = 'source') {
  return previewMerge(project, {
    sourceId,
    survivorId,
    fields: { body: field, aliases: 'source' },
    operationId: newId(),
    deletedAt: '2025-03-02T00:00:00.000Z',
  });
}

describe('merge preserves versioned text anchors and rich block identity', () => {
  it('remaps current anchors into freshly identified adopted blocks while keeping a pinned snapshot anchor exact', () => {
    return mergeFixture().then(async ({ project, source, survivor, oldBlockId, pinnedVersionId, sourceAliasId, liveCue, pinnedCue, currentVersionCue, pinnedCheckpoint, currentCheckpoint, pinnedTrace, currentTrace, pinnedReview, currentReview }) => {
    expect(validateProject(project).ok).toBe(true);
    const pinnedBefore = structuredClone(pinnedCue.data.anchor);
    const snapshotsBefore = structuredClone(project.snapshots);
    const historyBefore = structuredClone(project.history);
    const pinnedCheckpointSeen = [...pinnedCheckpoint.data.runtimeState.seenIds];
    const pinnedTraceSeen = [...pinnedTrace.data.steps[0]!.before.seenIds];
    const pinnedReviewTarget = structuredClone(pinnedReview.data.target);

    const result = runMerge(project, source.id, survivor.id);
    expect(validateProject(result.project).ok).toBe(true);
    const nextSurvivor = result.project.entities.find((entity): entity is Entity<'character'> => entity.id === survivor.id)!;
    const copiedBlock = nextSurvivor.data.body![0]!;
    const nextLiveCue = result.project.entities.find((entity): entity is Entity<'cue'> => entity.id === liveCue.id)!;
    const nextPinnedCue = result.project.entities.find((entity): entity is Entity<'cue'> => entity.id === pinnedCue.id)!;
    const nextCurrentVersionCue = result.project.entities.find((entity): entity is Entity<'cue'> => entity.id === currentVersionCue.id)!;
    const originalSource = result.project.entities.find((entity): entity is Entity<'character'> => entity.id === source.id)!;
    const adoptedAliasId = nextSurvivor.data.aliases?.[0]?.id;
    const projection = result.project.entities.find((entity): entity is Entity<'projection_profile'> => entity.kind === 'projection_profile')!;
    const nextPinnedCheckpoint = result.project.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === pinnedCheckpoint.id)!;
    const nextCurrentCheckpoint = result.project.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === currentCheckpoint.id)!;
    const nextPinnedTrace = result.project.entities.find((entity): entity is Entity<'trace'> => entity.id === pinnedTrace.id)!;
    const nextCurrentTrace = result.project.entities.find((entity): entity is Entity<'trace'> => entity.id === currentTrace.id)!;
    const nextPinnedReview = result.project.entities.find((entity): entity is Entity<'review'> => entity.id === pinnedReview.id)!;
    const nextCurrentReview = result.project.entities.find((entity): entity is Entity<'review'> => entity.id === currentReview.id)!;

    expect(copiedBlock.id).not.toBe(oldBlockId);
    expect(copiedBlock.id).not.toBe(survivor.data.body![0]!.id);
    expect(originalSource.data.body![0]!.id).toBe(oldBlockId);
    expect(originalSource.deletedAt).toBe('2025-03-02T00:00:00.000Z');
    expect(copiedBlock.ruby).toEqual([{ start: 0, end: 1, text: 'みなもと' }]);
    expect(copiedBlock.links?.[0]?.start).toBe(1);
    expect(copiedBlock.links?.[0]?.end).toBe(2);
    expect(copiedBlock.links?.[0]?.target).toEqual({ entityId: survivor.id, blockId: copiedBlock.id, start: 0, end: 1 });
    expect(nextLiveCue.data.anchor).toEqual({ entityId: survivor.id, blockId: copiedBlock.id, start: 1, end: 2 });
    expect(nextPinnedCue.data.anchor).toEqual(pinnedBefore);
    expect(nextPinnedCue.data.anchor).toEqual({ entityId: source.id, blockId: oldBlockId, start: 0, end: 1, sourceVersionId: pinnedVersionId });
    expect(nextCurrentVersionCue.data.anchor).toEqual({ entityId: survivor.id, blockId: copiedBlock.id, start: 0, end: 1, sourceVersionId: project.projectId });
    expect(new Set(result.project.entities.flatMap(entity => (entity.data as { aliases?: { id: string }[] }).aliases?.map(alias => alias.id) ?? [])).size).toBe(2);
    expect(originalSource.data.aliases?.[0]?.id).toBe(sourceAliasId);
    expect(adoptedAliasId).not.toBe(sourceAliasId);
    expect(projection.data.includedIds).toContain(survivor.id);
    expect(projection.data.namePolicy).toEqual({ mode: 'alias', aliasId: adoptedAliasId });
    expect(nextPinnedCheckpoint.data.runtimeState.seenIds).toEqual(pinnedCheckpointSeen);
    expect(nextCurrentCheckpoint.data.runtimeState.seenIds).toEqual([survivor.id]);
    expect(nextPinnedTrace.data.steps[0]!.before.seenIds).toEqual(pinnedTraceSeen);
    expect(nextCurrentTrace.data.steps[0]!.before.seenIds).toEqual([survivor.id]);
    expect(nextPinnedReview.data.target).toEqual(pinnedReviewTarget);
    expect(nextCurrentReview.data.target).toEqual({ entityId: survivor.id, blockId: copiedBlock.id, start: 0, end: 1 });
    expect(result.project.snapshots).toEqual(snapshotsBefore);
    expect(result.project.history).toEqual(historyBefore);
    expect(project.snapshots).toEqual(snapshotsBefore);
    });
  });

  it('keeps a live anchor on the retained source body when that body was not adopted', () => {
    return mergeFixture().then(({ project, source, survivor, oldBlockId, liveCue }) => {
    const result = runMerge(project, source.id, survivor.id, 'survivor');
    const nextLiveCue = result.project.entities.find((entity): entity is Entity<'cue'> => entity.id === liveCue.id)!;
    expect(nextLiveCue.data.anchor).toEqual({ entityId: source.id, blockId: oldBlockId, start: 1, end: 2 });
    expect(result.project.entities.find((entity): entity is Entity<'character'> => entity.id === survivor.id)?.data.body?.[0]?.text).toBe('残す本文');
    });
  });

  it('distinguishes fixed-version-only impacts from references that still block current archival', async () => {
    const pinned = await mergeFixture();
    const pinnedIds = new Set([pinned.source.id, pinned.survivor.id, pinned.pinnedCue.id, pinned.pinnedCheckpoint.id, pinned.pinnedTrace.id, pinned.pinnedReview.id]);
    pinned.project.entities = pinned.project.entities.filter(entity => pinnedIds.has(entity.id));
    const fixedImpacts = deletionImpact(pinned.project, pinned.source.id);
    expect(fixedImpacts.length).toBeGreaterThan(0);
    expect(fixedImpacts.every(impact => impact.snapshotId === pinned.pinnedVersionId)).toBe(true);

    const current = await mergeFixture();
    const currentIds = new Set([current.source.id, current.survivor.id, current.liveCue.id, current.currentVersionCue.id, current.currentCheckpoint.id, current.currentTrace.id, current.currentReview.id]);
    current.project.entities = current.project.entities.filter(entity => currentIds.has(entity.id));
    const currentImpacts = deletionImpact(current.project, current.source.id);
    expect(currentImpacts.some(impact => impact.path.includes('anchor') && !impact.snapshotId)).toBe(true);
    expect(currentImpacts.some(impact => impact.sourceId === current.currentCheckpoint.id && !impact.snapshotId)).toBe(true);
    expect(currentImpacts.some(impact => impact.sourceId === current.currentTrace.id && !impact.snapshotId)).toBe(true);
    expect(currentImpacts.some(impact => impact.sourceId === current.currentReview.id && !impact.snapshotId)).toBe(true);
  });
});

it('keeps identity and calendar references scoped when their text equals a merged entity ID', () => {
  const project = createProject('参照のスコープ');
  const source = createEntity(project.projectId, 'character', '元'), survivor = createEntity(project.projectId, 'character', '残す');
  const task = createEntity(project.projectId, 'production_task', '担当者の確認', { targetIds: [source.id], assigneeId: source.id });
  project.calendars = [{ ...project.calendars[0], id: source.id }]; project.calendarId = source.id;
  const event = createEntity(project.projectId, 'event', '暦の確認', { time: { mode: 'instant', at: '0', calendarId: source.id } });
  project.entities = [source, survivor, task, event];
  expect(validateProject(project).ok).toBe(true);
  const result = previewMerge(project, { sourceId: source.id, survivorId: survivor.id, fields: {}, operationId: newId(), deletedAt: new Date().toISOString() });
  const nextTask = result.project.entities.find((item): item is Entity<'production_task'> => item.id === task.id)!;
  const nextEvent = result.project.entities.find((item): item is Entity<'event'> => item.id === event.id)!;
  expect(nextTask.data.targetIds).toEqual([survivor.id]); expect(nextTask.data.assigneeId).toBe(source.id);
  expect(nextEvent.data.time.mode === 'instant' && nextEvent.data.time.calendarId).toBe(source.id);
  expect(validateProject(result.project).ok).toBe(true);
});

it('remaps adopted public record IDs and current presentations but preserves a pinned profile', async () => {
  const f = await mergeFixture();
  const profile = f.project.entities.find((item): item is Entity<'projection_profile'> => item.kind === 'projection_profile')!;
  const entityPublicId = newId(), blockPublicId = newId();
  profile.data.publicIds = { [f.source.id]: entityPublicId, [f.oldBlockId]: blockPublicId };
  const pinned = createEntity(f.project.projectId, 'projection_profile', '固定版の公開設定', { ...structuredClone(profile.data), sourceVersionId: f.pinnedVersionId });
  f.project.entities.push(pinned);
  f.currentCheckpoint.data.runtimeState.seenIds = [f.source.id, f.oldBlockId];
  for (const step of f.currentTrace.data.steps) { step.before.seenIds = [f.source.id, f.oldBlockId]; step.after.seenIds = [f.source.id, f.oldBlockId]; }
  const validation = validateProject(f.project); expect(validation.ok, JSON.stringify(validation)).toBe(true);
  const result = runMerge(f.project, f.source.id, f.survivor.id);
  const survivor = result.project.entities.find((item): item is Entity<'character'> => item.id === f.survivor.id)!;
  const currentProfile = result.project.entities.find((item): item is Entity<'projection_profile'> => item.id === profile.id)!;
  expect(currentProfile.data.publicIds).toEqual({ [survivor.id]: entityPublicId, [survivor.data.body![0].id]: blockPublicId });
  expect(result.project.entities.find(item => item.id === pinned.id)).toEqual(pinned);
  const checkpoint = result.project.entities.find((item): item is Entity<'checkpoint'> => item.id === f.currentCheckpoint.id)!;
  expect(checkpoint.data.runtimeState.seenIds).toEqual([survivor.id, survivor.data.body![0].id]);
  expect(validateProject(result.project).ok).toBe(true);
});
