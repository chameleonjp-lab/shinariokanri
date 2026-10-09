import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import type { Entity, ProjectData } from '../domain/types';
import { remapEditedTextReferences, remapEditedTextRelationReferences } from '../domain/text';
import { startTrial, trialRecordData } from '../domain/runtime';
import { exportScenario, inspectScenario } from './archive';
import { jsonBytes, sha256 } from './json';
import { ScenarioStore, type SaveMetrics } from './store';

const stores: ScenarioStore[] = [];
const open = (databaseName = `delta-${newId()}`, onSaveMetrics?: (metrics: SaveMetrics) => void) => {
  const store = new ScenarioStore({ databaseName, onSaveMetrics }); stores.push(store); return store;
};
const database = (store: ScenarioStore): Dexie => (store as unknown as { db: Dexie }).db;
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });
function fixture(count = 3): ProjectData {
  const project = createProject('差分と復元');
  for (let i = 0; i < count; i++) project.entities.push(createEntity(project.projectId, 'note', `メモ${i}`, { body: textToRichText('以前の本文を失わず、編集した情報だけを書き込みます。'.repeat(5)) }));
  return project;
}

describe('R06 changed-record saves and portable recovery', () => {
  it('writes no content rows for a title and only one entity/block for text; stores small commands and outbox links', async () => {
    const reports: SaveMetrics[] = [], store = open(undefined, report => reports.push(report));
    let project = (await store.saveProject(fixture(30), { reason: '作成', includeHistory: false })).project;
    const written = { entities: 0, blocks: 0, relations: 0 }, raw = database(store);
    for (const table of ['entities', 'blocks', 'relations'] as const) raw.table(table).hook('updating', () => { written[table]++; });
    let historyRead = 0; raw.table('commands').hook('reading', record => { if (record) historyRead++; return record; });
    project = (await store.saveProject({ ...project, name: '作品名だけ変更' }, { reason: '作品名' })).project;
    expect(reports.at(-1)).toMatchObject({ historyRead: 0, written: { entities: 0, blocks: 0, relations: 0, snapshots: 0, views: 0, commands: 1, outbox: 1 } });
    expect(written).toEqual({ entities: 0, blocks: 0, relations: 0 });
    const entity = project.entities[0] as Entity<'note'>;
    const saved = await store.saveProject({ ...project, entities: project.entities.map(record => record.id === entity.id ? { ...entity, data: { ...entity.data, body: entity.data.body.map((block, index) => index ? block : { ...block, text: 'この本文だけを変更' }) } } : record) }, { reason: '本文' });
    expect(reports.at(-1)).toMatchObject({ historyRead: 0, written: { entities: 1, blocks: 1, relations: 0, snapshots: 0, views: 0 } });
    expect(written).toEqual({ entities: 1, blocks: 1, relations: 0 }); expect(historyRead).toBe(0);
    expect(jsonBytes(await raw.table('commands').get(saved.operationId)).length).toBeLessThan(jsonBytes(project).length / 10);
    expect(jsonBytes(await raw.table('outbox').get(saved.operationId)).length).toBeLessThan(jsonBytes(project).length / 10);
    expect((await store.getProject(project.projectId))!.history).toHaveLength(3);
    expect((await store.getProjectAtRevision(project.projectId, '1'))!.name).toBe('差分と復元');
    expect((await store.restoreEntity(project.projectId, (await store.listHistory(project.projectId))[0].operationId, entity.id)).project.entities[0]).toMatchObject({ data: entity.data });
  });

  it('loads current editing rows after restart without reading history; retains all history on save/export/empty recovery', async () => {
    const name = `lazy-${newId()}`, first = open(name);
    let project = (await first.saveProject(fixture(), { reason: '作成', includeHistory: false })).project;
    for (let i = 0; i < 5; i++) project = (await first.saveProject({ ...project, name: `作品 ${i}` }, { reason: '変更' })).project;
    first.close();
    const restarted = open(name), raw = database(restarted); let historyRead = 0;
    raw.table('commands').hook('reading', record => { if (record) historyRead++; return record; });
    const editing = (await restarted.listProjectsForEditing())[0];
    expect(historyRead).toBe(0); expect(editing.history).toEqual([]); expect(restarted.getHistoryCount(editing)).toBe(6);
    const saved = (await restarted.saveProject({ ...editing, name: '再起動後の変更' }, { reason: '続き' })).project;
    expect(historyRead).toBe(0); expect(restarted.getHistoryCount(saved)).toBe(7);
    const archive = await inspectScenario(await restarted.exportProject(saved.projectId), { worker: false });
    expect(archive.project.history).toHaveLength(7); expect(archive.project.name).toBe(saved.name);
    const destination = open(); await destination.importScenario(archive, { mode: 'new' });
    expect(await destination.getProject(saved.projectId)).toEqual(archive.project);
    expect((await destination.getProjectAtRevision(saved.projectId, '1'))!.name).toBe('差分と復元');
  });

  it('retains checkpoints, old revisions and undo across more than 64 compact commands', async () => {
    const name = `checkpoints-${newId()}`, first = open(name);
    let project = (await first.saveProject(fixture(), { reason: '作成', includeHistory: false })).project;
    for (let i = 0; i < 66; i++) project = (await first.saveProject({ ...project, name: `編集 ${i}` }, { reason: `変更 ${i}` })).project;
    first.close(); const restarted = open(name), loaded = (await restarted.getProject(project.projectId))!;
    expect(loaded.history).toHaveLength(67); expect(loaded.revision).toBe('67');
    expect((await restarted.getProjectAtRevision(project.projectId, '2'))!.name).toBe('編集 0');
    const row = await database(restarted).table('commands').get(loaded.history[64].operationId);
    expect(row.delta.checkpoint.revision).toBe('64');
    expect((await restarted.undo(project.projectId)).project.name).toBe('編集 64');
  });

  it('rejects stale editing tokens, replaced tokens and tampered full history without committing', async () => {
    const name = `tokens-${newId()}`, first = open(name), other = open(name);
    const project = (await first.saveProject(fixture(), { reason: '作成', includeHistory: false })).project;
    const otherDraft = (await other.getProjectForEditing(project.projectId))!;
    await other.saveProject({ ...otherDraft, name: '先に保存' }, { reason: '別接続' });
    await expect(first.saveProject({ ...project, name: '古い入力' }, { reason: '古い入力' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const editing = (await first.getProjectForEditing(project.projectId))!;
    await expect(first.saveProject({ ...editing, history: [] }, { reason: '履歴消去' })).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    const forged = structuredClone((await first.getProject(project.projectId))!); forged.history[0].after.name = '偽の履歴';
    await expect(first.saveProject(forged, { reason: '改竄' })).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect((await first.getProject(project.projectId))!.name).toBe('先に保存');
    expect(await first.listHistory(project.projectId)).toHaveLength(2);
  });

  it('validates changed dependencies and global uniqueness while unchanged records are reused', async () => {
    const store = open(), project = createProject('依存の検査');
    const variable = createEntity(project.projectId, 'variable', '状態', { key: 'state', initial: { type: 'boolean', value: false } });
    const effect = createEntity(project.projectId, 'effect', '代入', { targetId: variable.id, operation: 'set', value: { type: 'boolean', value: true } });
    project.entities = [variable, effect];
    const saved = (await store.saveProject(project, { reason: '作成', includeHistory: false })).project;
    const changed = { ...variable, data: { ...variable.data, valueType: 'integer' as const, initial: { type: 'integer' as const, value: 0 }, allowed: { min: 0, max: 10 } } };
    await expect(store.saveProject({ ...saved, entities: [changed, saved.entities[1]] }, { reason: '型変更' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', issues: expect.arrayContaining([expect.objectContaining({ path: 'project.entities[1].data.value' })]) });
    const duplicate = createEntity(saved.projectId, 'variable', '重複', { key: 'state' });
    await expect(store.saveProject({ ...saved, entities: [...saved.entities, duplicate] }, { reason: '追加' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await store.getProject(saved.projectId))!.revision).toBe('1');
  });

  it('checks an unchanged external text anchor when its referenced block is shortened', async () => {
    const store = open(), project = fixture(1), note = project.entities[0] as Entity<'note'>;
    const review = createEntity(project.projectId, 'review', '注記', { targetVersionId: project.projectId, target: { entityId: note.id, blockId: note.data.body[0].id, start: 0, end: 10 } });
    project.entities.push(review);
    const saved = (await store.saveProject(project, { reason: '作成', includeHistory: false })).project;
    const edited = structuredClone(saved.entities[0]) as Entity<'note'>; edited.data.body[0].text = '短文';
    await expect(store.saveProject({ ...saved, entities: [edited, saved.entities[1]] }, { reason: '短縮' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await store.getProject(project.projectId))!.entities[1]).toEqual(saved.entities[1]);
  });

  it('revalidates unchanged current-version checkpoint evidence when new eligible disclosures are added', async () => {
    const store = open(), project = createProject('提示集合の依存');
    const scene = createEntity(project.projectId, 'scene', '場面'), entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry', sceneId: scene.id });
    const graph = createEntity(project.projectId, 'flow_graph', '分岐', { nodeIds: [entry.id], entryIds: [entry.id] });
    const foreshadow = createEntity(project.projectId, 'foreshadow', '伏線');
    const disclosure = createEntity(project.projectId, 'disclosure', '開示', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id } });
    project.entities = [scene, entry, graph, foreshadow, disclosure];
    const checkpointId = newId(), checkpoint = createEntity(project.projectId, 'checkpoint', '途中状態', trialRecordData(project, startTrial(project), checkpointId).checkpoint); checkpoint.id = checkpointId;
    project.entities.push(checkpoint);
    const saved = (await store.saveProject(project, { reason: '作成', includeHistory: false })).project;
    const extra = createEntity(project.projectId, 'disclosure', '後から追加', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id } });
    await expect(store.saveProject({ ...saved, entities: [...saved.entities, extra] }, { reason: '新しい開示' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', issues: expect.arrayContaining([expect.objectContaining({ path: 'project.entities[5].data.presentationResults' })]) });
    expect((await store.getProject(saved.projectId))!.revision).toBe('1');
  });

  it('preserves an imported revision-zero header in the first compact edit, including after restart', async () => {
    const name = `import-zero-${newId()}`, first = open(name), source = createProject('読み込んだ初版');
    await first.importScenario(await inspectScenario(await exportScenario(source), { worker: false }), { mode: 'new' });
    const editing = (await first.getProjectForEditing(source.projectId))!;
    const saved = await first.saveProject({ ...editing, name: '改名した初版' }, { reason: '改名' });
    first.close(); const restarted = open(name);
    const change = (await restarted.listOutbox(source.projectId)).find(row => row.operationId === saved.operationId)!.changes.find(change => change.targetId === source.projectId)!;
    expect(change.before).toMatchObject({ kind: 'project', name: source.name, revision: '0' });
    const field = change.fields.find(field => field.field === 'name')!;
    expect(field.before).toEqual({ present: true, value: source.name }); expect(field.oldValueHash).toBe(await sha256(jsonBytes(field.before)));
  });

  it('remaps live entity/relation anchors on single text restore while retaining pinned emoji positions and archive recovery', async () => {
    const store = open(), project = createProject('本文復元');
    const scene = createEntity(project.projectId, 'scene', '本文', { body: textToRichText('😀アオが歩く。') });
    const a = createEntity(project.projectId, 'character', 'アオ'), b = createEntity(project.projectId, 'character', '門番');
    const anchor = { entityId: scene.id, blockId: scene.data.body[0].id, start: 1, end: 3 };
    const cue = createEntity(project.projectId, 'cue', '演出', { anchor, cueType: 'camera' });
    project.entities = [scene, a, b, cue];
    project.relations = [{ id: newId(), projectId: project.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'related', direction: 'forward', validity: { worldRange: null, routeCondition: null, presentationAnchor: anchor }, evidenceIds: [], status: 'provisional', visibility: 'private' }];
    const initial = await store.saveProject(project, { reason: '作成' });
    const { history: _history, snapshots: _snapshots, ...content } = structuredClone(initial.project);
    const version = { id: newId(), versionLabel: '固定版', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) };
    const pinned = createEntity(project.projectId, 'cue', '固定版の演出', { cueType: 'camera', anchor: { ...anchor, sourceVersionId: version.id } });
    const current = (await store.saveProject({ ...initial.project, snapshots: [version], entities: [...initial.project.entities, pinned] }, { reason: '固定版' })).project;
    const before = current.entities.find(entity => entity.id === scene.id) as Entity<'scene'>, edited = structuredClone(before); edited.data.body[0].text = '昨日、😀アオが歩く。';
    const editedProject = { ...current, entities: remapEditedTextReferences(current.entities.map(entity => entity.id === scene.id ? edited : entity), before, edited), relations: remapEditedTextRelationReferences(current.relations, before, edited) };
    const changed = (await store.saveProject(editedProject, { reason: '挿入' })).project;
    expect((changed.entities.find(entity => entity.id === cue.id) as Entity<'cue'>).data.anchor).toMatchObject({ start: 4, end: 6 });
    const restored = (await store.restoreEntity(project.projectId, initial.operationId, scene.id)).project;
    expect((restored.entities.find(entity => entity.id === cue.id) as Entity<'cue'>).data.anchor).toMatchObject(anchor);
    expect(restored.relations[0].validity.presentationAnchor).toMatchObject(anchor);
    expect((restored.entities.find(entity => entity.id === pinned.id) as Entity<'cue'>).data.anchor).toEqual(pinned.data.anchor);
    const recovery = await inspectScenario(await store.exportProject(project.projectId), { worker: false }), destination = open();
    await destination.importScenario(recovery, { mode: 'new' });
    expect(await destination.getProject(project.projectId)).toEqual(restored);
  });

  it('reads legacy v1 full rows/outbox and replays original hashes before adding new deltas', async () => {
    const name = `legacy-${newId()}`, first = open(name), original = fixture();
    const operationId = newId(), saved = await first.saveProject(original, { reason: '旧版の作成', operationId });
    const oldOutbox = (await first.listOutbox(original.projectId))[0], raw = database(first);
    await raw.table('commands').put({ operationId, projectId: original.projectId, revision: '1', record: saved.project.history[0], requestHash: await sha256(jsonBytes({ draft: original, reason: '旧版の作成', assets: [], compensatesOperationId: null })) });
    await raw.table('outbox').put(oldOutbox);
    const { contentHeadOperationId: _head, ...header } = await raw.table('projects').get(original.projectId); await raw.table('projects').put(header);
    first.close(); const restarted = open(name);
    expect(await restarted.saveProject(original, { reason: '旧版の作成', operationId })).toEqual(saved);
    const loaded = (await restarted.getProject(original.projectId))!;
    const changed = (await restarted.saveProject({ ...loaded, name: '新版での編集' }, { reason: '続き' })).project;
    restarted.close(); const reopened = open(name);
    expect(await reopened.getProject(original.projectId)).toEqual(changed);
    expect(await reopened.listOutbox(original.projectId)).toHaveLength(2);
    expect((await inspectScenario(await reopened.exportProject(original.projectId), { worker: false })).project).toEqual(changed);
  });

  it('rejects a missing delta base and duplicate immutable snapshot IDs', async () => {
    const name = `corrupt-${newId()}`, first = open(name);
    let project = (await first.saveProject(fixture(), { reason: '作成' })).project;
    const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project);
    const snapshot = { id: newId(), versionLabel: '版1', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) };
    project = (await first.saveProject({ ...project, snapshots: [snapshot] }, { reason: '固定版' })).project;
    await expect(first.saveProject({ ...project, snapshots: [snapshot, snapshot] }, { reason: '重複' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const raw = database(first), row = await raw.table('commands').get(project.history[1].operationId);
    row.delta.parentOperationId = newId(); await raw.table('commands').put(row);
    first.close(); const reopened = open(name);
    await expect(reopened.getProject(project.projectId)).rejects.toMatchObject({ code: 'SAVE_FAILED' });
  });
});
