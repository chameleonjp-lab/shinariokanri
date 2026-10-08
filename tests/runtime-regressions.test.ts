import { describe, expect, it } from 'vitest';
import { applyEffectsAtomic } from '../src/domain/conditions';
import { exportProject } from '../src/domain/exports';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import {
  backTrial, checkTrialForeshadows, pinTrialRecord, replaySavedTrace, replayTrial, startTrial, stepTrial,
  type TrialRequest, type TrialSession,
} from '../src/domain/runtime';
import type { EntityDataMap, EntityKind, ID, Policy } from '../src/domain/types';
import { exportScenario, inspectScenarioData } from '../src/storage/archive';
import { jsonBytes, sha256 } from '../src/storage/json';

function fixture() {
  const project = createProject('RB01 試読の回帰');
  const add = <K extends EntityKind>(kind: K, data: Partial<EntityDataMap[K]> = {}) => {
    const entity = createEntity(project.projectId, kind, kind, kind === 'flow_node' ? { gate: null, ...data } as Partial<EntityDataMap[K]> : data);
    entity.status = 'confirmed';
    project.entities.push(entity);
    return entity;
  };
  const entry = add('flow_node', { nodeType: 'entry' });
  const end = add('flow_node', { nodeType: 'terminal', terminalReason: '作者が意図した終わり' });
  const graph = add('flow_graph', { nodeIds: [entry.id, end.id], edgeIds: [], entryIds: [entry.id], exitIds: [end.id] });
  const node = (data: Partial<EntityDataMap['flow_node']>) => {
    const created = add('flow_node', data);
    graph.data.nodeIds.push(created.id);
    return created;
  };
  const edge = (fromId: ID, toId: ID, data: Partial<EntityDataMap['flow_edge']> = {}) => {
    const created = add('flow_edge', { fromId, toId, ...data });
    graph.data.edgeIds.push(created.id);
    return created;
  };
  return { project, add, entry, end, graph, node, edge };
}

function foreshadowFixture(changesCondition: boolean, initial = false) {
  const base = fixture();
  const { add, entry, end, node, edge } = base;
  const canReveal = add('variable', { key: 'can_reveal', valueType: 'boolean', initial: { type: 'boolean', value: true } });
  const closeReveal = add('effect', { operation: 'set', targetId: canReveal.id, value: { type: 'boolean', value: false } });
  const clueScene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '必須の手掛かり' }] });
  const payoffScene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '秘密の回収' }] });
  const clueNode = node({ nodeType: 'scene', sceneId: clueScene.id });
  const payoffNode = initial ? entry : node({ nodeType: 'scene', sceneId: payoffScene.id });
  if (initial) entry.data.sceneId = payoffScene.id;
  const question = add('foreshadow', { resolutionPolicy: 'this_work' });
  const clue = add('disclosure', { foreshadowId: question.id, anchor: { entityId: clueScene.id }, role: 'clue', stage: 'hint' });
  const payoff = add('disclosure', {
    foreshadowId: question.id, anchor: { entityId: payoffScene.id }, role: 'payoff', stage: 'reveal',
    condition: { op: 'compare', variableId: canReveal.id, comparator: 'eq', value: { type: 'boolean', value: true } },
    knowledgeEffects: changesCondition ? [closeReveal.id] : [],
  });
  question.data.requiredInfo = [clue.id];
  const skip = initial ? undefined : edge(entry.id, payoffNode.id);
  const viaClue = initial ? undefined : edge(entry.id, clueNode.id);
  const continueEdge = initial ? undefined : edge(clueNode.id, payoffNode.id);
  const finish = edge(payoffNode.id, end.id);
  return { ...base, canReveal, closeReveal, clue, payoff, question, payoffNode, clueNode, skip, viaClue, continueEdge, finish };
}

async function savePinned(project: ReturnType<typeof fixture>['project'], session: TrialSession) {
  const ids = { checkpointId: newId(), snapshotId: newId() };
  const data = pinTrialRecord(session, ids);
  const checkpoint = { ...createEntity(project.projectId, 'checkpoint', '開始状態', data.checkpoint), id: ids.checkpointId };
  const trace = createEntity(project.projectId, 'trace', '回帰経路', data.trace);
  project.entities.push(checkpoint, trace);
  const snapshot = { id: ids.snapshotId, versionLabel: 'RB01 固定版', content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: '2026-10-05T00:00:00Z' };
  project.snapshots.push(snapshot);
  return { ids, checkpoint, trace, snapshot };
}

