import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyRuntimeState, newId } from '../src/domain/model';
import type { EntityDataMap, EntityKind, ID, ProjectData, RuntimeState } from '../src/domain/types';
import { canonicalJson, jsonBytes, sha256 } from '../src/storage/json';
import { exportScenario, inspectScenarioData } from '../src/storage/archive';
import { ScenarioStore } from '../src/storage/store';
import {
  analyzeFlow, analyzeFlowAsync, backTrial, checkTrialForeshadows, diffRuntimeStates, getTrialChoices, getTrialContent,
  pinTrialRecord, replaySavedTrace, replayTrial, restartTrial, setTrialStubValues, startTrial, stepTrial, trialCoverage, trialCoverageByProvenance, trialRecordData,
} from '../src/domain/runtime';

function fixture() {
  const project = createProject('試読契約');
  const add = <K extends EntityKind>(kind: K, data: Partial<EntityDataMap[K]>, name = kind) => {
    const payload = kind === 'variable' && (data as Partial<EntityDataMap['variable']>).valueType === 'integer'
      ? { allowed: { min: -2147483647, max: 2147483647 }, ...data } : kind === 'flow_node' ? { gate: null, ...data } : data;
    const entity = createEntity(project.projectId, kind, name, payload as Partial<EntityDataMap[K]>);
    project.entities.push(entity);
    return entity;
  };
  const entry = add('flow_node', { nodeType: 'entry' });
  const end = add('flow_node', { nodeType: 'terminal', terminalReason: '作者が意図した終わり' });
  const graph = add('flow_graph', { nodeIds: [entry.id, end.id], edgeIds: [], entryIds: [entry.id], exitIds: [] });
  const edge = (from: ID, to: ID, data: Partial<EntityDataMap['flow_edge']> = {}) => {
    const created = add('flow_edge', { fromId: from, toId: to, edgeType: 'choice', ...data });
    graph.data.edgeIds.push(created.id);
    return created;
  };
  const node = (data: Partial<EntityDataMap['flow_node']>) => {
    const created = add('flow_node', data);
    graph.data.nodeIds.push(created.id);
    return created;
  };
  return { project, add, entry, end, graph, edge, node };
}

