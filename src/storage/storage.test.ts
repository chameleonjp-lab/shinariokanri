import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { zipSync, unzipSync } from 'fflate';
import { createEntity, createProject, newId, textToRichText, validateProject } from '../domain/model';
import { dialogueContentHash } from '../domain/production';
import type { Entity, ProjectData, ProjectSnapshot } from '../domain/types';
import { exportScenario, inspectScenario, type PreparedScenario } from './archive';
import { canonicalCode, StorageError } from './errors';
import { ARCHIVE_LIMITS, canonicalJson, jsonBytes, parseStrictJson, sha256 } from './json';
import { ScenarioStore, cloneProject, type FaultStage } from './store';

const stores: ScenarioStore[] = [];
const importLimits = () => ({ ...ARCHIVE_LIMITS });
const store = (faultInjector?: (stage: FaultStage) => void, databaseName = `storage-test-${newId()}`) => {
  const value = new ScenarioStore({ databaseName, faultInjector }); stores.push(value); return value;
};
afterEach(async () => { for (const value of stores.splice(0)) await value.deleteDatabase(); });

function fixture(): ProjectData {
  const project = createProject('原文を保つ作品');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const note = createEntity(project.projectId, 'note', 'リンク付きメモ', { body: textToRichText('人物Aは鍵を探す。\n𠮷野の塔') });
  note.data.body[0].links = [{ start: 0, end: 3, target: { entityId: character.id } }];
  const event = createEntity(project.projectId, 'event', '遠い過去', { time: { mode: 'instant', at: '-12345678901234567890123456789012345678', calendarId: project.calendarId } });
  project.entities = [character, note, event];
  return project;
}
async function snapshot(project: ProjectData): Promise<ProjectSnapshot> {
  const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
  return { id: newId(), createdAt: new Date().toISOString(), versionLabel: '公開1', contentHash: await sha256(jsonBytes(content)), content };
}
async function prepared(project: ProjectData): Promise<PreparedScenario> { return inspectScenario(await exportScenario(project), { worker: false }); }
async function rewriteArchive(bytes: Uint8Array, mutate: (files: Record<string, Uint8Array>, manifest: Record<string, unknown>) => void): Promise<Uint8Array> {
  const files = unzipSync(bytes), manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as Record<string, unknown>;
  mutate(files, manifest); files['manifest.json'] = jsonBytes(manifest).slice(); return zipSync(files, { level: 0 });
}

