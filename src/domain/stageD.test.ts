import 'fake-indexeddb/auto';
import {afterEach, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from './model';
import * as writing from './writingWorkspace';
import * as notes from './notes';
import * as navigation from '../ui/editorNavigation';
import * as preferences from '../ui/viewPreferences';
import {ScenarioStore} from '../storage/store';

const stores: ScenarioStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });
function store() { const value = new ScenarioStore({databaseName:`stage-d-${newId()}`}); stores.push(value); return value; }
function fixture() {
  const project = createProject('十二場面');
  const chapter = createEntity(project.projectId, 'chapter', '第一章');
  const scenes = Array.from({length:12}, (_, i) => createEntity(project.projectId, 'scene', `場面${i + 1}`, {chapterId:chapter.id, body:textToRichText('最初\n途中\n最後')}));
  chapter.data.sceneIds = scenes.map(scene => scene.id);
  project.entities.push(chapter, ...scenes);
  return {project, chapter, scenes};
}
it('previews scene 12 before scene 2, guards the revision, and one undo preserves IDs and references', async () => {
  const {project, chapter, scenes} = fixture(), db = store();
  const event = createEntity(project.projectId, 'event', '世界の日', {time:{mode:'instant', at:'12345678901234567890', calendarId:project.calendarId}});
  scenes[11].data.eventIds = [event.id];
  const node = createEntity(project.projectId, 'flow_node', '参照', {sceneId:scenes[11].id}); project.entities.push(event, node);
  const initial = (await db.saveProject(project, {reason:'初期'})).project;
  const preview = writing.previewSceneMove(initial, scenes[11].id, chapter.id, scenes[1].id);
  expect(preview.beforeName).toBe('場面1'); expect(preview.afterName).toBe('場面2');
  expect(() => writing.applySceneMove({...initial, revision:'999'}, preview)).toThrow(/選び直/);
  const saved = await db.saveProject(writing.applySceneMove(initial, preview), {reason:'移動'});
  expect(saved.project.entities.find(e => e.id === chapter.id)?.data).toMatchObject({sceneIds:[scenes[0].id, scenes[11].id, ...scenes.slice(1,11).map(s => s.id)]});
  for (const id of [event.id,node.id,scenes[11].id]) expect(saved.project.entities.find(e => e.id === id)?.data).toEqual(initial.entities.find(e => e.id === id)?.data);
  const undone = (await db.undo(project.projectId, saved.operationId)).project;
  expect(undone.entities.find(e => e.id === chapter.id)?.data).toEqual(initial.entities.find(e => e.id === chapter.id)?.data);
});
it('rejects a deleted destination and an invalid before-scene without silently appending', () => {
  const {project, chapter, scenes} = fixture();
  const preview = writing.previewSceneMove(project, scenes[11].id, chapter.id, scenes[1].id);
  chapter.deletedAt = new Date().toISOString();
  expect(() => writing.applySceneMove(project, preview)).toThrow(/選び直/);
  delete chapter.deletedAt;
  expect(() => writing.previewSceneMove(project, scenes[11].id, chapter.id, newId())).toThrow(/選び直/);
});
it('resumes the edited paragraph, falls back nearby after deletion, and explains a missing scene', () => {
  const {project, scenes} = fixture(), scene = scenes[1];
  const position = {sceneId:scene.id, blockId:scene.data.body[1].id, blockIndex:1};
  expect(navigation.resolveWritingResume(project, position).anchor).toMatchObject({entityId:scene.id, blockId:position.blockId});
  scene.data.body.splice(1,1);
  expect(navigation.resolveWritingResume(project, position)).toMatchObject({anchor:{blockId:scene.data.body[1].id}, message:expect.stringMatching(/近い段落/)});
  scene.deletedAt = '2026-11-06T00:00:00.000Z';
  expect(navigation.resolveWritingResume(project, position)).toMatchObject({anchor:null, message:expect.stringMatching(/章一覧/)});
});
it('isolates writing preferences by account, physical device identity, and work', () => {
  const key = preferences.writingResumeStorageKey;
  expect(key('a','device','work')).not.toBe(key('b','device','work'));
  expect(key('a','device','work')).not.toBe(key('a','other','work'));
  expect(key('a','device','work')).not.toBe(key('a','device','other'));
  expect(preferences.parseWritingResume('{"sceneId":2}')).toBeNull();
});
it('keeps three captures and a single conversion mapping across retry/restart and undoes only its delta', async () => {
  const db = store(), project = createProject('機内モード');
  project.entities = ['鍵を拾う','鳥が鳴く','夜が明ける'].map(text => notes.createQuickNote(project.projectId, text));
  const initial = (await db.saveProject(project, {reason:'三件'})).project;
  const note = initial.entities[0]; if (note.kind !== 'note') throw Error('fixture');
  const preview = notes.previewNoteConversion(note, {kind:'scene', name:'鍵', entityId:newId(), relationId:newId(), createdAt:new Date().toISOString(), blockIds:note.data.body.map(() => newId())});
  const candidate = {...initial, entities:[preview.note,...initial.entities.slice(1),preview.entity], relations:[preview.relation]};
  const operationId = newId(), saved = await db.saveProject(candidate,{reason:'変換',operationId});
  await db.saveProject(candidate,{reason:'変換',operationId});
  const loaded = (await db.getProject(project.projectId))!;
  expect(notes.unorganizedNotes(loaded)).toHaveLength(2); expect(loaded.relations).toHaveLength(1);
  const edited = {...loaded, name:'後から作品名を変更'};
  await db.saveProject(edited,{reason:'独立変更'});
  const undone = (await db.undo(project.projectId,saved.operationId)).project;
  expect(notes.unorganizedNotes(undone)).toHaveLength(3); expect(undone.name).toBe('後から作品名を変更');
  expect(undone.relations.filter(r => !r.deletedAt)).toHaveLength(0);
});
it('rolls back an interrupted note conversion entirely and retries the same command once', async () => {
  let fail = false;
  const db = new ScenarioStore({databaseName:`stage-d-failure-${newId()}`, faultInjector:stage => { if (fail && stage === 'before-commit') { fail = false; throw Error('interrupted'); } }}); stores.push(db);
  const project = createProject('中断'), note = notes.createQuickNote(project.projectId,'鍵の思いつき'); project.entities.push(note);
  const initial = (await db.saveProject(project,{reason:'capture'})).project;
  const source = initial.entities[0]; if (source.kind !== 'note') throw Error('fixture');
  const preview = notes.previewNoteConversion(source,{kind:'scene',name:'鍵',entityId:newId(),relationId:newId(),createdAt:new Date().toISOString(),blockIds:source.data.body.map(()=>newId())});
  const candidate = {...initial,entities:[preview.note,preview.entity],relations:[preview.relation]}, operationId = newId();
  fail = true; await expect(db.saveProject(candidate,{reason:'convert',operationId})).rejects.toThrow();
  const interrupted = (await db.getProject(project.projectId))!;
  expect(interrupted.revision).toBe(initial.revision); expect(notes.unorganizedNotes(interrupted)).toHaveLength(1); expect(interrupted.relations).toHaveLength(0);
  await Promise.all([db.saveProject(candidate,{reason:'convert',operationId}),db.saveProject(candidate,{reason:'convert',operationId})]);
  const loaded = (await db.getProject(project.projectId))!;
  expect(loaded.entities.filter(entity=>entity.kind==='scene'&&!entity.deletedAt)).toHaveLength(1); expect(loaded.relations).toHaveLength(1); expect(notes.unorganizedNotes(loaded)).toHaveLength(0);
});
it('reuses a retained capture ID after a committed save is interrupted before draft cleanup', () => {
  const project = createProject('再開'), id = newId();
  const first = notes.prepareQuickNote(project, '同じ一文', id);
  expect(first.entities.filter(entity=>entity.id===id)).toHaveLength(1);
  const restarted = notes.prepareQuickNote(first, '同じ一文', id);
  expect(restarted).toBe(first);
  expect(restarted.entities).toHaveLength(1);
  expect(() => notes.prepareQuickNote(first, '異なる一文', id)).toThrow(/保存済み/);
});