describe('pure reading runtime', () => {
  it('keeps different path state at a merge, including items and character knowledge', () => {
    const { project, add, entry, end, edge, node } = fixture();
    const key = add('variable', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: false } });
    const item = add('item', { itemMode: 'type' });
    const holder = add('character', {});
    const fact = add('assertion', { subjectId: holder.id, predicate: '鍵を知る', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: holder.id });
    const effects = [
      add('effect', { operation: 'set', targetId: key.id, value: { type: 'boolean', value: true } }),
      add('effect', { operation: 'grant', targetId: item.id, value: { type: 'integer', value: 1 } }),
      add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } }),
    ];
    const merge = node({ nodeType: 'choice' });
    const withKey = edge(entry.id, merge.id, { effectIds: effects.map(effect => effect.id) });
    const withoutKey = edge(entry.id, merge.id);
    edge(merge.id, end.id);
    const authorData = structuredClone(project);
    const initial = startTrial(project);
    const first = stepTrial(project, initial, { edgeId: withKey.id });
    const second = stepTrial(project, backTrial(first), { edgeId: withoutKey.id });
    expect(first.nodeId).toBe(second.nodeId);
    expect(first.state.variableValues[key.id]).toEqual({ type: 'boolean', value: true });
    expect(second.state.variableValues[key.id]).toEqual({ type: 'boolean', value: false });
    expect(first.state.itemInstances).toHaveLength(1);
    expect(second.state.itemInstances).toEqual([]);
    expect(first.state.assertions.some(assertion => assertion.assertionId === fact.id && assertion.holderId === holder.id)).toBe(true);
    expect(second.state.assertions).toEqual([]);
    expect(project).toEqual(authorData);
  });

  it('rejects an effect group atomically, restoring random position and all ancillary state', () => {
    const { project, add, entry, end, edge } = fixture();
    const count = add('variable', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 3 } });
    const first = add('effect', { operation: 'add', targetId: count.id, value: { type: 'integer', value: 1 } });
    const bad = add('effect', { operation: 'add', targetId: count.id, value: { type: 'integer', value: 10 } });
    edge(entry.id, end.id, { effectIds: [first.id, bad.id] });
    const before = startTrial(project, { seed: 'rollback' });
    const failed = stepTrial(project, before, { random: true });
    expect(failed.status).toBe('error');
    expect(failed.state).toBe(before.state);
    expect(failed.history).toEqual([]);
    expect(failed.trace).toEqual([]);
    expect(failed.state.rngPosition).toBe(0);
  });

  it('restores every RuntimeState field on Back and reproduces a draw', () => {
    const { project, entry, end, edge } = fixture();
    edge(entry.id, end.id);
    edge(entry.id, end.id);
    entry.data.trigger = { event: 'manual', eventKey: 'draw', repeat: 'once', id: newId() };
    const state = emptyRuntimeState(project.projectId);
    Object.assign(state, {
      presentationPosition: entry.id, variableValues: { [newId()]: { type: 'unknown', value: null, reason: '未入力' } },
      itemInstances: [{ instanceId: newId(), typeId: newId(), quantity: 1, ownerId: null, locationId: null, consumed: false }],
      assertions: [{ assertionId: newId(), holderId: newId(), truth: 'true' }], seenIds: [newId()],
      visitCounts: { [entry.id]: 7 }, onceTriggers: ['old'], rngSeed: 'draw-seed', rngPosition: 11,
      callStack: [{ graphId: newId(), returnNodeId: end.id, parameters: {} }], loopNumber: 3,
    } satisfies Partial<RuntimeState>);
    const before = startTrial(project, { state });
    const request = { random: true, event: { triggerId: entry.data.trigger.id, event: 'manual' as const, eventKey: 'draw', occurrenceId: 'sample' } };
    const after = stepTrial(project, before, request);
    expect(after.state.rngPosition).toBe(12);
    expect(after.state.onceTriggers).toHaveLength(3);
    const restored = backTrial(after);
    expect(restored.state).toEqual(before.state);
    expect(stepTrial(project, restored, request).state).toEqual(after.state);
  });

  it('evaluates all_match candidates on one pre-effect snapshot and runs ordered effects', () => {
    const { project, add, entry, end, edge } = fixture();
    entry.data.executionPolicy = 'all_match';
    const value = add('variable', { key: 'n', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } });
    const plus1 = add('effect', { operation: 'add', targetId: value.id, value: { type: 'integer', value: 1 } });
    const plus2 = add('effect', { operation: 'add', targetId: value.id, value: { type: 'integer', value: 2 } });
    const first = edge(entry.id, end.id, { priority: 1, effectIds: [plus1.id] });
    const second = edge(entry.id, end.id, { priority: 2, effectIds: [plus2.id], condition: { op: 'compare', variableId: value.id, comparator: 'eq', value: { type: 'integer', value: 0 } } });
    const after = stepTrial(project, startTrial(project));
    expect(after.state.variableValues[value.id]).toEqual({ type: 'integer', value: 3 });
    expect(after.trace[0].edgeIds).toEqual([first.id, second.id]);
  });

  it('stops automatic policies when an unknown candidate remains and refuses priority ties', () => {
    const { project, entry, end, edge, add } = fixture();
    entry.data.executionPolicy = 'first_match';
    const missing = add('variable', { key: 'missing', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未定' } });
    edge(entry.id, end.id, { priority: 1 });
    const pending = edge(entry.id, end.id, { priority: 2, condition: { op: 'compare', variableId: missing.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    entry.data.fallbackId = end.id;
    const stopped = startTrial(project);
    expect(stopped.status).toBe('unknown');
    expect(stepTrial(project, stopped).state).toBe(stopped.state);
    pending.data.priority = 1;
    expect(startTrial(project).status).toBe('error');
  });

  it('shows a manual unknown choice while allowing a separate true choice', () => {
    const { project, entry, end, edge, add } = fixture();
    const missing = add('variable', { key: 'missing', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未入力' } });
    const unknown = edge(entry.id, end.id, { condition: { op: 'compare', variableId: missing.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const enabled = edge(entry.id, end.id);
    const start = startTrial(project);
    expect(getTrialChoices(project, start).find(choice => choice.edgeId === unknown.id)?.result).toBe('unknown');
    expect(stepTrial(project, start, { edgeId: unknown.id }).status).toBe('unknown');
    expect(stepTrial(project, start, { edgeId: enabled.id }).status).toBe('terminal');
  });

  it('keeps an intentional terminal separate from a dead end and supports explicit fallback', () => {
    const { project, entry, end, edge, node } = fixture();
    const dead = node({ nodeType: 'scene' });
    const selected = edge(entry.id, dead.id);
    const deadSession = stepTrial(project, startTrial(project), { edgeId: selected.id });
    expect(deadSession.status).toBe('blocked');
    dead.data.fallbackId = end.id;
    const withFallback = stepTrial(project, startTrial(project), { edgeId: selected.id });
    expect(stepTrial(project, withFallback).status).toBe('terminal');
    expect(analyzeFlow(project).findings.some(finding => finding.status === 'intentional' && finding.targetId === end.id)).toBe(true);
  });

  it('requires an explicit trigger, ignores its duplicate occurrence, and keeps independent triggers distinct', () => {
    const { project, add, entry, end, edge, node } = fixture();
    const n = add('variable', { key: 'n', valueType: 'integer', initial: { type: 'integer', value: 0 } });
    const effect = add('effect', { operation: 'add', targetId: n.id, value: { type: 'integer', value: 1 } });
    const second = node({ nodeType: 'automatic', executionPolicy: 'first_match', trigger: { event: 'enter', eventKey: 'room', repeat: 'repeatable', id: newId() } });
    entry.data.trigger = { event: 'enter', eventKey: 'room', repeat: 'once', id: newId() };
    const firstEdge = edge(entry.id, second.id, { effectIds: [effect.id] });
    edge(second.id, end.id, { effectIds: [effect.id], priority: 0 });
    const before = startTrial(project);
    expect(stepTrial(project, before, { edgeId: firstEdge.id }).state).toBe(before.state);
    const event = { triggerId: entry.data.trigger.id, event: 'enter' as const, eventKey: 'room', occurrenceId: 'one-event' };
    const after = stepTrial(project, before, { edgeId: firstEdge.id, event });
    expect(stepTrial(project, after, { edgeId: firstEdge.id, event })).toBe(after);
    const final = stepTrial(project, after, { event: { ...event, triggerId: second.data.trigger!.id } });
    expect(final.state.variableValues[n.id]).toEqual({ type: 'integer', value: 2 });
  });

  it('refuses missing deadline context instead of assuming wall-clock world time', () => {
    const { project, entry, end, edge } = fixture();
    entry.data.trigger = { event: 'manual', eventKey: 'deadline', repeat: 'once', deadline: { mode: 'instant', at: '10', calendarId: project.calendarId } };
    const selected = edge(entry.id, end.id);
    const event = { event: 'manual' as const, eventKey: 'deadline', occurrenceId: '1' };
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event }).status).toBe('unknown');
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event, worldTick: '11' }).status).toBe('blocked');
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event, worldTick: '9' }).status).toBe('terminal');
  });

  it('resolves relative deadlines and keeps an ambiguous deadline range unknown', () => {
    const { project, add, entry, end, edge } = fixture();
    const event = add('event', { time: { mode: 'instant', at: '10', calendarId: project.calendarId } });
    entry.data.trigger = { event: 'manual', eventKey: 'deadline', repeat: 'once', deadline: { mode: 'relative', anchorEventId: event.id, anchorPoint: 'start', minOffset: '2', maxOffset: '4' } };
    const selected = edge(entry.id, end.id);
    const occurrence = { event: 'manual' as const, eventKey: 'deadline', occurrenceId: '1' };
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event: occurrence, worldTick: '11' }).status).toBe('terminal');
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event: occurrence, worldTick: '13' }).status).toBe('unknown');
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id, event: occurrence, worldTick: '15' }).status).toBe('blocked');
  });

  it('does not fill a partial checkpoint and blocks a different-version checkpoint', () => {
    const { project, add, entry, end, edge } = fixture();
    const key = add('variable', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: true } });
    edge(entry.id, end.id, { condition: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const state = emptyRuntimeState(project.projectId);
    state.presentationPosition = entry.id;
    state.visitCounts[entry.id] = 5;
    const checkpoint = add('checkpoint', { contentVersionId: project.projectId, runtimeState: state, origin: 'partial' });
    const partial = startTrial(project, { checkpointId: checkpoint.id });
    expect(partial.state.variableValues[key.id]).toBeUndefined();
    expect(partial.state.visitCounts[entry.id]).toBe(5);
    expect(partial.state.provenance).toBe('partial');
    expect(partial.status).toBe('unknown');
    checkpoint.data.contentVersionId = newId();
    expect(startTrial(project, { checkpointId: checkpoint.id }).status).toBe('error');
  });

  it('resolves an immutable snapshot and rejects stale draft trace replay', () => {
    const { project, entry, end, edge } = fixture();
    const selected = edge(entry.id, end.id);
    const snapshotId = newId();
    const { history: _, snapshots: __, ...content } = structuredClone(project);
    project.snapshots.push({ id: snapshotId, versionLabel: '公開1', contentHash: '0'.repeat(64), createdAt: '2026-10-05T00:00:00Z', content });
    const frozen = startTrial(project, { contentVersionId: snapshotId });
    const draft = stepTrial(project, startTrial(project), { edgeId: selected.id });
    project.revision = '1';
    end.data.terminalReason = '変更した終端';
    expect(getTrialContent(project, frozen).revision).toBe('0');
    expect(stepTrial(project, frozen, { edgeId: selected.id }).status).toBe('terminal');
    expect(replayTrial(project, draft).status).toBe('error');
  });

  it('enters and returns from a child graph, and Back restores the call stack', () => {
    const { project, add, entry, end, edge } = fixture();
    const childEntry = add('flow_node', { nodeType: 'entry' });
    const childExit = add('flow_node', { nodeType: 'exit' });
    const childEdge = add('flow_edge', { fromId: childEntry.id, toId: childExit.id, edgeType: 'automatic' });
    const child = add('flow_graph', { nodeIds: [childEntry.id, childExit.id], edgeIds: [childEdge.id], entryIds: [childEntry.id], exitIds: [childExit.id], parentGraphId: project.entities.find(entity => entity.kind === 'flow_graph')!.id });
    entry.data.nodeType = 'call';
    entry.data.childGraphId = child.id;
    edge(entry.id, end.id, { edgeType: 'call_return' });
    const entered = stepTrial(project, startTrial(project));
    expect(entered.nodeId).toBe(childEntry.id);
    expect(entered.state.callStack).toHaveLength(1);
    const exited = stepTrial(project, entered, { edgeId: childEdge.id });
    const returned = stepTrial(project, exited);
    expect(returned.nodeId).toBe(end.id);
    expect(returned.state.callStack).toEqual([]);
    expect(backTrial(returned).state.callStack).toEqual(exited.state.callStack);
  });

  it('treats author assumptions as stub evidence and restores external inputs on Back', () => {
    const { project, add, entry, end, edge } = fixture();
    const contract = add('external_contract', { key: 'battle', owner: 'game', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'unknown' });
    const selected = edge(entry.id, end.id, { condition: { op: 'external', contractId: contract.id } });
    const initial = startTrial(project);
    expect(initial.status).toBe('unknown');
    const assumed = setTrialStubValues(project, initial, { external: { [contract.id]: { type: 'boolean', value: true } } });
    expect(assumed.state.provenance).toBe('stub');
    expect(stepTrial(project, assumed, { edgeId: selected.id }).status).toBe('terminal');
    expect(backTrial(assumed).state).toEqual(initial.state);
    expect(backTrial(assumed).externalValues).toEqual({});
  });

  it('separates new-run carryover from full reset and stores separate coverage denominators', () => {
    const { project, add, entry, end, edge } = fixture();
    const money = add('variable', { key: 'money', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 0 } });
    const memory = add('variable', { key: 'memory', valueType: 'boolean', scope: 'across_runs', initial: { type: 'boolean', value: false } });
    const effects = [add('effect', { operation: 'set', targetId: money.id, value: { type: 'integer', value: 9 } }), add('effect', { operation: 'set', targetId: memory.id, value: { type: 'boolean', value: true } })];
    const selected = edge(entry.id, end.id, { effectIds: effects.map(effect => effect.id), condition: { op: 'constant', value: true } });
    edge(entry.id, end.id, { condition: { op: 'constant', value: false } });
    const finished = stepTrial(project, startTrial(project), { edgeId: selected.id });
    const next = restartTrial(project, finished, 'next_run');
    const all = restartTrial(project, finished, 'all');
    expect(next.state.variableValues[money.id]).toEqual({ type: 'integer', value: 0 });
    expect(next.state.variableValues[memory.id]).toEqual({ type: 'boolean', value: true });
    expect(next.state.loopNumber).toBe(1);
    expect(all.state.variableValues[memory.id]).toEqual({ type: 'boolean', value: false });
    const coverage = trialCoverage(project, finished);
    expect(coverage.choices).toMatchObject({ reached: 1, total: 2 });
    expect(coverage.conditions).toMatchObject({ reached: 2, total: 4 });
    const record = trialRecordData(project, finished, newId());
    expect(record.trace.coverage?.conditionTrue).toMatchObject({ checked: 1, total: 2 });
    expect(record.trace.coverage?.conditionFalse).toMatchObject({ checked: 1, total: 2 });
    expect(replayTrial(project, finished).state).toEqual(finished.state);
  });

  it('replays a saved trace with recorded external stubs and a deadline trigger', () => {
    const { project, add, entry, end, edge } = fixture();
    const contract = add('external_contract', { key: 'battle', outputType: 'boolean' });
    entry.data.trigger = { event: 'battle_result', eventKey: 'win', repeat: 'once', deadline: { mode: 'instant', at: '10', calendarId: project.calendarId } };
    const selected = edge(entry.id, end.id, { condition: { op: 'external', contractId: contract.id } });
    const assumed = setTrialStubValues(project, startTrial(project), { external: { [contract.id]: { type: 'boolean', value: true } } });
    const finished = stepTrial(project, assumed, { edgeId: selected.id, worldTick: '9', event: { triggerId: entry.id, event: 'battle_result', eventKey: 'win', occurrenceId: 'fight-1' } });
    const checkpointId = newId();
    const data = trialRecordData(project, finished, checkpointId);
    const checkpoint = add('checkpoint', data.checkpoint);
    checkpoint.id = checkpointId;
    const trace = add('trace', data.trace);
    expect(data.trace.steps.at(-1)?.worldTick).toBe('9');
    expect(replaySavedTrace(project, trace.id).state).toEqual(finished.state);
    project.revision = '1';
    expect(replaySavedTrace(project, trace.id).status).toBe('error');
  });

  it('holds draft presentation and coverage to the starting content after author edits', () => {
    const { project, add, entry, end, edge } = fixture();
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '開始した版の本文' }] });
    entry.data.sceneId = scene.id;
    edge(entry.id, end.id);
    const session = startTrial(project);
    const denominator = trialCoverage(project, session).choices.total;
    scene.data.body[0].text = '後から編集した本文';
    edge(entry.id, end.id);
    project.revision = '1';
    const frozenScene = getTrialContent(project, session).entities.find(entity => entity.id === scene.id);
    expect(frozenScene?.kind === 'scene' && frozenScene.data.body[0].text).toBe('開始した版の本文');
    expect(trialCoverage(project, session).choices.total).toBe(denominator);
    expect(stepTrial(project, session).status).toBe('error');
  });

  it('pins saved evidence to an immutable content version so recording can advance the draft revision', async () => {
    const { project, add, entry, end, edge } = fixture();
    const selected = edge(entry.id, end.id);
    const finished = stepTrial(project, startTrial(project), { edgeId: selected.id });
    const ids = { checkpointId: newId(), snapshotId: newId() };
    const pinned = pinTrialRecord(finished, ids);
    project.snapshots.push({ id: ids.snapshotId, versionLabel: '試読記録の開始版', contentHash: await sha256(jsonBytes(pinned.content)), content: pinned.content, createdAt: '2026-10-05T00:00:00Z' });
    const checkpoint = add('checkpoint', pinned.checkpoint);
    checkpoint.id = ids.checkpointId;
    const trace = add('trace', pinned.trace);
    project.revision = '1';
    const replay = replaySavedTrace(project, trace.id);
    expect(replay.status).toBe('terminal');
    expect(replay.state).toEqual({ ...finished.state, contentVersionId: ids.snapshotId });
    end.data.terminalReason = '編集後の終了理由';
    project.revision = '2';
    expect(replaySavedTrace(project, trace.id).state).toEqual(replay.state);
  });

  it('replays pinned evidence after saving and a full ZIP round trip regardless of object key order', async () => {
    const source = fixture();
    // Entering the smaller ID appends its visit after the larger entry ID. ZIP sorts object keys.
    source.entry.id = '00000000-0000-4000-8000-000000000002';
    source.end.id = '00000000-0000-4000-8000-000000000001';
    source.graph.data.nodeIds = [source.entry.id, source.end.id];
    source.graph.data.entryIds = [source.entry.id];
    const scene = source.add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '記録した版の本文' }] });
    source.end.data.sceneId = scene.id;
    const selected = source.edge(source.entry.id, source.end.id);
    const store = new ScenarioStore({ databaseName: `runtime-roundtrip-${newId()}` });
    try {
      let project = (await store.saveProject(source.project, { reason: '開始版' })).project;
      const finished = stepTrial(project, startTrial(project), { edgeId: selected.id });
      expect(finished.status).toBe('terminal');
      const reordered = JSON.parse(canonicalJson(finished)) as typeof finished;
      expect(Object.keys(finished.state.visitCounts)).not.toEqual(Object.keys(reordered.state.visitCounts));
      expect(diffRuntimeStates(finished.state, reordered.state)).toEqual([]);
      expect(replayTrial(project, reordered).state).toEqual(finished.state);

      const ids = { checkpointId: newId(), snapshotId: newId() };
      const data = pinTrialRecord(finished, ids);
      const checkpoint = { ...createEntity(project.projectId, 'checkpoint', '開始状態', data.checkpoint), id: ids.checkpointId };
      const trace = createEntity(project.projectId, 'trace', '経路記録', data.trace);
      project = (await store.saveProject({
        ...project,
        entities: [...project.entities, checkpoint, trace],
        snapshots: [...project.snapshots, { id: ids.snapshotId, content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: '2026-10-05T00:00:00Z', versionLabel: '試読開始版' }],
      }, { reason: '開始状態と経路を保存' })).project;
      project = (await store.saveProject({
        ...project,
        entities: project.entities.map(entity => entity.kind === 'scene' ? { ...entity, data: { ...entity.data, body: [] } } : entity),
      }, { reason: '後から本文を変更' })).project;

      const restored = (await inspectScenarioData(await exportScenario(project))).project;
      const replayed = replaySavedTrace(restored, trace.id);
      expect(replayed.issues).toEqual([]);
      expect(replayed.status).toBe('terminal');
      expect(replayed.state).toEqual({ ...finished.state, contentVersionId: ids.snapshotId });
      expect(replayed.trace).toHaveLength(1);
      // Object key order is irrelevant; sequence order and actual values remain significant.
      const savedTrace = restored.entities.find(entity => entity.id === trace.id);
      if (savedTrace?.kind !== 'trace') throw new Error('保存経路がありません。');
      savedTrace.data.steps[0].after.seenIds.reverse();
      expect(replaySavedTrace(restored, trace.id).status).toBe('error');
    } finally {
      await store.deleteDatabase();
    }
  });

  it('distinguishes a condition type error from an unknown value and never credits it', () => {
    const { project, add, entry, end, edge } = fixture();
    const n = add('variable', { key: 'n', valueType: 'integer', initial: { type: 'integer', value: 0 } });
    edge(entry.id, end.id, { condition: { op: 'compare', variableId: n.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const invalid = startTrial(project);
    expect(invalid.status).toBe('error');
    expect(invalid.issues.some(issue => issue.code === 'VALIDATION_FAILED')).toBe(true);
    expect(trialCoverage(project, invalid).conditions.reached).toBe(0);
    expect(analyzeFlow(project).status).toBe('confirmed_issue');
  });

  it('stops unsupported reference/override reuse before applying an entering edge effect', () => {
    const { project, add, entry, end, edge } = fixture();
    const key = add('variable', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: false } });
    const effect = add('effect', { operation: 'set', targetId: key.id, value: { type: 'boolean', value: true } });
    const selected = edge(entry.id, end.id, { effectIds: [effect.id] });
    for (const mode of ['reference', 'override'] as const) {
      end.data.reuse = { mode, sourceId: entry.id, pinnedSnapshotId: project.projectId, overrideFields: [] };
      const before = startTrial(project);
      const stopped = stepTrial(project, before, { edgeId: selected.id });
      expect(stopped.status).toBe('error');
      expect(stopped.state).toBe(before.state);
      expect(stopped.issues[0]?.code).toBe('VALIDATION_FAILED');
      entry.data.reuse = structuredClone(end.data.reuse);
      expect(startTrial(project).status).toBe('error');
      delete entry.data.reuse;
    }
  });

  it('keeps full-play, partial, and stub evidence in separate coverage groups', () => {
    const { project, entry, end, edge } = fixture();
    edge(entry.id, end.id);
    const full = startTrial(project);
    const partial = startTrial(project, { entryId: end.id });
    const stub = setTrialStubValues(project, full, {});
    expect(() => trialCoverage(project, [full, partial, stub])).toThrow();
    expect(Object.keys(trialCoverageByProvenance(project, [full, partial, stub])).sort()).toEqual(['full_play', 'partial', 'stub']);
  });
});