describe('RG-R02: foreshadow findings retain presentation-time evidence', () => {
  it.each([false, true])('keeps missing clue and witness path when the payoff changes its condition: %s', changesCondition => {
    const { project, entry, payoffNode, skip, payoff, clue, question, canReveal } = foreshadowFixture(changesCondition);
    const read = stepTrial(project, startTrial(project), { edgeId: skip!.id });
    expect(read.state.seenIds).toContain(payoff.id);
    expect(read.state.variableValues[canReveal.id]).toEqual({ type: 'boolean', value: !changesCondition });
    expect(read.trace[0].conditionResults).toContainEqual({ targetId: payoff.id, value: 'true', reasons: [] });
    expect(checkTrialForeshadows(project, read)).toEqual([expect.objectContaining({
      status: 'candidate', code: 'REQUIRED_INFO_MISSING', targetId: question.id, payoffId: payoff.id,
      missingInfoIds: [clue.id], path: [entry.id, payoffNode.id], edgePath: [[skip!.id]],
    })]);
  });

  it('keeps a clue presented before its own condition becomes false', () => {
    const f = foreshadowFixture(true);
    f.clue.data.condition = structuredClone(f.payoff.data.condition);
    f.clue.data.knowledgeEffects = [f.closeReveal.id];
    f.payoff.data.condition = { op: 'constant', value: true };
    const informed = stepTrial(f.project, stepTrial(f.project, startTrial(f.project), { edgeId: f.viaClue!.id }), { edgeId: f.continueEdge!.id });
    expect(informed.state.variableValues[f.canReveal.id]).toEqual({ type: 'boolean', value: false });
    expect(informed.state.seenIds).toContain(f.clue.id);
    expect(checkTrialForeshadows(f.project, informed)).toEqual([]);
  });

  it('never treats a skipped disclosure as presented when a later value enables it', () => {
    const f = foreshadowFixture(false);
    f.canReveal.data.initial = { type: 'boolean', value: false };
    f.closeReveal.data.value = { type: 'boolean', value: true };
    f.add('disclosure', { foreshadowId: f.question.id, anchor: f.payoff.data.anchor, role: 'clue', stage: 'hint', knowledgeEffects: [f.closeReveal.id] });
    const read = stepTrial(f.project, startTrial(f.project), { edgeId: f.skip!.id });
    expect(read.state.variableValues[f.canReveal.id]).toEqual({ type: 'boolean', value: true });
    expect(read.state.seenIds).not.toContain(f.payoff.id);
    expect(checkTrialForeshadows(f.project, read)).toEqual([]);
  });

  it('uses the same arrival snapshot for an ordered clue and payoff before knowledge effects', () => {
    const f = foreshadowFixture(true);
    const scene = f.project.entities.find(entity => entity.kind === 'scene' && entity.id === f.payoff.data.anchor.entityId);
    if (scene?.kind !== 'scene') throw new Error('回収の場面がありません。');
    f.clue.data.anchor = { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 2 };
    f.payoff.data.anchor = { entityId: scene.id, blockId: scene.data.body[0].id, start: 3, end: 5 };
    f.clue.data.condition = structuredClone(f.payoff.data.condition);
    f.clue.data.knowledgeEffects = [f.closeReveal.id];
    f.payoff.data.condition = { op: 'constant', value: true };
    f.payoff.data.knowledgeEffects = [];
    const read = stepTrial(f.project, startTrial(f.project), { edgeId: f.skip!.id });
    expect(read.state.variableValues[f.canReveal.id]).toEqual({ type: 'boolean', value: false });
    expect(read.trace[0].conditionResults).toContainEqual({ targetId: f.clue.id, value: 'true', reasons: [] });
    expect(checkTrialForeshadows(f.project, read)).toEqual([]);
  });

  it.each([false, true])('retains initial presentation evidence through Back, replay and archive: %s', async initial => {
    const f = foreshadowFixture(true, initial);
    const started = startTrial(f.project);
    const presented = initial ? started : stepTrial(f.project, started, { edgeId: f.skip!.id });
    const expectedPath = initial ? [f.entry.id] : [f.entry.id, f.payoffNode.id];
    expect(checkTrialForeshadows(f.project, presented)[0]).toMatchObject({ status: 'candidate', path: expectedPath, missingInfoIds: [f.clue.id] });
    if (initial) expect(presented.startConditionResults).toContainEqual({ targetId: f.payoff.id, value: 'true', reasons: [] });
    const finished = stepTrial(f.project, presented, { edgeId: f.finish.id });
    const undone = backTrial(finished);
    expect(undone.state).toEqual(presented.state);
    expect(checkTrialForeshadows(f.project, undone)[0]).toMatchObject({ status: 'candidate', path: expectedPath });
    expect(checkTrialForeshadows(f.project, replayTrial(f.project, finished))[0]).toMatchObject({ status: 'candidate', path: expectedPath });
    const { ids, checkpoint, trace } = await savePinned(f.project, finished);
    expect(checkpoint.data.presentationResults ?? []).toEqual(started.startConditionResults);
    expect(trace.data.steps.some(step => step.conditionResults?.some(result => result.targetId === f.payoff.id && result.value === 'true'))).toBe(!initial);
    expect(validateProject(f.project).ok).toBe(true);
    const restored = (await inspectScenarioData(await exportScenario(f.project))).project;
    const replayed = replaySavedTrace(restored, trace.id);
    expect(replayed.status).toBe('terminal');
    expect(replayed.state).toEqual({ ...finished.state, contentVersionId: ids.snapshotId });
    expect(checkTrialForeshadows(restored, replayed)[0]).toMatchObject({ status: 'candidate', path: expectedPath, missingInfoIds: [f.clue.id] });
    // Existing 1.0.0 records omit the new optional fields; their recorded seen IDs
    // still prove presentation and must not be replaced by post-effect conditions.
    for (const entity of restored.entities) {
      if (entity.kind === 'checkpoint') delete entity.data.presentationResults;
      if (entity.kind === 'trace') for (const step of entity.data.steps) delete step.conditionResults;
    }
    expect(validateProject(restored).ok).toBe(true);
    const legacyReplay = replaySavedTrace(restored, trace.id);
    expect(legacyReplay.status).toBe('terminal');
    expect(checkTrialForeshadows(restored, legacyReplay)[0]).toMatchObject({ status: 'candidate', path: expectedPath, missingInfoIds: [f.clue.id] });
  });

  it('rejects saved presentation conditions that disagree with replay', async () => {
    const f = foreshadowFixture(true);
    const read = stepTrial(f.project, startTrial(f.project), { edgeId: f.skip!.id });
    const { trace } = await savePinned(f.project, read);
    trace.data.steps[0].conditionResults!.find(result => result.targetId === f.payoff.id)!.value = 'false';
    const replay = replaySavedTrace(f.project, trace.id);
    expect(replay.status).toBe('error');
    expect(replay.issues[0]).toMatchObject({ code: 'VALIDATION_FAILED', path: `${trace.id}.steps[0].conditionResults` });
  });

  it.each(['false', 'duplicate', 'missing', 'unknown'] as const)('rejects %s initial checkpoint evidence instead of suppressing the payoff finding', async mutation => {
    const f = foreshadowFixture(true, true);
    const started = startTrial(f.project);
    const finished = stepTrial(f.project, started, { edgeId: f.finish.id });
    const { checkpoint, trace } = await savePinned(f.project, finished);
    const before = structuredClone(checkpoint.data.runtimeState);
    if (mutation === 'false') checkpoint.data.presentationResults![0].value = 'false';
    if (mutation === 'unknown') checkpoint.data.presentationResults![0].value = 'unknown';
    if (mutation === 'duplicate') checkpoint.data.presentationResults!.push(structuredClone(checkpoint.data.presentationResults![0]));
    if (mutation === 'missing') checkpoint.data.presentationResults = [];
    expect(checkpoint.data.runtimeState).toEqual(before);
    const validation = validateProject(f.project);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.issues.some(issue => issue.path.includes('presentationResults'))).toBe(true);
    const replay = replaySavedTrace(f.project, trace.id);
    expect(replay.status).toBe('error');
    expect(replay.trace).toEqual([]);
    expect(replay.issues[0].path).toContain('presentationResults');
    const altered = { ...started, startConditionResults: [{ targetId: f.payoff.id, value: 'false' as const, reasons: [] }] };
    expect(checkTrialForeshadows(f.project, altered)[0]).toMatchObject({ status: 'candidate', payoffId: f.payoff.id, missingInfoIds: [f.clue.id] });
  });
});