describe('atomic IndexedDB commands', () => {
  it('hydrates private cold rows without changing stored blocks, drafts or fixed snapshots', async () => {
    const name = `private-hydration-${newId()}`, first = store(undefined, name), project = fixture();
    project.snapshots.push(await snapshot(project));
    const saved = (await first.saveProject(project, { reason: '本文と固定版' })).project;
    first.close();
    const raw = new Dexie(name); await raw.open();
    const durable = async () => sha256(jsonBytes({ entities: await raw.table('entities').toArray(), blocks: await raw.table('blocks').toArray() }));
    try {
      const before = await durable(), cold = store(undefined, name);
      const draft = (await cold.getProjectForEditing(project.projectId))!;
      expect(draft.entities).toEqual(saved.entities); expect(draft.snapshots).toEqual(saved.snapshots);
      const note = draft.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!;
      note.data.body[0].text = '保存していない入力';
      const again = (await cold.getProjectForEditing(project.projectId))!;
      expect(again.entities).toEqual(saved.entities); expect(again.snapshots).toEqual(saved.snapshots);
      expect(await durable()).toBe(before);
      cold.close();
      const restarted = store(undefined, name);
      expect(await restarted.getProject(project.projectId)).toEqual(saved);
      const archive = await inspectScenario(await restarted.exportProject(project.projectId), { worker: false });
      expect(archive.project).toEqual(saved);
      expect(await durable()).toBe(before);
    } finally { raw.close(); }
  });
  it('persists stable IDs, links, original text and huge negative ticks across restart; undo appends history', async () => {
    const dbName = `restart-${newId()}`, first = store(undefined, dbName);
    const initial = (await first.saveProject(fixture(), { reason: '作成' })).project;
    const id = initial.entities[0].id, renamed = structuredClone(initial); renamed.entities[0].name = '改名後';
    const second = await first.saveProject(renamed, { reason: '改名' });
    expect(second.project.revision).toBe('2'); expect(second.project.entities[0].revision).toBe('1');
    const undone = await first.undo(initial.projectId);
    expect(undone.project.entities[0].name).toBe('アオ'); expect(undone.project.entities[0].id).toBe(id);
    expect(undone.project.revision).toBe('3'); expect(undone.project.history).toHaveLength(3);
    expect(undone.project.history[2].compensatesOperationId).toBe(second.operationId);
    first.close();
    const restarted = store(undefined, dbName), loaded = await restarted.getProject(initial.projectId);
    expect(loaded).toEqual(undone.project);
    const note = loaded!.entities.find((entity): entity is Entity<'note'> => entity.kind === 'note')!;
    expect(note.data.body[0].links![0].target.entityId).toBe(id);
    expect(note.data.body[1].text).toBe('𠮷野の塔');
    expect((loaded!.entities[2] as Entity<'event'>).data.time).toEqual((initial.entities[2] as Entity<'event'>).data.time);
    expect(await restarted.getSaveState(initial.projectId)).toMatchObject({ localSaved: true, pendingCount: 3, syncState: 'pending', serverRevision: '0' });
  });

  it.each<FaultStage>(['after-content', 'after-history', 'after-outbox', 'before-commit'])('rolls back content, blocks, history and outbox after a quota failure at %s', async stage => {
    let failing = false;
    const db = store(point => { if (failing && point === stage) throw new DOMException('disk quota', 'QuotaExceededError'); });
    const before = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    const draft = structuredClone(before); draft.name = '未保存の変更'; draft.entities[0].name = '消さない入力'; failing = true;
    await expect(db.saveProject(draft, { reason: '二対象変更' })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await db.getProject(before.projectId)).toEqual(before);
    expect(await db.listOutbox(before.projectId)).toHaveLength(1);
    expect(draft.name).toBe('未保存の変更');
    failing = false; expect((await db.saveProject(draft, { reason: '再試行' })).project.name).toBe(draft.name);
  });

  it('makes operation replay idempotent and rejects a reused operation ID or stale base', async () => {
    const db = store(), project = fixture(), operationId = newId();
    const first = await db.saveProject(project, { reason: '作成', operationId });
    expect(await db.saveProject(project, { reason: '作成', operationId })).toEqual(first);
    expect(await db.listHistory(project.projectId)).toHaveLength(1); expect(await db.listOutbox(project.projectId)).toHaveLength(1);
    await expect(db.saveProject({ ...project, name: '別の変更' }, { reason: '作成', operationId })).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    await expect(db.saveProject(project, { reason: '古い入力' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('compensates an older independent entity edit without reverting a later entity; rejects overlapping undo', async () => {
    const db = store(); let project = (await db.saveProject(fixture(), { reason: '作成' })).project;
    project.entities[0].name = '人物変更'; const rename = await db.saveProject(project, { reason: '人物改名' });
    project = structuredClone(rename.project); project.entities[1].name = '後からメモ改名'; project = (await db.saveProject(project, { reason: 'メモ改名' })).project;
    const undone = (await db.undo(project.projectId, rename.operationId)).project;
    expect(undone.entities[0].name).toBe('アオ'); expect(undone.entities[1].name).toBe('後からメモ改名');
    await expect(db.undo(project.projectId, rename.operationId)).rejects.toMatchObject({ code: 'RESTORE_CONFLICT' });
  });

  it('keeps deleted IDs as tombstones and restores historical entities in a new revision', async () => {
    const db = store(); let project = (await db.saveProject(fixture(), { reason: '作成' })).project;
    const id = project.entities[2].id, initialOperation = project.history[0].operationId;
    project.entities = project.entities.slice(0, 2); project = (await db.saveProject(project, { reason: '出来事削除' })).project;
    expect(project.entities.find(entity => entity.id === id)).toMatchObject({ deletedAt: expect.any(String), deletionOperationId: project.history[1].operationId });
    const restored = (await db.restoreEntity(project.projectId, initialOperation, id)).project;
    expect(restored.revision).toBe('3'); expect(restored.entities.find(entity => entity.id === id)?.deletedAt).toBeFalsy(); expect(restored.history).toHaveLength(3);
  });

  it('retains a migration recovery point and current content when transformation or validation fails', async () => {
    const db = store(), project = (await db.saveProject(fixture(), { reason: '作成' })).project;
    await expect(db.migrateProject(project.projectId, draft => { draft.name = '中途半端'; throw new Error('conversion failed'); })).rejects.toThrow('conversion failed');
    expect(await db.getProject(project.projectId)).toEqual(project); expect(await db.listRestorePoints(project.projectId)).toHaveLength(1);
    await expect(db.migrateProject(project.projectId, draft => ({ ...draft, mainStart: '-0' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await db.getProject(project.projectId)).toEqual(project); expect(await db.listRestorePoints(project.projectId)).toHaveLength(2);
  });

  it('saves attachment bytes and metadata in the same transaction', async () => {
    let failing = false; const db = store(stage => { if (failing && stage === 'after-content') throw new Error('injected'); });
    const project = (await db.saveProject(fixture(), { reason: '作成' })).project;
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), contentHash = await sha256(bytes), path = `assets/${contentHash}.png`;
    const draft = structuredClone(project); draft.entities.push(createEntity(project.projectId, 'attachment', '画像', { contentHash, mediaType: 'image/png', byteSize: bytes.length, assetPath: path }));
    failing = true;
    await expect(db.saveProject(draft, { reason: '添付', assets: [{ contentHash, bytes, mediaType: 'image/png', assetPath: path }] })).rejects.toMatchObject({ code: 'SAVE_FAILED' });
    expect(await db.getAsset(contentHash)).toBeUndefined(); expect(await db.getProject(project.projectId)).toEqual(project);
    failing = false; await db.saveProject(draft, { reason: '添付再試行', assets: [{ contentHash, bytes, mediaType: 'image/png', assetPath: path }] });
    expect(await db.getAsset(contentHash)).toEqual(bytes);
    const exported = await db.exportProject(project.projectId), inspected = await inspectScenario(exported, { worker: false }); expect(inspected.assets[0].bytes).toEqual(bytes);
  });

  it('updates translation review state atomically with line content but preserves its approved source hash', async () => {
    const db = store(), project = createProject('翻訳');
    const line = createEntity(project.projectId, 'dialogue_line', '', { text: textToRichText('元の台詞') }); project.entities.push(line);
    const sourceHash = await dialogueContentHash(project, line), translation = createEntity(project.projectId, 'localization', '英語', { sourceLineId: line.id, language: 'en', sourceHash, text: textToRichText('Original'), stage: 'reviewed' }); project.entities.push(translation);
    const first = (await db.saveProject(project, { reason: '作成' })).project;
    const draft = structuredClone(first), target = draft.entities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line')!; target.data.text[0].text = '改訂された台詞';
    const saved = (await db.saveProject(draft, { reason: '台詞改訂' })).project;
    const localized = saved.entities.find((entity): entity is Entity<'localization'> => entity.kind === 'localization')!;
    expect(localized.data.stage).toBe('needs_review'); expect(localized.data.sourceHash).toBe(sourceHash); expect(localized.revision).toBe('1');
  });

  it('keeps immutable versions and resolves a historical snapshot rather than live content', async () => {
    const db = store(); let project = (await db.saveProject(fixture(), { reason: '作成' })).project;
    const version = await snapshot(project); project.snapshots.push(version); project = (await db.saveProject(project, { reason: '公開版固定' })).project;
    project.entities[0].name = '現行版の改名'; project = (await db.saveProject(project, { reason: '現行編集' })).project;
    expect((await db.getProjectAtSnapshot(project.projectId, version.id))!.entities[0].name).toBe('アオ');
    const archive = await inspectScenario(await db.exportProject(project.projectId, { snapshotId: version.id }), { worker: false });
    expect(archive.manifest.snapshotId).toBe(version.id); expect(archive.project.entities[0].name).toBe('アオ');
    await expect(exportScenario(project, { snapshotId: version.id })).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    const bad = structuredClone(project); bad.snapshots[0].versionLabel = '書き換え';
    await expect(db.saveProject(bad, { reason: '公開版改竄' })).rejects.toMatchObject({ code: 'IMMUTABLE_SNAPSHOT' });
  });

  it('restores a full revision or migration recovery point as a new command while retaining later immutable versions', async () => {
    const db = store(); let project = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    const point = await db.createRestorePoint(project.projectId, '移行前');
    project.entities[0].name = '新しい名前'; project.snapshots.push(await snapshot(project)); project = (await db.saveProject(project, { reason: '変更と公開版固定' })).project;
    const restored = (await db.restoreRevision(project.projectId, '1')).project;
    expect(restored.entities[0].name).toBe('アオ'); expect(restored.snapshots).toHaveLength(1); expect(restored.revision).toBe('3');
    restored.name = '現在の作品名'; const changed = (await db.saveProject(restored, { reason: '作品名変更' })).project;
    const recovered = (await db.restorePoint(changed.projectId, point.id)).project;
    expect(recovered.name).toBe(point.project.name); expect(recovered.snapshots).toHaveLength(1); expect(recovered.revision).toBe('5'); expect(recovered.history).toHaveLength(5);
  });

  it('commits ack and confirmed revision before removing outbox and keeps conflict operations', async () => {
    const db = store(), saved = await db.saveProject(fixture(), { reason: '作成' });
    const ack = { operationId: saved.operationId, projectId: saved.project.projectId, serverRevision: '5', status: 'applied' as const };
    await db.commitAck(saved.project.projectId, ack); await db.commitAck(saved.project.projectId, ack);
    expect(await db.listOutbox(saved.project.projectId)).toHaveLength(0); expect(await db.getSaveState(saved.project.projectId)).toMatchObject({ serverRevision: '5', syncState: 'synced' });
    const edited = await db.saveProject({ ...saved.project, name: '変更' }, { reason: '変更' });
    await db.commitAck(saved.project.projectId, { operationId: edited.operationId, projectId: saved.project.projectId, serverRevision: '6', status: 'conflict', payload: { commonBase: '保持する' } });
    expect(await db.listOutbox(saved.project.projectId)).toHaveLength(1); expect(await db.getSaveState(saved.project.projectId)).toMatchObject({ syncState: 'conflict' });
  });
});

describe('scenario container quarantine and recovery', () => {
  it('remaps schema-declared raw references and runtime ID maps while keeping custom field keys and random seeds literal', async () => {
    const project = fixture(), characterId = project.entities[0].id;
    project.entities[0].customValues[characterId] = characterId;
    project.entities.push(createEntity(project.projectId, 'assertion', '参照の設定', { subjectId: characterId, predicate: 'related', value: characterId, truthKind: 'author_truth' }));
    project.entities.push(createEntity(project.projectId, 'review', '人物の指摘', { target: characterId, targetVersionId: project.projectId, body: textToRichText('原文') }));
    project.entities.push(createEntity(project.projectId, 'checkpoint', '途中開始', { contentVersionId: project.projectId, runtimeState: {
      contentVersionId: project.projectId, variableValues: {}, itemInstances: [], assertions: [], seenIds: [characterId], visitCounts: { [characterId]: 2 },
      onceTriggers: [`${characterId}@run`], rngSeed: characterId, rngPosition: 2, callStack: [], presentationPosition: null, loopNumber: 1, provenance: 'imported',
    } }));
    const { project: cloned, idMap } = await cloneProject(project);
    expect((cloned.entities.find(entity => entity.kind === 'assertion') as Entity<'assertion'>).data.value).toBe(idMap[characterId]);
    expect((cloned.entities.find(entity => entity.kind === 'review') as Entity<'review'>).data.target).toBe(idMap[characterId]);
    expect(cloned.entities[0].customValues).toEqual({ [characterId]: characterId });
    const checkpoint = cloned.entities.find((entity): entity is Entity<'checkpoint'> => entity.kind === 'checkpoint')!;
    expect(checkpoint.data.runtimeState.visitCounts).toEqual({ [idMap[characterId]]: 2 });
    expect(checkpoint.data.runtimeState.onceTriggers).toEqual([`${idMap[characterId]}@run`]); expect(checkpoint.data.runtimeState.rngSeed).toBe(characterId);
    expect(validateProject(cloned).ok).toBe(true);
  });

  it('validates cross-world entity links against the pinned version separately for live and historical contents', async () => {
    const world = createProject('世界'), character = createEntity(world.projectId, 'character', '旧版の人物'); world.entities.push(character);
    const oldWorld = await snapshot(world); world.snapshots.push(oldWorld);
    const project = createProject('世界を利用');
    project.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: oldWorld.id, contentHash: oldWorld.contentHash });
    const note = createEntity(project.projectId, 'note', '世界へのリンク', { body: textToRichText('人物へ') });
    note.data.body[0].links = [{ start: 0, end: 2, target: { entityId: character.id } }]; project.entities.push(note);
    const oldProject = await snapshot(project); project.snapshots.push(oldProject);
    world.entities[0].name = '新版の人物'; const newWorld = await snapshot(world); world.snapshots.push(newWorld);
    project.worldReferences = [{ projectId: world.projectId, immutableSnapshotId: newWorld.id, contentHash: newWorld.contentHash }];
    const worlds = { [oldWorld.id]: world, [newWorld.id]: world };
    const archive = await exportScenario(project, { worlds }), inspection = await inspectScenario(archive, { worker: false });
    const db = store(); const imported = await db.importScenario(inspection, { mode: 'new' });
    const edited = await db.saveProject({ ...imported.project, name: '編集後' }, { reason: '共通世界のリンクを保持して編集' });
    expect(edited.project.snapshots[0].content.worldReferences[0].immutableSnapshotId).toBe(oldWorld.id);
    expect(edited.project.worldReferences[0].immutableSnapshotId).toBe(newWorld.id);
    expect((await inspectScenario(await db.exportProject(project.projectId), { worker: false })).project.entities[0]).toEqual(edited.project.entities[0]);
  });

  it('requires historically pinned worlds and preserves them when the current version no longer references the world', async () => {
    const world = createProject('共通世界'), worldSnapshot = await snapshot(world); world.snapshots.push(worldSnapshot);
    const project = createProject('現在版'), past = structuredClone(project);
    past.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: worldSnapshot.id, contentHash: worldSnapshot.contentHash });
    project.snapshots.push(await snapshot(past));
    await expect(exportScenario(project)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const archive = await exportScenario(project, { worlds: { [worldSnapshot.id]: world } });
    const inspection = await inspectScenario(archive, { worker: false }); expect(Object.keys(inspection.worlds)).toEqual([worldSnapshot.id]);
    const db = store(); await db.importScenario(inspection, { mode: 'new' });
    expect(Object.keys((await inspectScenario(await db.exportProject(project.projectId), { worker: false })).worlds)).toEqual([worldSnapshot.id]);
  });

  it('refuses inconsistent attachment metadata across a project and pinned world before generating an unrecoverable archive', async () => {
    const bytes = new Uint8Array([1, 2, 3]), contentHash = await sha256(bytes), path = `assets/${contentHash}.bin`;
    const project = createProject('作品'), world = createProject('世界');
    project.entities.push(createEntity(project.projectId, 'attachment', '素材', { mediaType: 'application/octet-stream', contentHash, byteSize: 3, assetPath: path }));
    world.entities.push(createEntity(world.projectId, 'attachment', '同hash別サイズ', { mediaType: 'application/octet-stream', contentHash, byteSize: 4, assetPath: path }));
    const version = await snapshot(world); world.snapshots.push(version);
    project.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: version.id, contentHash: version.contentHash });
    await expect(exportScenario(project, { worlds: { [version.id]: world }, loadAsset: () => bytes })).rejects.toMatchObject({ code: 'ASSET_INVALID' });
  });

  it('round trips content, history, stable IDs, snapshots and original asset bytes into an empty DB', async () => {
    const source = store(), destination = store(); let project = (await source.saveProject(fixture(), { reason: '作成' })).project;
    project.snapshots.push(await snapshot(project)); project = (await source.saveProject(project, { reason: '版固定' })).project;
    const inspection = await inspectScenario(await source.exportProject(project.projectId), { worker: false });
    const restored = await destination.importScenario(inspection, { mode: 'new' }); expect(restored.project).toEqual(project);
    expect(await destination.getProject(project.projectId)).toEqual(project); expect(await destination.listOutbox(project.projectId)).toHaveLength(1);
  });

  it('refuses a missing attachment for full export and labels metadata-only recovery', async () => {
    const project = fixture(), bytes = new Uint8Array([1, 2, 3]), contentHash = await sha256(bytes);
    project.entities.push(createEntity(project.projectId, 'attachment', '未取得', { mediaType: 'application/octet-stream', contentHash, byteSize: bytes.length, assetPath: `assets/${contentHash}.bin` }));
    await expect(exportScenario(project)).rejects.toMatchObject({ code: 'ASSET_MISSING' });
    const inspected = await inspectScenario(await exportScenario(project, { assetMode: 'metadata_only' }), { worker: false });
    expect(inspected.summary.missingAssets).toBe(1); expect(inspected.warnings[0]).toContain('完全バックアップ');
  });

  it('clones all structured IDs/references including blocks, operations and snapshots while preserving UUID-shaped prose', async () => {
    const project = fixture(), characterId = project.entities[0].id;
    (project.entities[1] as Entity<'note'>).data.body[1].text = characterId;
    project.snapshots.push(await snapshot(project));
    const { project: cloned, idMap } = await cloneProject(project);
    expect(cloned.projectId).not.toBe(project.projectId); expect(cloned.entities[0].id).toBe(idMap[characterId]);
    const note = cloned.entities[1] as Entity<'note'>;
    expect(note.data.body[0].links![0].target.entityId).toBe(idMap[characterId]); expect(note.data.body[1].text).toBe(characterId);
    expect(note.data.body[0].id).not.toBe((project.entities[1] as Entity<'note'>).data.body[0].id);
    expect(cloned.snapshots[0].contentHash).toBe(await sha256(jsonBytes(cloned.snapshots[0].content))); expect(validateProject(cloned).ok).toBe(true);
    const db = store(); await db.importScenario(await prepared(project), { mode: 'new' });
    const result = await db.importScenario(await prepared(project), { mode: 'clone' }); expect(result.idMap).toBeDefined(); expect(await db.listProjects()).toHaveLength(2);
    expect(result.project.history.at(-1)!.idMap).toEqual(result.idMap);
    const reexported = await inspectScenario(await db.exportProject(result.project.projectId), { worker: false });
    expect(reexported.project.history.at(-1)!.idMap).toEqual(result.idMap);
  });

  it('refuses overwrite on new recovery and replacement with pending edits; requires a reviewed target revision', async () => {
    const db = store(), input = await prepared(fixture()); const restored = await db.importScenario(input, { mode: 'new' });
    await expect(db.importScenario(input, { mode: 'new' })).rejects.toMatchObject({ code: 'IMPORT_CONFLICT' });
    await expect(db.importScenario(input, { mode: 'replace', baseRevision: restored.project.revision })).rejects.toMatchObject({ code: 'PENDING_CHANGES' });
    await db.commitAck(input.project.projectId, { operationId: restored.operationId, projectId: input.project.projectId, serverRevision: '1', status: 'applied' });
    await expect(db.importScenario(input, { mode: 'replace' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const result = await db.importScenario(input, { mode: 'replace', baseRevision: restored.project.revision }); expect(result.restorePointId).toBeDefined(); expect(await db.listRestorePoints(input.project.projectId)).toHaveLength(1);
  });

  it('presents same-ID different-content merge conflicts and rolls back a failed import', async () => {
    let failing = false; const db = store(stage => { if (failing && stage === 'after-outbox') throw new Error('import write failure'); });
    const input = await prepared(fixture()), restored = await db.importScenario(input, { mode: 'new' });
    const next = structuredClone(input); next.project.entities[0].name = '別の人物名';
    const preview = await db.previewImport(next, { mode: 'merge' }); expect(preview.conflicts.map(item => item.id)).toContain(input.project.entities[0].id);
    await expect(db.importScenario(next, { mode: 'merge', baseRevision: restored.project.revision })).rejects.toMatchObject({ code: 'IMPORT_CONFLICT' });
    failing = true;
    await expect(db.importScenario(next, { mode: 'merge', baseRevision: restored.project.revision, resolutions: { [input.project.entities[0].id]: 'incoming' } })).rejects.toMatchObject({ code: 'SAVE_FAILED' });
    expect(await db.getProject(input.project.projectId)).toEqual(restored.project); expect(await db.listRestorePoints(input.project.projectId)).toHaveLength(0); expect(await db.listOutbox(input.project.projectId)).toHaveLength(1);
  });

  it('rejects hash corruption, missing manifest files, unsupported versions and required features before any write', async () => {
    const bytes = await exportScenario(fixture()), db = store(), before = (await db.saveProject(fixture(), { reason: '既存作品' })).project;
    const variants = [
      await rewriteArchive(bytes, (files) => { files['data/project.json'][4] ^= 1; }),
      await rewriteArchive(bytes, (files) => { delete files['data/project.json']; }),
      await rewriteArchive(bytes, (_files, manifest) => { manifest.formatVersion = '2.0.0'; }),
      await rewriteArchive(bytes, (_files, manifest) => { manifest.requiredFeatures = ['run_arbitrary_code']; }),
    ];
    for (const archive of variants) await expect(inspectScenario(archive, { worker: false })).rejects.toBeInstanceOf(StorageError);
    expect(await db.getProject(before.projectId)).toEqual(before); expect(await db.listProjects()).toHaveLength(1);
  });

  it.each(['../project.json', '/data/project.json', 'data\\project.json', 'C:/project.json', 'data/./project.json', 'data/a/../../project.json'])('rejects unsafe path %s', async path => {
    const files = unzipSync(await exportScenario(fixture())); files[path] = new Uint8Array([1]);
    await expect(inspectScenario(zipSync(files), { worker: false })).rejects.toMatchObject({ code: 'UNSAFE_PATH', path });
  });

  it('rejects encryption and Unix symlinks from ZIP metadata', async () => {
    const files = unzipSync(await exportScenario(fixture())), symlink = zipSync({ 'manifest.json': [files['manifest.json'], { os: 3, attrs: 0xa1ff << 16 }], 'data/project.json': files['data/project.json'] });
    await expect(inspectScenario(symlink, { worker: false })).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' });
    const encrypted = zipSync(files), view = new DataView(encrypted.buffer);
    for (let offset = 0; offset + 46 < encrypted.length; offset++) if (view.getUint32(offset, true) === 0x02014b50) { view.setUint16(offset + 8, view.getUint16(offset + 8, true) | 1, true); break; }
    await expect(inspectScenario(encrypted, { worker: false })).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' });
  });

  it('rejects duplicate ZIP names before extraction and counts JSON objects across file boundaries', async () => {
    const first = 'a'.repeat(64), second = 'b'.repeat(64), archive = zipSync({ 'manifest.json': jsonBytes({}), 'data/project.json': jsonBytes({}), [`assets/${first}.bin`]: new Uint8Array([1]), [`assets/${second}.bin`]: new Uint8Array([2]) }, { level: 0 });
    const oldName = new TextEncoder().encode(`assets/${second}.bin`), duplicateName = new TextEncoder().encode(`assets/${first}.bin`);
    for (let offset = 0; offset <= archive.length - oldName.length; offset++) if (oldName.every((byte, index) => archive[offset + index] === byte)) archive.set(duplicateName, offset);
    await expect(inspectScenario(archive, { worker: false })).rejects.toMatchObject({ code: 'ARCHIVE_INVALID' });
    const budget = { objects: 0 }, limits = { ...importLimits(), objects: 2 };
    parseStrictJson(jsonBytes({ one: {} }), 'first', limits, budget);
    expect(() => parseStrictJson(jsonBytes({ two: {} }), 'second', limits, budget)).toThrow(StorageError);
  });

  it('checks actual expanded bytes when a compressed bomb understates its size', async () => {
    const files = unzipSync(await exportScenario(fixture())); files['data/project.json'] = new TextEncoder().encode('x'.repeat(100_000));
    const bytes = zipSync(files, { level: 9 }), view = new DataView(bytes.buffer);
    for (let offset = 0; offset + 46 < bytes.length; offset++) if (view.getUint32(offset, true) === 0x02014b50) {
      const nameLength = view.getUint16(offset + 28, true), name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (name === 'data/project.json') { const local = view.getUint32(offset + 42, true); view.setUint32(offset + 24, 100, true); view.setUint32(local + 22, 100, true); }
    }
    await expect(inspectScenario(bytes, { worker: false })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED', path: 'data/project.json' });
  });

  it('enforces archive, file count, JSON depth and object limits and supports cancellation', async () => {
    const archive = await exportScenario(fixture());
    await expect(inspectScenario(archive, { worker: false, limits: { compressedBytes: archive.length - 1 } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(inspectScenario(archive, { worker: false, limits: { files: 1 } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(() => parseStrictJson(new TextEncoder().encode('[[[0]]]'), 'input', { compressedBytes: 64 * 1024 * 1024, expandedBytes: 256 * 1024 * 1024, jsonBytes: 64 * 1024 * 1024, assetBytes: 32 * 1024 * 1024, files: 5_000, records: 100_000, depth: 2, objects: 500_000, conditionDepth: 16, conditionNodes: 256, fieldBytes: 1024 * 1024 })).toThrow(StorageError);
    const controller = new AbortController(); controller.abort(); await expect(inspectScenario(archive, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it.each(['{"key":1,"key":2}', '{"x":{"same":1,"same":2}}', '{"n":1e999}', '{"s":"\\ud800"}', '{"s":"\\udfff"}', '{"x":NaN}', '{"x":Infinity}', '{"x":1} trailing'])('rejects invalid JSON %s', text => {
    expect(() => parseStrictJson(new TextEncoder().encode(text), 'data/project.json')).toThrow(StorageError);
  });
  it('rejects UTF-8 errors and BOM, preserves absent versus null and canonicalizes only object keys', () => {
    expect(() => parseStrictJson(new Uint8Array([0xff]), 'input')).toThrow(StorageError);
    expect(() => parseStrictJson(new Uint8Array([0xef, 0xbb, 0xbf, 123, 125]), 'input')).toThrow(StorageError);
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}'); expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    expect(canonicalCode(new StorageError('LIMIT_EXCEEDED', '上限'))).toBe('IMPORT_LIMIT');
  });
});
