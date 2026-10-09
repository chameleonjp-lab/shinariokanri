import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import { flowStructure, structureCounts } from '../src/domain/flowStructure';
import { prepareReactions, type ReactionMode } from '../src/domain/reactions';
import { preparePartialCheckpoint } from '../src/domain/checkpoints';
import { backTrial, pinTrialRecord, restartTrial, startTrial, stepTrial } from '../src/domain/runtime';
import { replaySavedTraceVerified, startTrialVerified } from '../src/domain/runtimeVerified';
import { jsonBytes, sha256 } from '../src/storage/json';
import { ScenarioStore } from '../src/storage/store';
import { inspectScenario, exportScenario } from '../src/storage/archive';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
function add<K extends EntityKind>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}) { const entity = createEntity(p.projectId, kind, kind, data); p.entities.push(entity); return entity as Entity<K>; }

describe('RB05 hierarchy, reaction creation and typed partial starts', () => {
  it('keeps a called lower-graph unresolved exit and unknown condition visible at the chapter and removes the fixed exit only', () => {
    const p = createProject(), chapter = add(p, 'chapter'), scene = add(p, 'scene', { chapterId: chapter.id }); chapter.data.sceneIds = [scene.id];
    const line = add(p, 'dialogue_line'); scene.data.dialogueLineIds = [line.id];
    const value = add(p, 'variable', { key: 'pending', initial: { type: 'unknown', value: null, reason: '未入力' } });
    const a = add(p, 'flow_node', { nodeType: 'entry', sceneId: scene.id }), call = add(p, 'flow_node', { nodeType: 'call', sceneId: scene.id }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '終了' });
    const rootEdge = add(p, 'flow_edge', { fromId: a.id, toId: call.id }), childEntry = add(p, 'flow_node', { nodeType: 'entry', gate: { op: 'compare', variableId: value.id, comparator: 'eq', value: { type: 'boolean', value: true } } }), exit = add(p, 'flow_node', { nodeType: 'exit' });
    const unfinished = add(p, 'flow_edge', { fromId: childEntry.id, toId: { unresolved: { label: '会話の出口', reason: '接続前' } } });
    const root = add(p, 'flow_graph', { nodeIds: [a.id, call.id, end.id], edgeIds: [rootEdge.id], entryIds: [a.id], exitIds: [end.id] });
    const child = add(p, 'flow_graph', { parentGraphId: root.id, nodeIds: [childEntry.id, exit.id], edgeIds: [unfinished.id], entryIds: [childEntry.id], exitIds: [exit.id] });
    call.data.childGraphId = child.id; call.data.fallbackId = end.id; expect(validateProject(p).ok).toBe(true);
    const folded = flowStructure(p).find(item => item.id === chapter.id)!;
    expect(structureCounts(folded)).toEqual({ unfinished: 1, errors: 0, unknown: 1 });
    expect(folded.problems.some(problem => problem.targetId === unfinished.id)).toBe(true);
    expect(folded.children[0].children.some(item => item.id === line.id)).toBe(true);
    unfinished.data.toId = exit.id;
    expect(structureCounts(flowStructure(p).find(item => item.id === chapter.id)!)).toEqual({ unfinished: 0, errors: 0, unknown: 1 });
    const lowerScene = add(p, 'scene', { dialogueLineIds: [line.id] }); childEntry.data.sceneId = lowerScene.id; line.status = 'rejected';
    expect(structureCounts(flowStructure(p).find(item => item.id === chapter.id)!).errors).toBe(2);
    expect(structureCounts(flowStructure(p).find(item => item.id === root.id)!).errors).toBe(2);
  });

  it('keeps an unresolved full-origin opening outside checked regression evidence after fixed-version replay', async () => {
    const p = createProject(), variable = add(p, 'variable', { key: 'unknown', initial: { type: 'unknown', value: null, reason: '未入力' } }), scene = add(p, 'scene'), foreshadow = add(p, 'foreshadow');
    const disclosure = add(p, 'disclosure', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id }, condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } }); foreshadow.data.clueIds = [disclosure.id];
    const entry = add(p, 'flow_node', { nodeType: 'entry', sceneId: scene.id }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '終了' }); add(p, 'flow_edge', { fromId: entry.id, toId: end.id });
    const session = startTrial(p, { entryId: entry.id }); expect(session.status).toBe('unknown');
    const checkpointId = newId(), snapshotId = newId(), record = pinTrialRecord(session, { checkpointId, snapshotId });
    p.entities.push({ ...createEntity(p.projectId, 'checkpoint', '開始状態', record.checkpoint), id: checkpointId }); const trace = add(p, 'trace', record.trace);
    p.snapshots.push({ id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: '未確認の入口' }); add(p, 'collection', { mode: 'fixed', purpose: 'regression', memberIds: [trace.id] });
    const replay = await replaySavedTraceVerified(p, trace.id); expect(replay.status).toBe('unknown');
    expect(pinTrialRecord(replay, { checkpointId: newId(), snapshotId: newId() }).trace.coverage!.declaredTests).toMatchObject({ checked: 0, total: 1, unknown: 1 });
  });

  for (const mode of ['first_revisit', 'sequence', 'random'] as ReactionMode[]) it(`creates ${mode} reactions with stable scene IDs and reproducible visits, draw and undo`, async () => {
    const p = createProject(), sceneIds = [add(p, 'scene').id, add(p, 'scene').id, add(p, 'scene').id];
    const run = add(p, 'variable', { key: 'run_money', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 10 }, allowed: { min: 0, max: 100 } });
    const memory = add(p, 'variable', { key: 'memory', valueType: 'integer', scope: 'across_runs', initial: { type: 'integer', value: 7 }, allowed: { min: 0, max: 100 }, resetRules: [{ on: 'new_loop', value: { type: 'integer', value: 2 } }] });
    const result = prepareReactions(p, { name: '反応', sceneIds: mode === 'first_revisit' ? sceneIds.slice(0, 2) : sceneIds, mode }), project = result.candidate;
    let session = startTrial(project, { entryId: result.entryId, seed: '再現種' }); expect(session.status).toBe('ready');
    const before = structuredClone(session.state), first = stepTrial(project, session, mode === 'random' ? { random: true } : {});
    expect(first.status).toBe('ready');
    const node = project.entities.find((entity): entity is Entity<'flow_node'> => entity.id === first.nodeId && entity.kind === 'flow_node')!;
    expect(sceneIds).toContain(node.data.sceneId); if (mode !== 'random') expect(node.data.sceneId).toBe(sceneIds[0]);
    const undone = backTrial(first); expect(undone.state).toEqual(before);
    const repeatDraw = stepTrial(project, undone, mode === 'random' ? { random: true } : {}); expect(repeatDraw.state).toEqual(first.state);
    const repeat = project.entities.find((entity): entity is Entity<'flow_edge'> => entity.kind === 'flow_edge' && entity.data.fromId === first.nodeId && entity.data.toId === result.entryId)!;
    session = stepTrial(project, first, { edgeId: repeat.id }); session = stepTrial(project, session, mode === 'random' ? { random: true } : {});
    if (mode !== 'random') expect(project.entities.find((entity): entity is Entity<'flow_node'> => entity.id === session.nodeId && entity.kind === 'flow_node')?.data.sceneId).toBe(sceneIds[1]);
    const restarted = restartTrial(project, session, 'next_run', result.entryId);
    expect(restarted.state.variableValues[run.id]).toEqual({ type: 'integer', value: 10 });
    expect(restarted.state.variableValues[memory.id]).toEqual({ type: 'integer', value: 2 }); expect(restarted.state.visitCounts[result.entryId]).toBe(1);
    const restored = (await inspectScenario(await exportScenario(project), { worker: false })).project;
    expect(restored.entities.filter(entity => entity.kind === 'scene').map(entity => entity.id)).toEqual(sceneIds);
    expect(startTrial(restored, { entryId: result.entryId }).status).toBe('ready');
    expect(() => prepareReactions(project, { mode, name: '不正', sceneIds: [] })).toThrow();
  });

  it('captures a partial start before hashing, keeps its fixed initial values after save/reload and refuses a manually promoted full origin', async () => {
    const p = createProject(), a = add(p, 'flow_node', { nodeType: 'entry' }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '終了' });
    add(p, 'flow_edge', { fromId: a.id, toId: end.id }); const variable = add(p, 'variable', { key: 'affinity', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } });
    const item = add(p, 'item'), holder = add(p, 'character'), assertion = add(p, 'assertion', { subjectId: holder.id, predicate: '知っている事実', value: { type: 'boolean', value: true } });
    const preparing = preparePartialCheckpoint(p, { entryId: a.id }); variable.data.initial = { type: 'integer', value: 99 }; const prepared = await preparing;
    expect(prepared.checkpoint.data.runtimeState.variableValues[variable.id]).toEqual({ type: 'integer', value: 0 });
    prepared.checkpoint.data.runtimeState.variableValues[variable.id] = { type: 'integer', value: 5 };
    prepared.checkpoint.data.runtimeState.itemInstances.push({ instanceId: item.id, typeId: item.id, quantity: 1, consumed: false, ownerId: null, locationId: null });
    prepared.checkpoint.data.runtimeState.assertions.push({ assertionId: assertion.id, holderId: holder.id, truth: 'true' });
    const db = new ScenarioStore({ databaseName: `rb05-partial-${newId()}` });
    try {
      const saved = (await db.saveProject({ ...p, entities: [...p.entities, prepared.checkpoint], snapshots: prepared.snapshots }, { reason: '型付き途中状態' })).project;
      const reloaded = (await db.getProject(saved.projectId))!;
      const session = await startTrialVerified(reloaded, { checkpointId: prepared.checkpoint.id, contentVersionId: prepared.checkpoint.data.contentVersionId });
      expect(session.status).toBe('ready'); expect(session.state.provenance).toBe('partial'); expect(session.state.variableValues[variable.id]).toEqual({ type: 'integer', value: 5 }); expect(session.state.itemInstances).toHaveLength(1); expect(session.state.assertions).toHaveLength(1);
      const cp = reloaded.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === prepared.checkpoint.id && entity.kind === 'checkpoint')!; cp.data.origin = 'full_play'; cp.data.runtimeState.provenance = 'full_play';
      const forged = await startTrialVerified(reloaded, { checkpointId: cp.id, contentVersionId: cp.data.contentVersionId }); expect(forged.state.provenance).toBe('partial');
    } finally { await db.deleteDatabase(); }
  });
});
