import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import Dexie from 'dexie';
import { unzipSync, zipSync } from 'fflate';
import { createEntity, createProject, ENTITY_KINDS, newId, textToRichText, validateProject } from '../domain/model';
import { createWorldSnapshot, previewWorldVersion } from '../domain/world';
import { appendAlternativeVersion, applyAlternativeChanges, diffAuthorAlternative, forkAuthorAlternative, projectContent, recordAlternativeApplication } from '../domain/writingWorkspace';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { pinTrialRecord, startTrial } from '../domain/runtime';
import { replaySavedTraceVerified } from '../domain/runtimeVerified';
import type { Entity, ProjectData } from '../domain/types';
import { allKindsFixture } from '../testing/allKindsFixture';
import { ScenarioStore, type FaultStage } from './store';
import { exportScenario, inspectScenario } from './archive';
import { collectImportIds } from './importMapping';
import { projectWithRecoveryHistory } from './recovery';
import { jsonBytes, sha256 } from './json';

const stores: ScenarioStore[] = [];
function open(faultInjector?: (stage: FaultStage) => void, name = `rb06-${newId()}`) { const db = new ScenarioStore({ databaseName: name, accountId: 'local-fixture-account', faultInjector }); stores.push(db); return db; }
afterEach(async () => { for (const db of stores.splice(0)) await db.deleteDatabase(); });
function record(name: string, data: unknown) { const dir = '/tmp/shinariokanri-rb06-fixtures'; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2) + '\n'); }
async function basic(db: ScenarioStore, name = '復元元') { const p = createProject(name); p.entities.push(createEntity(p.projectId, 'scene', '原場面', { body: textToRichText('😀原段落を保持') })); return (await db.saveProject(p, { reason: '原作品を保存' })).project; }
function mapping(source: ProjectData, target: ProjectData) { return Object.fromEntries(collectImportIds(source).map(item => [item.id, item.id === source.projectId ? target.projectId : newId()])); }