function rejectedEffectFixture(policy: Policy, mixed: boolean) {
  const f = fixture();
  f.entry.data.executionPolicy = policy;
  f.entry.data.trigger = { event: 'manual', eventKey: 'choose', repeat: 'once' };
  const key = f.add('variable', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: false } });
  const item = f.add('item', { itemMode: 'type' });
  const holder = f.add('character');
  const fact = f.add('assertion', { subjectId: holder.id, holderId: holder.id, predicate: '秘密', value: { type: 'boolean', value: true }, truthKind: 'belief' });
  const seen = f.add('note');
  const valid = [
    f.add('effect', { operation: 'set', targetId: key.id, value: { type: 'boolean', value: true } }),
    f.add('effect', { operation: 'grant', targetId: item.id, value: { type: 'integer', value: 1 } }),
    f.add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } }),
    f.add('effect', { operation: 'mark_seen', targetId: seen.id }),
  ];
  const rejected = f.add('effect', { operation: 'set', targetId: key.id, value: { type: 'boolean', value: true } });
  rejected.status = 'rejected';
  const selected = f.edge(f.entry.id, f.end.id, { effectIds: policy === 'all_match' && mixed ? valid.map(effect => effect.id) : [...(mixed ? valid.map(effect => effect.id) : []), rejected.id], priority: 1 });
  if (policy === 'all_match' && mixed) f.edge(f.entry.id, f.end.id, { effectIds: [rejected.id], priority: 2 });
  const request: TrialRequest = { random: policy === 'manual_choice', edgeId: selected.id, event: { event: 'manual', eventKey: 'choose', occurrenceId: 'choose-1' } };
  return { ...f, key, valid, rejected, selected, request };
}