describe('bounded state exploration', () => {
  it('provides witness paths for intentional ends and dead-end candidates', () => {
    const { project, entry, end, edge, node } = fixture();
    const dead = node({ nodeType: 'choice' });
    edge(entry.id, end.id);
    edge(entry.id, dead.id);
    const analysis = analyzeFlow(project);
    expect(analysis.findings.find(finding => finding.targetId === dead.id)?.path).toEqual([entry.id, dead.id]);
    expect(analysis.findings.find(finding => finding.targetId === end.id)?.status).toBe('intentional');
    expect(analysis.status).toBe('candidate');
    expect(analysis.contentRevision).toBe(project.revision);
  });

  it('labels unresolved references as confirmed issues and external values as unknown', () => {
    const { project, entry, end, edge, add } = fixture();
    const contract = add('external_contract', { key: 'external', outputType: 'boolean' });
    edge(entry.id, end.id, { condition: { op: 'external', contractId: contract.id } });
    expect(analyzeFlow(project).status).toBe('unknown');
    edge(entry.id, end.id, { toId: { unresolved: { label: '未完成', reason: '後で作る' } } });
    expect(analyzeFlow(project).findings.some(finding => finding.status === 'confirmed_issue' && finding.code === 'REFERENCE_INVALID')).toBe(true);
  });

  it('does not call an unbounded loop safe, or call an unvisited node unreachable', () => {
    const { project, entry, end, edge } = fixture();
    edge(entry.id, entry.id);
    const analysis = analyzeFlow(project);
    expect(analysis.status).toBe('unknown');
    expect(analysis.findings.some(finding => finding.code === 'UNBOUNDED_LOOP')).toBe(true);
    expect(analysis.findings.find(finding => finding.targetId === end.id)?.code).toBe('NOT_REACHED_IN_CHECKED_SCOPE');
  });

  it('honors state, per-path transition, time, and cancellation limits as unknown', async () => {
    const { project, add, entry, end, edge } = fixture();
    const counter = add('variable', { key: 'counter', valueType: 'integer', initial: { type: 'integer', value: 0 } });
    const increment = add('effect', { operation: 'add', targetId: counter.id, value: { type: 'integer', value: 1 } });
    edge(entry.id, entry.id, { effectIds: [increment.id] });
    edge(entry.id, end.id);
    for (const options of [{ maxStates: 1 }, { maxTransitions: 1 }]) {
      const analysis = analyzeFlow(project, options);
      expect(analysis.truncated).toBe(true);
      expect(analysis.status).toBe('unknown');
      expect(analysis.findings.some(finding => finding.code === 'ANALYSIS_LIMIT')).toBe(true);
    }
    let time = 0;
    expect(analyzeFlow(project, { maxMs: 10, now: () => time += 11 }).truncated).toBe(true);
    const controller = new AbortController();
    const canceled = await analyzeFlowAsync(project, { maxStates: 1000, signal: controller.signal, onProgress: () => controller.abort() });
    expect(canceled.truncated).toBe(true);
    expect(canceled.checkedStates).toBeGreaterThan(0);
    expect(canceled.checkedStates).toBeLessThan(1000);
  });

  it('includes visit thresholds read through derived variables in the explored state', () => {
    const { project, add, entry, end, edge } = fixture();
    const revisited = add('variable', { key: 'revisited', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '算出' }, derived: { op: 'visited', entityId: entry.id, count: 3 } });
    edge(entry.id, entry.id);
    edge(entry.id, end.id, { condition: { op: 'compare', variableId: revisited.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const result = analyzeFlow(project);
    expect(result.findings.find(finding => finding.code === 'TERMINAL')?.path).toEqual([entry.id, entry.id, entry.id, end.id]);
  });
});

describe('presentation-order foreshadow checking', () => {
  it('shows a missing required clue on its witness path without inferring reader understanding', () => {
    const { project, add, entry, end, edge, node } = fixture();
    const clueScene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '手掛かり' }] });
    const revealScene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '回収' }] });
    const clueNode = node({ nodeType: 'scene', sceneId: clueScene.id });
    const reveal = node({ nodeType: 'scene', sceneId: revealScene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    const clue = add('disclosure', { foreshadowId: question.id, anchor: { entityId: clueScene.id }, stage: 'hint', role: 'clue' });
    const payoff = add('disclosure', { foreshadowId: question.id, anchor: { entityId: revealScene.id }, stage: 'reveal', role: 'payoff' });
    question.data.requiredInfo = [clue.id];
    const skip = edge(entry.id, reveal.id);
    const viaClue = edge(entry.id, clueNode.id);
    const continueEdge = edge(clueNode.id, reveal.id);
    edge(reveal.id, end.id);
    const missing = stepTrial(project, startTrial(project), { edgeId: skip.id });
    const finding = checkTrialForeshadows(project, missing)[0];
    expect(finding).toMatchObject({ status: 'candidate', targetId: question.id, payoffId: payoff.id, missingInfoIds: [clue.id] });
    expect(finding.path).toEqual([entry.id, reveal.id]);
    const informed = stepTrial(project, stepTrial(project, startTrial(project), { edgeId: viaClue.id }), { edgeId: continueEdge.id });
    expect(checkTrialForeshadows(project, informed)).toEqual([]);
  });

  it('does not assume an unordered clue in the same scene precedes its payoff', () => {
    const { project, add, entry, edge, node } = fixture();
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '手掛かりと回収' }] });
    const sceneNode = node({ nodeType: 'scene', sceneId: scene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    const clue = add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id }, stage: 'hint', role: 'clue' });
    add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id }, stage: 'reveal', role: 'payoff' });
    question.data.requiredInfo = [clue.id];
    const chosen = edge(entry.id, sceneNode.id);
    const read = stepTrial(project, startTrial(project), { edgeId: chosen.id });
    expect(checkTrialForeshadows(project, read)[0]?.status).toBe('unknown');
  });

  it('uses ordered body blocks and explicit offsets, marking an overlapping range unknown', () => {
    const { project, add, entry, edge, node } = fixture();
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '手掛かりと回収' }, { id: newId(), kind: 'paragraph', text: '次の段落' }] });
    const sceneNode = node({ nodeType: 'scene', sceneId: scene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    const clue = add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id, blockId: scene.data.body[1].id }, stage: 'hint', role: 'clue' });
    const payoff = add('disclosure', { foreshadowId: question.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id }, stage: 'reveal', role: 'payoff' });
    question.data.requiredInfo = [clue.id];
    const chosen = edge(entry.id, sceneNode.id);
    const read = () => stepTrial(project, startTrial(project), { edgeId: chosen.id });
    expect(checkTrialForeshadows(project, read())[0]?.status).toBe('candidate');
    clue.data.anchor = { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 4 };
    payoff.data.anchor = { entityId: scene.id, blockId: scene.data.body[0].id, start: 5, end: 7 };
    expect(checkTrialForeshadows(project, read())).toEqual([]);
    clue.data.anchor.end = 6;
    expect(checkTrialForeshadows(project, read())[0]?.status).toBe('unknown');
  });
});

