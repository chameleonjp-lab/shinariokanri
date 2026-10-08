import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, emptyValidity, validateProject } from '../domain/model';
import { createWorldSnapshot, previewWorldVersion } from '../domain/world';
import { pinTrialRecord, setTrialStubValues, stepTrial, backTrial } from '../domain/runtime';
import { replaySavedTraceVerified, startTrialVerified } from '../domain/runtimeVerified';
import { jsonBytes, sha256 } from './json';
import { ScenarioStore } from './store';
import { inspectScenario, worldSnapshotContents } from './archive';
import type { Entity } from '../domain/types';

const stores: ScenarioStore[] = [];
const open = (databaseName = `flow-world-${newId()}`) => { const db = new ScenarioStore({ databaseName }); stores.push(db); return db; };
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });

describe('RV04 exact fixed world across native save, restore and clone (fake IndexedDB)', () => {
  it('records the initial presentation tick for a valid finite exception and replays it after native saving', async () => {
    const db = open(); let p = createProject('初期提示の有効例外');
    const evidence = createEntity(p.projectId, 'source', '根拠', { locator: '記録された仕様' }); evidence.status = 'confirmed';
    const variable = createEntity(p.projectId, 'variable', '進行', { key: 'stage', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 3 }, transitionRules: [{ from: { type: 'integer', value: 0 }, to: { type: 'integer', value: 1 } }] });
    const effect = createEntity(p.projectId, 'effect', '根拠のある例外', { operation: 'set', targetId: variable.id, value: { type: 'integer', value: 3 }, exceptionDetails: { reason: 'この経路の期間限定運用', evidenceIds: [evidence.id], targetScope: { projectId: p.projectId }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } } } });
    const scene = createEntity(p.projectId, 'scene', '初期提示'), foreshadow = createEntity(p.projectId, 'foreshadow', '提示');
    const disclosure = createEntity(p.projectId, 'disclosure', '根拠を提示', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id }, knowledgeEffects: [effect.id] });
    const a = createEntity(p.projectId, 'flow_node', '入口', { nodeType: 'entry', sceneId: scene.id, executionPolicy: 'first_match' }), b = createEntity(p.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '完了' });
    const edge = createEntity(p.projectId, 'flow_edge', '進行', { fromId: a.id, toId: b.id, edgeType: 'automatic', priority: 0 }); p.entities.push(evidence, variable, effect, scene, foreshadow, disclosure, a, b, edge);
    p = (await db.saveProject(p, { reason: '例外宣言を保存' })).project;
    expect((await startTrialVerified(p)).status).toBe('unknown'); expect((await startTrialVerified(p, { worldTick: '10' })).status).toBe('error');
    const requested = { worldTick: '5' }, pending = startTrialVerified(p, requested); requested.worldTick = '10';
    const trial = await pending; expect(trial.status).toBe('ready'); expect(trial.initialWorldTick).toBe('5'); expect(trial.state.variableValues[variable.id]).toEqual({ type: 'integer', value: 3 });
    const ended = stepTrial(p, trial), checkpointId = newId(), snapshotId = newId(), record = pinTrialRecord(ended, { checkpointId, snapshotId });
    expect(record.trace.initialWorldTick).toBe('5');
    const checkpoint = { ...createEntity(p.projectId, 'checkpoint', '開始', record.checkpoint), id: checkpointId }, trace = createEntity(p.projectId, 'trace', '初期例外の経路', record.trace);
    p.entities.push(checkpoint, trace); p.snapshots.push({ id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), versionLabel: '初期提示固定', createdAt: new Date().toISOString() });
    const saved = (await db.saveProject(p, { reason: '初期提示と経路' })).project, loaded = (await db.getProject(saved.projectId))!;
    const replay = await replaySavedTraceVerified(loaded, trace.id); expect(replay.status).toBe('terminal'); expect(replay.initialWorldTick).toBe('5'); expect(replay.startConditionResults).toEqual(trial.startConditionResults);
  });
  it('keeps gate, borrowed values, saved replay and hashes tied to the old edition after world revision', async () => {
    const databaseName = `flow-world-${newId()}`, db = open(databaseName);
    let world = createProject('共通世界'); const v = createEntity(world.projectId, 'variable', '世界の入口', { key: 'world_gate', initial: { type: 'boolean', value: true } }); v.status = 'confirmed'; world.entities.push(v);
    world = await createWorldSnapshot(world, '世界の旧版'); const old = world.snapshots[0]!;
    let p = (await previewWorldVersion(createProject('作品'), world, old.id, [v.id])).candidate;
    const a = createEntity(p.projectId, 'flow_node', '入口', { nodeType: 'entry', executionPolicy: 'first_match', gate: { op: 'compare', variableId: v.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const b = createEntity(p.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '完了' });
    const edge = createEntity(p.projectId, 'flow_edge', '進行', { fromId: a.id, toId: b.id, edgeType: 'automatic', priority: 0 }); p.entities.push(a, b, edge);
    p = (await db.saveProject(p, { reason: '固定世界を含む作品', worldPin: { world, snapshotId: old.id } })).project;
    const registry = worldSnapshotContents(await db.listWorldSnapshots());
    expect(validateProject(p, { worldSnapshots: registry }).ok).toBe(true);
    const start = await startTrialVerified(p, {}, registry); expect(start.status).toBe('ready'); expect(start.state.variableValues[v.id]).toEqual({ type: 'boolean', value: true });
    const stub = setTrialStubValues(p, start, { variables: { [v.id]: { type: 'boolean', value: false } } }); expect(stub.state.provenance).toBe('stub'); expect(backTrial(stub).state).toEqual(start.state);
    const ended = stepTrial(p, start); expect(ended.status).toBe('terminal');
    const checkpointId = newId(), snapshotId = newId(), record = pinTrialRecord(ended, { checkpointId, snapshotId });
    const checkpoint = { ...createEntity(p.projectId, 'checkpoint', '開始', record.checkpoint), id: checkpointId }, trace = createEntity(p.projectId, 'trace', '経路', record.trace);
    p.snapshots.push({ id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: '経路固定版' }); p.entities.push(checkpoint, trace);
    p = (await db.saveProject(p, { reason: '固定世界を使う経路' })).project; db.close();
    const reloaded = open(databaseName), loaded = (await reloaded.getProject(p.projectId))!;
    const reloadedRegistry = worldSnapshotContents(await reloaded.listWorldSnapshots());
    expect((await replaySavedTraceVerified(loaded, trace.id, reloadedRegistry)).state).toEqual({ ...ended.state, contentVersionId: snapshotId });
    (world.entities.find(e => e.id === v.id) as Entity<'variable'>).data.initial = { type: 'boolean', value: false }; world = await createWorldSnapshot(world, '世界の新しい版');
    expect((await startTrialVerified(loaded, {}, reloadedRegistry)).state.variableValues[v.id]).toEqual({ type: 'boolean', value: true });
    const archive = await inspectScenario(await reloaded.exportProject(p.projectId), { worker: false });
    for (const mode of ['new', 'clone'] as const) {
      const restoredDb = open(), restored = await restoredDb.importScenario(archive, { mode }), restoredRegistry = worldSnapshotContents(await restoredDb.listWorldSnapshots());
      const restoredTrace = restored.project.entities.find((e): e is Entity<'trace'> => e.kind === 'trace')!;
      const replay = await replaySavedTraceVerified(restored.project, restoredTrace.id, restoredRegistry);
      expect(replay.status).toBe('terminal'); expect(replay.state.variableValues[v.id]).toEqual({ type: 'boolean', value: true });
      expect(restored.project.entities.some(e => e.id === v.id)).toBe(false);
      expect(restored.project.worldReferences[0]).toEqual(p.worldReferences[0]);
    }
    const damaged = structuredClone(reloadedRegistry); (damaged[old.id]!.entities[0] as Entity<'variable'>).data.initial = { type: 'boolean', value: false };
    await expect(startTrialVerified(loaded, {}, damaged)).rejects.toThrow();
    expect(await reloaded.getProject(p.projectId)).toEqual(loaded);
  });
});
