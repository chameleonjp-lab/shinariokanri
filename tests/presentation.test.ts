import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId } from '../src/domain/model';
import { initializeRuntimeState } from '../src/domain/conditions';
import { backChapterReading, pinChapterReadingRecord, presentContent, presentNextChapterScene, replayChapterReading, startChapterReading } from '../src/domain/presentation';
import { startTrial } from '../src/domain/runtime';
import { canonicalJson, jsonBytes, sha256 } from '../src/storage/json';
import type { EntityDataMap, EntityKind, ProjectData } from '../src/domain/types';

function fixture() {
  const project = createProject('提示根拠');
  const add = <K extends EntityKind>(kind: K, data: Partial<EntityDataMap[K]> = {}) => {
    const entity = createEntity(project.projectId, kind, kind, data); entity.status = 'confirmed'; project.entities.push(entity); return entity;
  };
  const person = add('character');
  const known = add('assertion', { subjectId: person.id, predicate: '父を探す', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: person.id });
  const grant = add('effect', { operation: 'assert', targetId: known.id, value: { type: 'boolean', value: true } });
  const enabled = add('variable', { key: 'enabled', valueType: 'boolean', initial: { type: 'boolean', value: true } });
  const disable = add('effect', { operation: 'set', targetId: enabled.id, value: { type: 'boolean', value: false } });
  const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '手掛かり。' }, { id: newId(), kind: 'paragraph', text: '回収。' }] });
  const next = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '続き。' }] });
  const chapter = add('chapter', { sceneIds: [scene.id, next.id] }); scene.data.chapterId = chapter.id; next.data.chapterId = chapter.id;
  const question = add('foreshadow', { resolutionPolicy: 'this_work' });
  const clue = add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 2 }, role: 'clue', stage: 'hint', knowledgeEffects: [grant.id, disable.id] });
  const payoff = add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id, blockId: scene.data.body[1].id, start: 0, end: 2 }, role: 'payoff', stage: 'reveal', condition: { op: 'compare', variableId: enabled.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  question.data.requiredInfo = [clue.id];
  return { project, add, person, known, grant, enabled, disable, scene, next, chapter, question, clue, payoff };
}

async function pin(project: ProjectData, session: Awaited<ReturnType<typeof startChapterReading>>) {
  const ids = { checkpointId: newId(), snapshotId: newId() }, record = pinChapterReadingRecord(session, ids);
  project.snapshots.push({ id: ids.snapshotId, versionLabel: '提示の固定版', content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: '2026-10-05T00:00:00Z' });
  return record;
}

describe('shared committed presentation', () => {
  it('matches actual flow arrival, observes all conditions before effects, and grants only explicit knowledge', () => {
    const f = fixture(), entry = f.add('flow_node', { nodeType: 'terminal', sceneId: f.scene.id, terminalReason: '終了', gate: null });
    f.add('flow_graph', { nodeIds: [entry.id], edgeIds: [], entryIds: [entry.id], exitIds: [entry.id] });
    const state = initializeRuntimeState(f.project), presented = presentContent(f.project, state, { nodeId: entry.id });
    expect(presented.ok).toBe(true); if (!presented.ok) return;
    const flow = startTrial(f.project);
    expect(presented.state).toEqual(flow.state); expect(presented.conditions).toEqual(flow.startConditionResults);
    expect(presented.conditions).toContainEqual({ targetId: f.payoff.id, value: 'true', reasons: [] });
    expect(presented.state.variableValues[f.enabled.id]).toEqual({ type: 'boolean', value: false });
    expect(presented.state.assertions).toEqual([{ assertionId: f.known.id, holderId: f.person.id, truth: 'true', sourceEffectId: f.grant.id }]);
    expect(state.assertions).toEqual([]); expect(state.seenIds).toEqual([]);
  });

  it.each(['unknown', 'rejected-effect', 'unresolved', 'ambiguous-order'] as const)('rolls back the entire arrival for %s', mode => {
    const f = fixture(), state = initializeRuntimeState(f.project), before = structuredClone(state);
    if (mode === 'unknown') { f.enabled.data.initial = { type: 'unknown', value: null, reason: '外部確認前' }; state.variableValues[f.enabled.id] = structuredClone(f.enabled.data.initial); }
    if (mode === 'rejected-effect') f.grant.status = 'rejected';
    if (mode === 'unresolved') f.clue.data.anchor.positionStatus = 'unresolved';
    if (mode === 'ambiguous-order') { f.payoff.data.knowledgeEffects = [f.grant.id]; f.payoff.data.anchor = { entityId: f.scene.id }; }
    const input = structuredClone(state), result = presentContent(f.project, state, { sceneId: f.scene.id });
    expect(result.ok).toBe(false); expect(state).toEqual(input); expect(state.seenIds).toEqual(before.seenIds);
  });
});