describe('declared disclosure knowledge effects', () => {
  it('grants character knowledge only through declared effects, and never merely through participation', () => {
    const { project, add, entry, end, edge, node } = fixture();
    const holder = add('character', {});
    const event = add('event', { participants: [{ characterId: holder.id, role: 'witness' }] });
    const scene = add('scene', { eventIds: [event.id], body: [{ id: newId(), kind: 'paragraph', text: '証言を読む' }] });
    const reader = node({ nodeType: 'scene', sceneId: scene.id });
    const fact = add('assertion', { subjectId: holder.id, predicate: '鍵の在処', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: holder.id });
    const grant = add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    const disclosure = add('disclosure', { foreshadowId: question.id, role: 'clue', stage: 'hint', anchor: { entityId: scene.id, blockId: scene.data.body[0].id } });
    const selected = edge(entry.id, reader.id);
    edge(reader.id, end.id);
    expect(stepTrial(project, startTrial(project), { edgeId: selected.id }).state.assertions).toEqual([]);
    disclosure.data.knowledgeEffects = [grant.id];
    const declared = stepTrial(project, startTrial(project), { edgeId: selected.id });
    expect(declared.state.assertions).toMatchObject([{ assertionId: fact.id, holderId: holder.id, truth: 'true' }]);
    expect(declared.state.seenIds).toContain(disclosure.id);
  });

  it('rolls back the entire arrival when a later knowledge effect fails, including entering effects and RNG', () => {
    const { project, add, entry, edge, node } = fixture();
    const n = add('variable', { key: 'n', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 3 } });
    const plus1 = add('effect', { operation: 'add', targetId: n.id, value: { type: 'integer', value: 1 } });
    const invalid = add('effect', { operation: 'add', targetId: n.id, value: { type: 'integer', value: 99 } });
    const holder = add('character', {});
    const fact = add('assertion', { subjectId: holder.id, predicate: '秘密', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: holder.id });
    const grant = add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } });
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '秘密を読む' }] });
    const target = node({ nodeType: 'scene', sceneId: scene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    add('disclosure', { foreshadowId: question.id, role: 'clue', stage: 'hint', anchor: { entityId: scene.id }, knowledgeEffects: [grant.id, invalid.id] });
    entry.data.trigger = { event: 'manual', eventKey: 'read', repeat: 'once' };
    edge(entry.id, target.id, { effectIds: [plus1.id] });
    const before = startTrial(project);
    const result = stepTrial(project, before, { random: true, event: { event: 'manual', eventKey: 'read', occurrenceId: 'read-1' } });
    expect(result.status).toBe('error');
    expect(result.state).toBe(before.state);
    expect(result.state.variableValues[n.id]).toEqual({ type: 'integer', value: 0 });
    expect(result.state.assertions).toEqual([]);
    expect(result.state.seenIds).not.toContain(scene.id);
    expect(result.state.rngPosition).toBe(0);
    expect(result.state.onceTriggers).toEqual([]);
    expect(result.history).toEqual([]);
  });

  it('stops an unknown disclosure before arrival and labels an author-provided value as stub evidence', () => {
    const { project, add, entry, edge, node } = fixture();
    const key = add('variable', { key: 'known', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未入力' } });
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '条件付きの手掛かり' }] });
    const target = node({ nodeType: 'scene', sceneId: scene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    add('disclosure', { foreshadowId: question.id, role: 'clue', stage: 'hint', anchor: { entityId: scene.id }, condition: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const chosen = edge(entry.id, target.id);
    const before = startTrial(project);
    const unknown = stepTrial(project, before, { edgeId: chosen.id });
    expect(unknown.status).toBe('unknown');
    expect(unknown.state).toBe(before.state);
    const assumed = setTrialStubValues(project, unknown, { variables: { [key.id]: { type: 'boolean', value: true } } });
    const read = stepTrial(project, assumed, { edgeId: chosen.id });
    expect(read.nodeId).toBe(target.id);
    expect(read.state.provenance).toBe('stub');
    expect(read.state.seenIds).toContain(scene.id);
  });

  it('restores a pending initial presentation on Back and replays its recorded stub resolution', async () => {
    const { project, add, entry, end, edge } = fixture();
    const key = add('variable', { key: 'key', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未入力' } });
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: '条件が必要な開始場面' }] });
    const holder = add('character', {});
    const fact = add('assertion', { subjectId: holder.id, predicate: '開始時の秘密', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: holder.id });
    const grant = add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    add('disclosure', { foreshadowId: question.id, role: 'clue', stage: 'hint', anchor: { entityId: scene.id }, condition: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } }, knowledgeEffects: [grant.id] });
    entry.data.sceneId = scene.id;
    edge(entry.id, end.id);
    const pending = startTrial(project);
    expect(pending.status).toBe('unknown');
    expect(pending.pendingPresentation).toBe(entry.id);
    expect(pending.state.seenIds).toEqual([]);
    expect(pending.state.assertions).toEqual([]);
    const resolved = setTrialStubValues(project, pending, { variables: { [key.id]: { type: 'boolean', value: true } } });
    expect(resolved.pendingPresentation).toBeUndefined();
    expect(resolved.state.visitCounts[entry.id]).toBe(1);
    expect(resolved.state.assertions).toHaveLength(1);
    const restored = backTrial(resolved);
    expect(restored.pendingPresentation).toBe(entry.id);
    expect(restored.state).toEqual(pending.state);
    expect(stepTrial(project, restored).status).toBe('unknown');
    const ids = { checkpointId: newId(), snapshotId: newId() };
    const data = pinTrialRecord(resolved, ids);
    project.snapshots.push({ id: ids.snapshotId, versionLabel: '開始提示の仮値記録', content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: '2026-10-05T00:00:00Z' });
    const checkpoint = add('checkpoint', data.checkpoint); checkpoint.id = ids.checkpointId;
    const trace = add('trace', data.trace);
    expect(trace.data.steps[0].operation).toBe('stub');
    expect(replaySavedTrace(project, trace.id).state).toEqual({ ...resolved.state, contentVersionId: ids.snapshotId });
  });

  it('requires an explicit order between multiple effects in one paragraph', () => {
    const { project, add, entry, edge, node } = fixture();
    const holder = add('character', {});
    const scene = add('scene', { body: [{ id: newId(), kind: 'paragraph', text: 'ふたつの知らせ' }] });
    const target = node({ nodeType: 'scene', sceneId: scene.id });
    const question = add('foreshadow', { resolutionPolicy: 'this_work' });
    const disclosures = [0, 1].map(index => {
      const fact = add('assertion', { subjectId: holder.id, predicate: `秘密${index}`, value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: holder.id });
      const grant = add('effect', { operation: 'assert', targetId: fact.id, value: { type: 'boolean', value: true } });
      return add('disclosure', { foreshadowId: question.id, role: 'clue', stage: 'hint', anchor: { entityId: scene.id, blockId: scene.data.body[0].id }, knowledgeEffects: [grant.id] });
    });
    const chosen = edge(entry.id, target.id);
    const before = startTrial(project);
    const unordered = stepTrial(project, before, { edgeId: chosen.id });
    expect(unordered.status).toBe('unknown');
    expect(unordered.state).toBe(before.state);
    disclosures[0].data.anchor.start = 0; disclosures[0].data.anchor.end = 3;
    disclosures[1].data.anchor.start = 4; disclosures[1].data.anchor.end = 7;
    const ordered = stepTrial(project, startTrial(project), { edgeId: chosen.id });
    expect(ordered.state.assertions).toHaveLength(2);
  });
});