describe('RG-R03: rejected effects refuse the entire operation', () => {
  it.each((['manual_choice', 'first_match', 'all_match'] as const).flatMap(policy => [false, true].map(mixed => ({ policy, mixed }))))('does not partly apply $policy mixed=$mixed', ({ policy, mixed }) => {
    const f = rejectedEffectFixture(policy, mixed);
    expect(validateProject(f.project).ok).toBe(true);
    const before = startTrial(f.project);
    expect(before.status).toBe('ready');
    const stopped = stepTrial(f.project, before, f.request);
    expect(stopped.status).toBe('error');
    expect(stopped.issues[0]).toMatchObject({ code: 'REFERENCE_INVALID' });
    expect(stopped.issues[0].message).toContain('不採用');
    expect(stopped.state).toBe(before.state);
    expect(stopped.nodeId).toBe(before.nodeId);
    expect(stopped.history).toBe(before.history);
    expect(stopped.trace).toBe(before.trace);
    expect(stopped.lastDiff).toEqual([]);
    expect(stopped.state.variableValues[f.key.id]).toEqual({ type: 'boolean', value: false });
    expect(stopped.state.itemInstances).toEqual([]);
    expect(stopped.state.assertions).toEqual([]);
    expect(stopped.state.onceTriggers).toEqual([]);
    expect(stopped.state.rngPosition).toBe(0);
    expect(backTrial(stopped).state).toBe(before.state);
  });

  it('enforces adoption in the shared effect engine, even when the rejected effect condition is false', () => {
    const f = rejectedEffectFixture('manual_choice', true);
    f.rejected.data.condition = { op: 'constant', value: false };
    const before = startTrial(f.project);
    const applied = applyEffectsAtomic(before.state, [...f.valid, f.rejected], { state: before.state, entities: f.project.entities });
    expect(applied.ok).toBe(false);
    expect(applied.state).toBe(before.state);
    if (applied.ok) throw new Error('不採用の効果を実行しました。');
    expect(applied.issues[0].message).toContain('不採用');
  });

  it.each(['clone', 'reference', 'override'] as const)('refuses rejected references at a %s reused arrival', mode => {
    const f = rejectedEffectFixture('manual_choice', true);
    f.end.data.reuse = { mode, sourceId: f.entry.id, pinnedSnapshotId: f.project.projectId, overrideFields: [] };
    const before = startTrial(f.project);
    const stopped = stepTrial(f.project, before, f.request);
    expect(stopped.status).toBe('error');
    expect(stopped.state).toBe(before.state);
    expect(stopped.history).toBe(before.history);
    expect(stopped.trace).toBe(before.trace);
    if (mode === 'clone') expect(stopped.issues[0].message).toContain('不採用');
    else { expect(before.status).toBe('error'); expect(before.issues[0].message).toContain('固定版'); expect(stopped.issues[0].code).toBe('REFERENCE_INVALID'); }
  });

  it('rolls back edge effects and disclosure effects together', () => {
    const f = rejectedEffectFixture('manual_choice', true);
    f.selected.data.effectIds = f.valid.map(effect => effect.id);
    const scene = f.add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '知識の開示' }] });
    f.end.data.sceneId = scene.id;
    const question = f.add('foreshadow', { resolutionPolicy: 'this_work' });
    f.add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id }, role: 'clue', stage: 'hint', knowledgeEffects: [f.valid[2].id, f.rejected.id] });
    const before = startTrial(f.project);
    const stopped = stepTrial(f.project, before, f.request);
    expect(stopped.status).toBe('error');
    expect(stopped.issues[0].message).toContain('不採用');
    expect(stopped.state).toBe(before.state);
    expect(stopped.trace).toBe(before.trace);
    expect(stopped.history).toBe(before.history);
    expect(stopped.state.seenIds).not.toContain(scene.id);
  });

  it('refuses a rejected effect in a saved trace with no partial replayed state', async () => {
    const f = rejectedEffectFixture('manual_choice', true);
    f.rejected.status = 'confirmed';
    const before = startTrial(f.project);
    const finished = stepTrial(f.project, before, f.request);
    expect(finished.status).toBe('terminal');
    const { checkpoint, trace, snapshot } = await savePinned(f.project, finished);
    snapshot.content.entities.find(entity => entity.id === f.rejected.id)!.status = 'rejected';
    snapshot.contentHash = await sha256(jsonBytes(snapshot.content));
    const stopped = replaySavedTrace(f.project, trace.id);
    expect(stopped.status).toBe('error');
    expect(stopped.issues[0].message).toContain('不採用');
    expect(stopped.state).toEqual(checkpoint.data.runtimeState);
    expect(stopped.trace).toEqual([]);
    expect(stopped.history).toEqual([]);
  });

  it.each(['runtime_json', 'playable_preview'] as const)('explains rejected dependencies instead of exporting them in %s', async profile => {
    const f = rejectedEffectFixture('manual_choice', false);
    f.entry.data.trigger = null;
    const included = [f.entry, f.end, f.graph, f.key, f.selected, f.rejected];
    const projection = f.add('projection_profile', {
      audience: 'reader', includedIds: included.map(entity => entity.id), allowedKinds: [...new Set(included.map(entity => entity.kind))],
      idPolicy: 'preserve', publicTitle: '回帰検査', publicVersionLabel: '公開候補',
      namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(included.map((entity, index) => [entity.id, { mode: 'replace' as const, replacement: `公開情報${index}` }])) },
      publicTexts: { [f.key.id]: { key: 'key' }, [f.end.id]: { terminalReason: '終了' }, [f.selected.id]: { label: '進む' } },
    });
    const exported = await exportProject(f.project, { profile, projectionProfileId: projection.id, targetRevision: f.project.revision });
    expect(exported.ok).toBe(false);
    expect('artifact' in exported).toBe(false);
    if (exported.ok) throw new Error('不採用の効果を出力しました。');
    expect(exported.issues.some(issue => issue.entityId === f.selected.id && issue.message.length > 0)).toBe(true);
  });
});