describe('RB06 complete recovery and arbitrary historical selection', () => {
  it('preserves a declared item ID shared with runtime inventories through enumeration and clone recovery', async () => {
    const p = JSON.parse(readFileSync('tests/fixtures/rb05-reader-editions.json', 'utf8')).project as ProjectData;
    const prepared = await inspectScenario(await exportScenario(p), { worker: false });
    const item = p.entities.find(entity => entity.kind === 'item')!;
    expect(collectImportIds(prepared.project).filter(row => row.id === item.id)).toEqual([{ id: item.id, role: 'entity:item' }]);
    const db = open(), restored = await db.importScenario(prepared, { mode: 'clone' });
    const mappedItem = restored.idMap![item.id], trace = restored.project.entities.find(entity => entity.kind === 'trace')!;
    expect(trace.kind).toBe('trace');
    const archive = await inspectScenario(await db.exportProject(restored.project.projectId), { worker: false });
    expect(collectImportIds(archive.project).filter(row => row.id === mappedItem)).toEqual([{ id: mappedItem, role: 'entity:item' }]);
    expect(archive.project.entities.find(entity => entity.id === mappedItem)?.kind).toBe('item');
  });
  it('exports content, history and pending from one read image when another save completes during packaging', async () => {
    const db = open(), original = await basic(db), digest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void, entered!: () => void, hold = true;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { if (hold) { hold = false; entered(); await gate; } return digest(...args); });
    try {
      const exporting = db.exportProject(original.projectId); await waiting;
      const changed = (await db.saveProject({ ...original, name: '出力処理中の後続改訂' }, { reason: '後続の意図した保存' })).project;
      release(); const archived = await inspectScenario(await exporting, { worker: false });
      expect(archived.project).toEqual(original); expect(archived.recovery!.sourceRevision).toBe(original.revision);
      expect(archived.recovery!.pending.map(item => item.operationId)).toEqual(original.history.map(item => item.operationId));
      expect(await db.getProject(original.projectId)).toEqual(changed);
      const cancelled = new AbortController(); cancelled.abort(); await expect(db.exportProject(original.projectId, { signal: cancelled.signal })).rejects.toMatchObject({ code: 'CANCELLED' }); expect(await db.getProject(original.projectId)).toEqual(changed);
    } finally { release(); spy.mockRestore(); }
  });
  it('selects history older than fifty, distinguishes unit from whole, freezes approval and retains immutable editions', async () => {
    const db = open(); let p = await basic(db); const first = p.history[0], scene = p.entities[0];
    for (let index = 0; index < 71; index++) { p = { ...p, name: `改訂${index}` }; if (index === 70) p.entities[0].name = '現在の場面'; p = (await db.saveProject(p, { reason: `版作成${index}` })).project; }
    const fixed = await createWorldSnapshot(p, '後で公開した版'); p = (await db.saveProject(fixed, { reason: '公開固定版を保持' })).project;
    const oldest = await db.historyPage(p.projectId, { page: 2, size: 30 }), found = await db.historyPage(p.projectId, { query: first.operationId }); expect(oldest.entries.some(item => item.operationId === first.operationId)).toBe(true); expect(found.total).toBe(1); expect(found.entries[0].operationId).toBe(first.operationId);
    const whole = await db.previewRestoreVersion(p.projectId, first.operationId, 'after'), unit = await db.previewRestoreEntity(p.projectId, first.operationId, scene.id); p = (await db.saveProject({ ...p, name: '確認後の変更' }, { reason: '基底を進める' })).project;
    await expect(db.restoreHistoryVersion(p.projectId, whole)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); await expect(db.restoreEntity(p.projectId, first.operationId, scene.id, 'after', unit.project.revision)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const uiBytes = await db.exportProject(p.projectId); mkdirSync('/tmp/shinariokanri-rb06-fixtures', { recursive: true }); writeFileSync('/tmp/shinariokanri-rb06-fixtures/history-ui.scenario', uiBytes);
    const currentName = p.name; const restoredUnit = await db.restoreEntity(p.projectId, first.operationId, scene.id, 'after', p.revision); expect(restoredUnit.project.name).toBe(currentName);
    const confirmed = await db.previewRestoreVersion(p.projectId, first.operationId, 'after'), forged = { ...confirmed, changes: [] }; await expect(db.restoreHistoryVersion(p.projectId, forged)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const restored = (await db.restoreHistoryVersion(p.projectId, confirmed)).project; expect(restored.name).toBe('復元元'); expect(restored.snapshots).toEqual(p.snapshots); expect(restored.history).toHaveLength(76); expect((await db.getProject(restored.projectId))!.entities[0].data).toEqual(scene.data); record('history-old-and-frozen', { oldest, found, confirmed, restored });
  });

  it('atomically maps all source IDs into another project while preserving source timelines and portable pending origins', async () => {
    const source = open(), target = open(); let p = await basic(source), destination = await basic(target, '統合先');
    const branch = forkAuthorAlternative(p, '作者の別案'); p.authorAlternatives = [await sealAuthorAlternative(branch)]; p = (await source.saveProject(p, { reason: '元の別案分岐' })).project;
    const content = projectContent(branch.versions[0].content); content.entities[0].name = '別案の名称'; p.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(branch, content, '名称の提案'))]; p = (await source.saveProject(p, { reason: '別案改訂' })).project;
    const prepared = await inspectScenario(await source.exportProject(p.projectId), { worker: false }), idMap = mapping(projectWithRecoveryHistory(prepared.project, prepared.recovery), destination), preview = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap });
    expect(preview.mappedPlan!.unresolved).toEqual(['project.name']); const resolutions = Object.fromEntries(preview.conflicts.map(conflict => [conflict.id, 'existing' as const])); const approved = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap, resolutions });
    const result = await target.importScenario(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, baseRevision: destination.revision, idMap, resolutions, confirmationHash: approved.confirmationHash }); const loaded = (await target.getProject(destination.projectId))!;
    expect(result.project.projectId).toBe(destination.projectId); expect(validateProject(loaded).ok).toBe(true); expect(loaded.entities.find(item => item.id === idMap[p.entities[0].id])!.data).toEqual({ ...p.entities[0].data, body: (p.entities[0] as Entity<'scene'>).data.body.map(block => ({ ...block, id: idMap[block.id] })) });
    expect(loaded.authorAlternatives![0].versions).toHaveLength(2); expect(loaded.history.filter(command => command.importOrigin)).toHaveLength(p.history.length); expect((await target.listRecoveredPending(destination.projectId)).map(row => row.operation.origin!.operationId)).toEqual(p.history.map(command => command.operationId));
    const reopened = await inspectScenario(await target.exportProject(destination.projectId), { worker: false }), empty = open(); await empty.importScenario(reopened, { mode: 'new' }); expect((await empty.getProject(destination.projectId))!.history).toEqual(loaded.history); expect((await empty.listRecoveredPending(destination.projectId)).map(row => row.operation.origin!.operationId).slice(0, p.history.length)).toEqual(p.history.map(command => command.operationId)); record('mapped-merge-and-reexport', { idMap, approved, loaded, recovery: reopened.recovery });
  });

  it.each(['after-content', 'after-history', 'after-outbox', 'before-commit'] as const)('rolls back mapped content/history/worlds/assets/pending/point at %s', async stage => {
    const source = open(); const p = await basic(source), prepared = await inspectScenario(await source.exportProject(p.projectId), { worker: false }); let fail = false; const target = open(point => { if (fail && point === stage) throw new DOMException('fixture disk full', 'QuotaExceededError'); }), current = await basic(target, '保存済み作品'), idMap = mapping(projectWithRecoveryHistory(prepared.project, prepared.recovery), current);
    let preview = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: current.projectId, idMap }); const resolutions = Object.fromEntries(preview.conflicts.map(conflict => [conflict.id, 'existing' as const])); preview = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: current.projectId, idMap, resolutions }); fail = true;
    await expect(target.importScenario(prepared, { mode: 'mapped_merge', targetProjectId: current.projectId, baseRevision: current.revision, idMap, resolutions, confirmationHash: preview.confirmationHash })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' }); expect(await target.getProject(current.projectId)).toEqual(current); expect(await target.listRestorePoints(current.projectId)).toEqual([]); expect(await target.listRecoveredPending(current.projectId)).toEqual([]); expect(await target.listOutbox(current.projectId)).toHaveLength(1);
    fail = false; const result = await target.importScenario(prepared, { mode: 'mapped_merge', targetProjectId: current.projectId, baseRevision: current.revision, idMap, resolutions, confirmationHash: preview.confirmationHash }); expect(result.project.revision).toBe('2');
  });

  it('refuses missing, non-bijective or changed mappings and preserves the existing target and input after a concurrent edit', async () => {
    const source = open(), target = open(), p = await basic(source), destination = await basic(target), prepared = await inspectScenario(await source.exportProject(p.projectId), { worker: false }), idMap = mapping(projectWithRecoveryHistory(prepared.project, prepared.recovery), destination); const missing = { ...idMap }; delete missing[p.entities[0].id]; await expect(target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap: missing })).rejects.toThrow('全ローカルID');
    const collision = { ...idMap, [p.entities[0].id]: idMap[p.history[0].operationId] }; await expect(target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap: collision })).rejects.toThrow('一対一');
    let preview = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap }), resolutions = Object.fromEntries(preview.conflicts.map(conflict => [conflict.id, 'existing' as const])); preview = await target.previewImport(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, idMap, resolutions }); const changed = (await target.saveProject({ ...destination, name: '他の変更' }, { reason: '確認後の別保存' })).project;
    await expect(target.importScenario(prepared, { mode: 'mapped_merge', targetProjectId: destination.projectId, baseRevision: destination.revision, idMap, resolutions, confirmationHash: preview.confirmationHash })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); expect(await target.getProject(destination.projectId)).toEqual(changed); expect(idMap[p.projectId]).toBe(destination.projectId);
  });

  it('restores every kind, stable body IDs, selected immutable edition, transitive worlds, author receipts, bytes and ordered pending to empty and clone environments', async () => {
    const db = open(); let p = allKindsFixture(); const cp = p.entities.find(e => e.kind === 'checkpoint')!, trace = p.entities.find(e => e.kind === 'trace')!; p.entities = p.entities.filter(e => !['checkpoint', 'trace'].includes(e.kind)); const scene = p.entities.find((e): e is Entity<'scene'> => e.kind === 'scene')!, chapter = p.entities.find((e): e is Entity<'chapter'> => e.kind === 'chapter')!; scene.data.body = textToRichText('固定😀段落'); chapter.data.sceneIds = [scene.id]; scene.data.chapterId = chapter.id;
    const trial = startTrial(p), snapshotId = newId(), pinned = pinTrialRecord(trial, { checkpointId: cp.id, snapshotId }); p.entities.push({ ...createEntity(p.projectId, 'checkpoint', '開始状態', pinned.checkpoint), id: cp.id }, { ...createEntity(p.projectId, 'trace', '固定経路', pinned.trace), id: trace.id }); p.snapshots.push({ id: snapshotId, content: pinned.content, contentHash: await sha256(jsonBytes(pinned.content)), versionLabel: '実際の固定版', createdAt: '2026-10-08T00:00:00Z' });
    const bytes = new Uint8Array([137,80,78,71,13,10,26,10]), contentHash = await sha256(bytes), attachment = p.entities.find((e): e is Entity<'attachment'> => e.kind === 'attachment')!; attachment.data = { ...attachment.data, contentHash, assetPath: `assets/${contentHash}.png`, byteSize: bytes.length };
    // Complete this test fixture before sealing it with actual material metadata.
    const old = pinned.content.entities.find((e): e is Entity<'attachment'> => e.kind === 'attachment')!; old.data = { ...old.data, ...attachment.data }; p.snapshots[0].contentHash = await sha256(jsonBytes(pinned.content));
    const deep = createProject('依存世界'); deep.entities.push(createEntity(deep.projectId, 'place', '基層の場所')); const inner = await createWorldSnapshot(deep, '基層版'), outer = createProject('外側世界'); outer.worldReferences = [{ projectId: inner.projectId, immutableSnapshotId: inner.snapshots[0].id, contentHash: inner.snapshots[0].contentHash }]; const fixed = await createWorldSnapshot(outer, '外側版'), worlds = { [inner.snapshots[0].id]: inner, [fixed.snapshots[0].id]: fixed }; p.worldReferences = [{ projectId: fixed.projectId, immutableSnapshotId: fixed.snapshots[0].id, contentHash: fixed.snapshots[0].contentHash }];
    // Install through the same verified atomic world-pin API as normal authoring.
    p = (await db.saveProject(p, { reason: '全種類と固定経路を保存', worldPin: { world: fixed, snapshotId: fixed.snapshots[0].id, dependencies: worlds }, assets: [{ contentHash, bytes, mediaType: 'image/png' }] })).project;
    const branch = forkAuthorAlternative(p, '作者案'), alternativeContent = projectContent(branch.versions[0].content); alternativeContent.entities.find(e => e.id === scene.id)!.name = '採用候補の場面'; p.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(branch, alternativeContent, '名称の案'))]; p = (await db.saveProject(p, { reason: '作者案を保存' })).project;
    const alternative = p.authorAlternatives![0], changes = diffAuthorAlternative(alternative, p), selected = new Set(changes.filter(change => change.itemId === scene.id).map(change => change.key)), adopted = applyAlternativeChanges(p, alternative, changes, selected); adopted.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(alternative, adopted.receipt, String(BigInt(p.revision)+1n)))]; p = (await db.saveProject(adopted.project, { reason: '選んだ案を採用' })).project;
    const prepared = await inspectScenario(await db.exportProject(p.projectId), { worker: false }); expect(prepared.recovery!.pending.map(item => item.operationId)).toEqual(p.history.map(item => item.operationId)); expect(Object.keys(prepared.worlds)).toHaveLength(2); const empty = open(); await empty.importScenario(prepared, { mode: 'new' }); expect(await empty.getProject(p.projectId)).toEqual(p); expect(await empty.getAsset(contentHash)).toEqual(bytes); expect(new Set((await empty.getProject(p.projectId))!.entities.map(e => e.kind))).toEqual(new Set(ENTITY_KINDS)); expect((await replaySavedTraceVerified(p, trace.id, worlds)).status).toBe('ready');
    const clone = await empty.importScenario(prepared, { mode: 'clone' }); const clonedTrace = clone.project.entities.find(e => e.id === clone.idMap![trace.id])!; expect(clonedTrace.kind).toBe('trace'); expect((await replaySavedTraceVerified(clone.project, clonedTrace.id, prepared.worlds)).status).toBe('ready'); expect(clone.project.authorAlternatives![0].applyReceipts).toHaveLength(1); expect((await empty.listRecoveredPending(clone.project.projectId)).map(row => row.operation.origin!.operationId)).toEqual(p.history.map(item => item.operationId)); record('all-kind-empty-clone', { p, summary: prepared.summary, recovery: prepared.recovery, clone });
    // Budget the entire multi-operation fixture; product operation p95 limits are measured separately.
  }, 30_000);

  it('opens genuine old 1.0 fixtures without new optional fields and preserves old replay, while unknown feature or pending hash refuses mutation', async () => {
    const path = 'docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario', bytes = new Uint8Array(readFileSync(path)), original = await inspectScenario(bytes, { worker: false }), db = open(); await db.importScenario(original, { mode: 'new' }); const trace = original.project.entities.find(e => e.kind === 'trace')!; expect((await replaySavedTraceVerified((await db.getProject(original.project.projectId))!, trace.id)).status).toBe('terminal'); const old = await db.getProject(original.project.projectId);
    const files = unzipSync(bytes), manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])); manifest.requiredFeatures = [...(manifest.requiredFeatures ?? []), 'unknown-future-v9']; files['manifest.json'] = new Uint8Array(jsonBytes(manifest)); await expect(inspectScenario(zipSync(files), { worker: false })).rejects.toThrow(); expect(await db.getProject(original.project.projectId)).toEqual(old);
    const prepared = await inspectScenario(await db.exportProject(original.project.projectId), { worker: false }); prepared.recovery!.pending[0].commandHash = '0'.repeat(64); await expect(db.importScenario(prepared, { mode: 'clone' })).rejects.toThrow('hash'); expect((await db.listProjects()).length).toBe(1); record('genuine-old-format', { sourceSha256: await sha256(bytes), original: original.manifest, replay: await replaySavedTraceVerified(old!, trace.id) });
  });

  it('retains native file and mapping drafts across restart, and freezes migration restore-point approval', async () => {
    const name = `draft-${newId()}`, db = open(undefined, name), p = await basic(db), bytes = await db.exportProject(p.projectId), sourceHash = await sha256(bytes), idMap = { [p.projectId]: p.projectId }; await db.saveImportDraft({ key: p.projectId, bytes, sourceHash, mode: 'mapped_merge', targetProjectId: p.projectId, idMap, resolutions: {} }); await db.saveImportDraft({ key: p.projectId, sourceHash, mode: 'mapped_merge', targetProjectId: p.projectId, idMap, resolutions: {} }); db.close(); const reopened = open(undefined, name), draft = await reopened.getImportDraft(p.projectId); expect(draft!.bytes).toEqual(bytes); expect(draft!.idMap).toEqual(idMap);
    await expect(reopened.migrateProject(p.projectId, value => ({ ...value, mainStart: '-0' }))).rejects.toThrow(); const point = (await reopened.restorePointPage(p.projectId)).entries[0], preview = await reopened.previewRestorePoint(p.projectId, point.id); const current = (await reopened.getProject(p.projectId))!; await reopened.saveProject({ ...current, name: '移行確認後の改訂' }, { reason: '基底更新' }); await expect(reopened.restorePoint(p.projectId, point.id, preview)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); expect((await reopened.getProject(p.projectId))!.name).toBe('移行確認後の改訂');
    const confirmed = await reopened.previewRestorePoint(p.projectId, point.id); const restored = await reopened.restorePoint(p.projectId, point.id, confirmed); expect(restored.project.name).toBe(p.name); expect((await reopened.listOutbox(p.projectId)).length).toBe(3); record('draft-and-migration-point', { draft: { ...draft, bytes: undefined }, confirmed, restored });
  });

  it('upgrades a v1 database with genuine old native content by appending operational tables without changing saved IDs or replay', async () => {
    const bytes = new Uint8Array(readFileSync('docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario')), { project: p } = await inspectScenario(bytes, { worker: false }), name = `v1-upgrade-${newId()}`, old = new Dexie(name);
    old.version(1).stores({ projects: 'projectId,name', entities: '[projectId+id],projectId,[projectId+kind]', relations: '[projectId+id],projectId,[projectId+fromId],[projectId+toId]', blocks: '[projectId+id],projectId,[projectId+entityId]', snapshots: '[projectId+id],projectId', commands: 'operationId,projectId,[projectId+revision]', outbox: 'operationId,projectId,accountId', assets: 'contentHash', views: '[projectId+id],projectId', viewStates: 'key,projectId', syncMetadata: 'projectId', acks: 'operationId,projectId', restorePoints: 'id,projectId,createdAt', worlds: 'id', importLogs: 'operationId,projectId' });
    await old.open(); const { entities, relations, snapshots, history, views, ...header } = p;
    await old.transaction('rw', old.tables, async () => { await old.table('projects').put({ ...header, entityIds: entities.map(item => item.id), relationIds: relations.map(item => item.id), snapshotIds: snapshots.map(item => item.id), historyIds: history.map(item => item.operationId), viewIds: views.map(item => item.id) }); await old.table('entities').bulkPut(entities.map(entity => ({ id: entity.id, projectId: p.projectId, kind: entity.kind, record: entity }))); if (relations.length) await old.table('relations').bulkPut(relations); if (snapshots.length) await old.table('snapshots').bulkPut(snapshots.map(snapshot => ({ ...snapshot, projectId: p.projectId }))); if (history.length) await old.table('commands').bulkPut(history.map(command => ({ operationId: command.operationId, projectId: p.projectId, revision: command.revision, record: command }))); if (views.length) await old.table('views').bulkPut(views.map(view => ({ ...view, projectId: p.projectId }))); await old.table('syncMetadata').put({ projectId: p.projectId, serverRevision: p.revision, state: 'synced' }); }); old.close();
    const upgraded = open(undefined, name), loaded = (await upgraded.getProject(p.projectId))!, trace = loaded.entities.find(item => item.kind === 'trace')!; expect(loaded).toEqual(p); expect((await replaySavedTraceVerified(loaded, trace.id)).status).toBe('terminal'); expect(await upgraded.listRecoveredPending(p.projectId)).toEqual([]); expect(await upgraded.getImportDraft(p.projectId)).toBeUndefined();
    await upgraded.saveImportDraft({ key: p.projectId, bytes, sourceHash: await sha256(bytes), mode: 'clone', targetProjectId: '', idMap: {}, resolutions: {} }); upgraded.close(); const reopened = open(undefined, name); expect(await reopened.getProject(p.projectId)).toEqual(p); expect((await reopened.getImportDraft(p.projectId))!.bytes).toEqual(bytes); record('v1-additive-upgrade', { sourceSha256: await sha256(bytes), p, upgraded: loaded });
  });
});