describe('explicit chapter presentation and immutable replay', () => {
  it('passive start records nothing; repeats are occurrences; back restores all state; save/replay preserves evidence', async () => {
    const f = fixture();
    let session = await startChapterReading(f.project, { sceneIds: [f.scene.id, f.next.id, f.scene.id] });
    expect(session.occurrences).toEqual([]); expect(session.state.seenIds).toEqual([]); expect(session.state.assertions).toEqual([]);
    session = presentNextChapterScene(f.project, session);
    const first = structuredClone(session.state); expect(first.presentationPosition).toBeNull(); expect(session.occurrences).toHaveLength(1);
    session = presentNextChapterScene(f.project, session); session = presentNextChapterScene(f.project, session);
    expect(session.status).toBe('terminal'); expect(session.state.visitCounts[f.scene.id]).toBe(2);
    expect(new Set(session.occurrences.map(occurrence => occurrence.occurrenceId)).size).toBe(3);
    session = backChapterReading(backChapterReading(session)); expect(session.state).toEqual(first);
    const record = await pin(f.project, session);
    expect(record.trace.steps).toEqual([]); expect(record.trace.readingPath?.sceneIds).toEqual([f.scene.id, f.next.id, f.scene.id]);
    expect(record.trace.coverage?.scenes).toEqual({ checked: 1, total: 2 });
    f.scene.data.body[0].text = '後日の改稿'; f.project.revision = '2';
    const canonicalRecord = JSON.parse(canonicalJson(record)) as typeof record;
    const replay = await replayChapterReading(f.project, canonicalRecord.trace, canonicalRecord.checkpoint);
    expect(replay.state).toEqual(record.trace.readingPath?.occurrences[0].after);
    expect(replay.content.entities.find(entity => entity.id === f.scene.id)?.data).toMatchObject({ body: [{ text: '手掛かり。' }, { text: '回収。' }] });
    expect(replay.occurrences[0].conditionResults).toEqual(session.occurrences[0].conditionResults);
  });

  it('does not rewrite a checkpoint from another content version', async () => {
    const f = fixture(), state = initializeRuntimeState(f.project); state.contentVersionId = newId();
    await expect(startChapterReading(f.project, { state })).rejects.toThrow('開始状態と読み通し対象の版が違います');
  });

  it('rejects changed current content and preserves the committed reading input', async () => {
    const f = fixture(), session = await startChapterReading(f.project); f.project.revision = '2';
    const stopped = presentNextChapterScene(f.project, session);
    expect(stopped.status).toBe('error'); expect(stopped.state).toEqual(session.state); expect(stopped.occurrences).toEqual([]);
  });

  it.each(['evidence', 'duplicate', 'order', 'state', 'snapshot-hash'] as const)('rejects imported %s tampering', async mode => {
    const f = fixture(); let session = await startChapterReading(f.project); session = presentNextChapterScene(f.project, session); session = presentNextChapterScene(f.project, session);
    const record = await pin(f.project, session), occurrences = record.trace.readingPath!.occurrences;
    if (mode === 'evidence') occurrences[0].conditionResults.find(result => result.targetId === f.payoff.id)!.value = 'false';
    if (mode === 'duplicate') occurrences[1].occurrenceId = occurrences[0].occurrenceId;
    if (mode === 'order') occurrences.reverse();
    if (mode === 'state') occurrences[0].after.variableValues[f.enabled.id] = { type: 'boolean', value: true };
    if (mode === 'snapshot-hash') f.project.snapshots[0].content.entities[0].name = '改ざん';
    await expect(replayChapterReading(f.project, record.trace, record.checkpoint)).rejects.toThrow();
  });
});
