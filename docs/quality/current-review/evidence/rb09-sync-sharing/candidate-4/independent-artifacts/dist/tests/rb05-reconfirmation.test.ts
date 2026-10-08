import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import { preparePartialCheckpoint, previewCheckpointMigration, confirmedCheckpointMigration } from '../src/domain/checkpoints';
import { confirmTraceReconfirmation, prepareTraceReconfirmation, traceRevisionChanges } from '../src/domain/traceReconfirmation';
import { pinTrialRecord, startTrial, stepTrial } from '../src/domain/runtime';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { pinChapterReadingRecord, presentNextChapterScene, replayChapterReading, startChapterReading } from '../src/domain/presentation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { ScenarioStore, cloneProject } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage/json';
import type { Entity, ProjectData } from '../src/domain/types';
function fixture() {
  const p = createProject('版移行と再確認'), scene = createEntity(p.projectId, 'scene', '開始本文', { body: [{ id: newId(), kind: 'paragraph', text: '開始。' }] }), variable = createEntity(p.projectId, 'variable', '金額', { key: 'amount', valueType: 'integer', initial: { type: 'integer', value: 2 }, allowed: { min: 0, max: 100 }, scope: 'across_runs' }), entry = createEntity(p.projectId, 'flow_node', '入口', { nodeType: 'entry', sceneId: scene.id }), end = createEntity(p.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '終わる' }), effect = createEntity(p.projectId, 'effect', '加算', { operation: 'add', targetId: variable.id, value: { type: 'integer', value: 1 } }), edge = createEntity(p.projectId, 'flow_edge', '終える', { fromId: entry.id, toId: end.id, effectIds: [effect.id] });
  p.entities.push(scene, variable, entry, end, effect, edge); return { p, scene, variable, entry, end, effect, edge };
}
async function recorded(f: ReturnType<typeof fixture>) {
  const session = stepTrial(f.p, startTrial(f.p), { edgeId: f.edge.id }), ids = { checkpointId: newId(), snapshotId: newId() }, data = pinTrialRecord(session, ids);
  const cp = { ...createEntity(f.p.projectId, 'checkpoint', '旧版の開始', data.checkpoint), id: ids.checkpointId }, trace = createEntity(f.p.projectId, 'trace', '旧版の経路', data.trace);
  f.p.entities.push(cp, trace); f.p.snapshots.push({ id: ids.snapshotId, content: data.content, contentHash: await sha256(jsonBytes(data.content)), createdAt: '2026-10-08T00:00:00Z', versionLabel: '旧版' });
  return { cp, trace };
}
describe('explicit checkpoint edition migration and new regression proof', () => {
  it('previews retained, changed and removed state, then atomically saves a new partial start without changing its source', async () => {
    const f = fixture(), prepared = await preparePartialCheckpoint(f.p, { entryId: f.entry.id }); prepared.checkpoint.data.runtimeState.variableValues[f.variable.id] = { type: 'integer', value: 8 }; prepared.checkpoint.data.runtimeState.seenIds = [f.scene.id, f.scene.data.body[0].id];
    f.p.entities.push(prepared.checkpoint); f.p.snapshots.push(...prepared.snapshots);
    const before = structuredClone(prepared.checkpoint), plan = await previewCheckpointMigration(f.p, prepared.checkpoint.id, { entryId: f.entry.id });
    expect(plan.changes.some(change => change.id === f.variable.id && change.action === 'carry')).toBe(true);
    expect(plan.migrated.checkpoint.data.runtimeState.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 8 }); expect(plan.recreated.checkpoint.data.runtimeState.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 2 });
    const migration = await confirmedCheckpointMigration(f.p, plan, 'migrate'), db = new ScenarioStore({ databaseName: `migration-${newId()}` });
    try {
      const saved = (await db.saveProject({ ...f.p, entities: [...f.p.entities, migration.checkpoint], snapshots: [...f.p.snapshots, ...migration.snapshots] }, { reason: '確認した版移行' })).project;
      const reloaded = (await db.getProject(saved.projectId))!; const trial = await startTrialVerified(reloaded, { checkpointId: migration.checkpoint.id, contentVersionId: migration.checkpoint.data.contentVersionId });
      expect(trial.state.provenance).toBe('partial'); expect(trial.state.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 8 }); expect(reloaded.entities.find(entity => entity.id === prepared.checkpoint.id)?.data).toEqual(before.data);
      const restored = await inspectScenario(await exportScenario(reloaded)), clone = await cloneProject(restored.project), cloned = clone.project.entities.find(entity => entity.id === clone.idMap[migration.checkpoint.id]) as Entity<'checkpoint'>;
      expect(cloned.data.migration!.sourceCheckpointId).toBe(clone.idMap[prepared.checkpoint.id]); expect(cloned.data.migration!.sourceVersionId).toBe(clone.idMap[before.data.contentVersionId]); expect(validateProject(clone.project).ok).toBe(true);
    } finally { await db.deleteDatabase(); }
    f.variable.data.initial = { type: 'integer', value: 4 }; f.scene.data.body[0].text = '本文の変更'; f.p.revision = '3';
    await expect(confirmedCheckpointMigration(f.p, plan, 'migrate')).rejects.toThrow('更新');
    const changed = await previewCheckpointMigration(f.p, prepared.checkpoint.id, { entryId: f.entry.id }); expect(changed.migrated.checkpoint.data.runtimeState.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 4 }); expect(changed.migrated.checkpoint.data.runtimeState.seenIds).toEqual([]);
  });
  it('rejects damaged source editions and a changed confirmation payload before saving any state', async () => {
    const f = fixture(), prepared = await preparePartialCheckpoint(f.p, { entryId: f.entry.id }); f.p.entities.push(prepared.checkpoint); f.p.snapshots.push(...prepared.snapshots);
    const plan = await previewCheckpointMigration(f.p, prepared.checkpoint.id, { entryId: f.entry.id }); plan.migrated.checkpoint.data.runtimeState.variableValues[f.variable.id] = { type: 'integer', value: 99 };
    await expect(confirmedCheckpointMigration(f.p, plan, 'migrate')).rejects.toThrow('差分');
    f.p.snapshots[0].contentHash = '0'.repeat(64); await expect(previewCheckpointMigration(f.p, prepared.checkpoint.id)).rejects.toThrow('ハッシュ');
  });
  it('executes changed declarations from their new initial values and preserves old paths, snapshots and regression declarations through reload and clone', async () => {
    const f = fixture(), old = await recorded(f), collection = createEntity(f.p.projectId, 'collection', '回帰集合', { mode: 'fixed', purpose: 'regression', memberIds: [old.trace.id] }); f.p.entities.push(collection);
    f.variable.data.initial = { type: 'integer', value: 6 }; f.p.revision = '2'; const oldBytes = jsonBytes(old.trace);
    expect(traceRevisionChanges(f.p, old.trace).some(change => change.id === f.variable.id)).toBe(true);
    const plan = await prepareTraceReconfirmation(f.p, old.trace.id), confirmed = await confirmTraceReconfirmation(f.p, plan), newTrace = confirmed.entities.find(entity => entity.kind === 'trace') as Entity<'trace'>;
    expect(newTrace.data.steps.at(-1)!.after.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 7 }); expect(jsonBytes(old.trace)).toEqual(oldBytes);
    const merged = { ...f.p, entities: [...f.p.entities.filter(entity => !confirmed.entities.some(next => next.id === entity.id)), ...confirmed.entities], snapshots: [...f.p.snapshots, ...confirmed.snapshots] };
    expect(validateProject(merged).ok).toBe(true); expect(merged.entities.find(entity => entity.id === collection.id)!.data).toMatchObject({ memberIds: [old.trace.id, newTrace.id] });
    const restored = (await inspectScenario(await exportScenario(merged))).project;
    expect((await replaySavedTraceVerified(restored, old.trace.id)).state.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 3 }); expect((await replaySavedTraceVerified(restored, newTrace.id)).state.variableValues[f.variable.id]).toEqual({ type: 'integer', value: 7 });
    const clone = await cloneProject(restored), cloned = clone.project.entities.find(entity => entity.id === clone.idMap[newTrace.id]) as Entity<'trace'>; expect(cloned.data.reconfirmation!.sourceTraceId).toBe(clone.idMap[old.trace.id]); expect(validateProject(clone.project).ok).toBe(true);
    const forged = structuredClone(plan); forged.entities[0].name = '改変'; await expect(confirmTraceReconfirmation(f.p, forged)).rejects.toThrow('変更'); f.p.revision = '3'; await expect(confirmTraceReconfirmation(f.p, plan)).rejects.toThrow('更新');
  });
  it('keeps unknown, prohibited, missing and cancelled paths outside renewed proof', async () => {
    const f = fixture(), old = await recorded(f), before = structuredClone(old.trace);
    f.edge.data.condition = { op: 'constant', value: false }; await expect(prepareTraceReconfirmation(f.p, old.trace.id)).rejects.toThrow('開始状態');
    f.edge.data.condition = { op: 'compare', variableId: f.variable.id, comparator: 'eq', value: { type: 'integer', value: 2 } }; f.variable.data.initial = { type: 'unknown', value: null, reason: '未入力' }; await expect(prepareTraceReconfirmation(f.p, old.trace.id)).rejects.toThrow('開始状態');
    f.variable.data.initial = { type: 'integer', value: 2 }; const abort = new AbortController(); abort.abort(); await expect(prepareTraceReconfirmation(f.p, old.trace.id, { signal: abort.signal })).rejects.toThrow('中止');
    expect(old.trace).toEqual(before);
  });
  it('recalculates derived state from retained values instead of carrying an old calculation', async () => {
    const f = fixture(), derived = createEntity(f.p.projectId, 'variable', '金額の二倍', { key: 'twice', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 200 }, derived: { op: 'multiply', left: { op: 'variable', variableId: f.variable.id }, right: { op: 'value', value: { type: 'integer', value: 2 } } } }); f.p.entities.push(derived);
    const prepared = await preparePartialCheckpoint(f.p, { entryId: f.entry.id }); prepared.checkpoint.data.runtimeState.variableValues[f.variable.id] = { type: 'integer', value: 8 }; prepared.checkpoint.data.runtimeState.variableValues[derived.id] = { type: 'integer', value: 99 }; f.p.entities.push(prepared.checkpoint); f.p.snapshots.push(...prepared.snapshots);
    const plan = await previewCheckpointMigration(f.p, prepared.checkpoint.id, { entryId: f.entry.id }); expect(plan.migrated.checkpoint.data.runtimeState.variableValues[derived.id]).toEqual({ type: 'integer', value: 16 }); expect(plan.changes.some(change => change.id === derived.id && change.action === 'reset')).toBe(true);
  });
  it('stops typed checkpoint values outside their edition contract while retaining unknown starts as unknown', async () => {
    const f = fixture(); f.entry.data.gate = { op: 'compare', variableId: f.variable.id, comparator: 'eq', value: { type: 'integer', value: 2 } };
    const prepared = await preparePartialCheckpoint(f.p, { entryId: f.entry.id }); f.p.entities.push(prepared.checkpoint); f.p.snapshots.push(...prepared.snapshots);
    for (const value of [{ type: 'integer', value: 101 }, { type: 'enum', value: 'wrong' }] as const) { prepared.checkpoint.data.runtimeState.variableValues[f.variable.id] = value; const stopped = await startTrialVerified(f.p, { checkpointId: prepared.checkpoint.id, contentVersionId: prepared.checkpoint.data.contentVersionId }); expect(stopped.status).toBe('error'); expect(stopped.trace).toEqual([]); }
    prepared.checkpoint.data.runtimeState.variableValues[f.variable.id] = { type: 'unknown', value: null, reason: '開始時点が未設定' }; const unresolved = await startTrialVerified(f.p, { checkpointId: prepared.checkpoint.id, contentVersionId: prepared.checkpoint.data.contentVersionId }); expect(unresolved.status).toBe('unknown'); expect(unresolved.state.provenance).toBe('partial'); expect(unresolved.trace).toEqual([]);
  });
  it('reevaluates changed chapter presentation order while preserving old order and the integer world start', async () => {
    const f = fixture(), second = createEntity(f.p.projectId, 'scene', '後の場面'), chapter = createEntity(f.p.projectId, 'chapter', '章', { sceneIds: [f.scene.id, second.id] }); f.p.entities.push(second, chapter); f.scene.data.chapterId = chapter.id; second.data.chapterId = chapter.id;
    let session = await startChapterReading(f.p, { chapterIds: [chapter.id] }); session = presentNextChapterScene(f.p, session); session = presentNextChapterScene(f.p, session);
    const ids = { checkpointId: newId(), snapshotId: newId() }, record = pinChapterReadingRecord(session, ids), cp = { ...createEntity(f.p.projectId, 'checkpoint', '章開始', record.checkpoint), id: ids.checkpointId }, trace = createEntity(f.p.projectId, 'trace', '章経路', record.trace); f.p.entities.push(cp, trace); f.p.snapshots.push({ id: ids.snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: '2026-10-08T00:00:00Z', versionLabel: '旧章順' });
    chapter.data.sceneIds = [second.id, f.scene.id]; f.p.revision = '2'; const before = f.p.mainStart, plan = await prepareTraceReconfirmation(f.p, trace.id), newTrace = plan.entities.find(entity => entity.kind === 'trace') as Entity<'trace'>;
    expect(newTrace.data.readingPath!.sceneIds).toEqual([second.id, f.scene.id]); expect((await replayChapterReading(f.p, trace.data, cp.data)).sceneIds).toEqual([f.scene.id, second.id]); expect(f.p.mainStart).toBe(before); expect(newTrace.data.readingPath!.occurrences[0].after.provenance).toBe('partial');
  });
});
