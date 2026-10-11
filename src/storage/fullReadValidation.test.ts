// Unit and fake IndexedDB evidence; the original Large113 browser gate is separate.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEntity, createProject, ENTITY_SCHEMAS, newId, textToRichText} from '../domain/model';
import type {ContentState, Entity, ProjectContent, ProjectData} from '../domain/types';
import {createWorldSnapshot} from '../domain/world';
import {appendAlternativeVersion, applyAlternativeChanges, diffAuthorAlternative, forkAuthorAlternative, projectContent, recordAlternativeApplication} from '../domain/writingWorkspace';
import {sealAuthorAlternative} from '../domain/authorAlternativeIntegrity';
import * as archive from './archive';
import {runImportWork, type ImportWork} from './importWork';
import {ScenarioStore} from './store';
import {jsonBytes, sha256} from './json';
import {StorageError} from './errors';

const stores: ScenarioStore[] = [];
const open = (databaseName = `full-read-${newId()}`) => {
  const store = new ScenarioStore({databaseName}); stores.push(store); return store;
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) await store.deleteDatabase();
});

function retainedProject(count = 113): ProjectData {
  const project = createProject('全113命令を持つ読み込み');
  const place = createEntity(project.projectId, 'place', '旧版にも存在する街');
  const event = createEntity(project.projectId, 'event', '街の出来事', {locationId: place.id});
  project.entities.push(place, event);
  const {history: _history, ...base} = project;
  const states: ContentState[] = Array.from({length: count + 1}, (_, index) => ({...base, name: `作品名${index}`, revision: String(index)}));
  const history = Array.from({length: count}, (_, index) => ({operationId: newId(), projectId: project.projectId,
    baseRevision: String(index), revision: String(index + 1), targetIds: [project.projectId], reason: '作品名を保存',
    createdAt: '2026-10-11T00:00:00.000Z', before: states[index], after: states[index + 1]}));
  return {...states[count], history};
}
const request = (project: ProjectData): ImportWork => ({step: 'full_read', project, worlds: {}, knownWorlds: {}});
async function failure(work: ImportWork, separate = false) {
  try {
    if (separate) for (const step of ['structure', 'worlds', 'hashes', 'integrity'] as const) await runImportWork({...work, step});
    else await runImportWork(work);
    throw new Error('Expected the full durable contract to refuse this input');
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    return {code: error.code, message: error.message, path: error.path, issues: (error as StorageError & {issues?: unknown[]}).issues};
  }
}
async function pinnedSnapshot(project: ProjectData) {
  const {history: _history, snapshots: _snapshots, authorAlternatives: _alternatives, ...content} = project;
  return {id: newId(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: '読み込みで検査する固定版', createdAt: '2026-10-11T00:00:00.000Z'};
}

describe('one private full-history read validation', () => {
  it('accepts all 113 complete commands, returns no manuscript, and leaves author graphs editable', async () => {
    const project = retainedProject(), original = structuredClone(project);
    await expect(runImportWork(request(project))).resolves.toEqual({});
    expect(project).toEqual(original); expect(project.history).toHaveLength(113);
    expect(Object.isFrozen(project)).toBe(false); expect(Object.isFrozen(project.history[112].after.entities)).toBe(false);
    project.history[0].before.name = '作者が引き続き編集できる旧版';
    expect(project.history[0].before.name).toBe('作者が引き続き編集できる旧版');
  });

  it.each([{index: 0, side: 'before'}, {index: 112, side: 'after'}] as const)(
    'refuses a missing typed target in command $index $side even when current content is valid', async ({index, side}) => {
      const project = retainedProject(), state = project.history[index][side];
      state.entities = state.entities.filter(entity => entity.kind !== 'place');
      const refused = await failure(request(project));
      expect(refused.code).toBe('VALIDATION_FAILED');
      expect(refused.message).toContain(`project.history[${index}].${side}.entities`);
      expect(refused).toEqual(await failure(request(project), true));
    });

  it('checks historical command metadata independently from previously valid shared content', async () => {
    const project = retainedProject();
    await expect(runImportWork(request(project))).resolves.toEqual({});
    Object.assign(project.history[112], {unexpectedApproval: true});
    const refused = await failure(request(project));
    expect(refused.message).toContain('project.history[112].unexpectedApproval');
    expect(refused).toEqual(await failure(request(project), true));
  });

  it('checks snapshot digests present only in an old command image', async () => {
    const project = retainedProject(), snapshot = await pinnedSnapshot(project);
    snapshot.contentHash = '0'.repeat(64);
    project.history[0].before.snapshots = [snapshot];
    const refused = await failure(request(project));
    expect(refused.code).toBe('HASH_MISMATCH'); expect(refused.path).toBe(`snapshots/${snapshot.id}`);
    expect(refused).toEqual(await failure(request(project), true));
  });

  it('retains structure before world matching, and world matching before snapshot hashing', async () => {
    const world = await createWorldSnapshot(createProject('固定世界'), '旧世界'), pin = world.snapshots[0];
    const project = retainedProject(), snapshot = await pinnedSnapshot(project);
    snapshot.contentHash = '0'.repeat(64); project.snapshots.push(snapshot);
    project.history[0].before.worldReferences = [{projectId: world.projectId, immutableSnapshotId: pin.id, contentHash: pin.contentHash}];
    const work: ImportWork = {step: 'full_read', project, worlds: archive.worldSnapshotContents({[pin.id]: world}), knownWorlds: {}};
    const badHeader = {...project, revision: '-1'};
    expect((await failure({...work, project: badHeader})).message).toContain('project.revision');
    const missingWorld = await failure(work);
    expect(missingWorld.code).toBe('VALIDATION_FAILED'); expect(missingWorld.path).toBe(`worlds/${pin.id}.json`);
    expect(missingWorld).toEqual(await failure(work, true));
    work.knownWorlds = {[pin.id]: world};
    expect((await failure(work)).code).toBe('HASH_MISMATCH');
  });

  it('captures manuscript and fixed world contents once before any asynchronous digest', async () => {
    let world = createProject('捕捉した固定世界');
    const place = createEntity(world.projectId, 'place', '固定された街'); world.entities.push(place);
    world = await createWorldSnapshot(world, '第一版'); const pin = world.snapshots[0];
    const project = retainedProject(1);
    project.worldReferences.push({projectId: world.projectId, immutableSnapshotId: pin.id, contentHash: pin.contentHash});
    project.entities.push(createEntity(project.projectId, 'event', '借りた街の出来事', {locationId: place.id}));
    const knownWorlds = {[pin.id]: world}, worlds = archive.worldSnapshotContents(knownWorlds);
    const work: ImportWork = {step: 'full_read', project, worlds, knownWorlds};
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => {entered = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {entered(); await gate; return digest(...args);});
    try {
      const pending = runImportWork(work); await started;
      project.entities = []; project.name = '検査開始後の編集'; worlds[pin.id].entities = []; world.snapshots[0].contentHash = '0'.repeat(64);
      release(); await expect(pending).resolves.toEqual({});
      expect(Object.isFrozen(project)).toBe(false); expect(Object.isFrozen(world.snapshots[0].content)).toBe(false);
      expect((await failure(work)).code).toBe('VALIDATION_FAILED');
    } finally {release(); spy.mockRestore();}
  });

  it('rechecks changed schema rules after a successful structural phase across a digest await', async () => {
    const project = createProject('検証中の規則変更'); project.entities.push(createEntity(project.projectId, 'note', '検証済みのメモ'));
    project.snapshots.push(await pinnedSnapshot(project));
    const previous = ENTITY_SCHEMAS.note, digest = crypto.subtle.digest.bind(crypto.subtle);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => {entered = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {entered(); await gate; return digest(...args);});
    try {
      const pending = runImportWork(request(project)); const rejection = expect(pending).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
      await started;
      ENTITY_SCHEMAS.note = {type: 'object', fields: {newlyRequired: {required: true, schema: {type: 'text'}}}};
      release(); await rejection;
    } finally {release(); ENTITY_SCHEMAS.note = previous; spy.mockRestore();}
    await expect(runImportWork(request(project))).resolves.toEqual({});
  });

  it('keeps unsupported prototype graphs on complete checks without freezing or caching author input', async () => {
    const project = retainedProject(), legacyPrototype = {legacySource: true};
    Object.setPrototypeOf(project, legacyPrototype);
    const refused = await failure(request(project));
    expect(refused.code).toBe('VALIDATION_FAILED'); expect(refused.message).toContain('作品はオブジェクトです');
    expect(refused).toEqual(await failure(request(project), true));
    expect(Object.getPrototypeOf(project)).toBe(legacyPrototype); expect(Object.isFrozen(project.entities)).toBe(false);
    project.history[112].reason = '拒否後も作者が修正できる';
    expect(project.history[112].reason).toBe('拒否後も作者が修正できる');
  });

  it('requires an adoption receipt to match its actual retained command', async () => {
    const store = open(); let project = createProject('採用記録の完全検査');
    const scene = createEntity(project.projectId, 'scene', '採用前', {body: textToRichText('採用前の本文')}); project.entities.push(scene);
    project = (await store.saveProject(project, {reason: '初期保存'})).project;
    const branch = forkAuthorAlternative(project, '採用する別案'), content: ProjectContent = projectContent(branch.versions[0].content);
    (content.entities.find(entity => entity.id === scene.id) as Entity<'scene'>).name = '採用後';
    project.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(branch, content, '改名'))];
    project = (await store.saveProject(project, {reason: '別案を保存'})).project;
    const alternative = project.authorAlternatives?.[0];
    if (!alternative) throw new Error('Expected the saved author alternative');
    const changes = diffAuthorAlternative(alternative, project);
    const rename = changes.find(change => change.scope === 'entity' && change.path[0] === 'name');
    if (!rename) throw new Error('Expected an actual scene rename');
    const adopted = applyAlternativeChanges(project, alternative, changes, new Set([rename.key]));
    adopted.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(alternative, adopted.receipt, '3'))];
    project = (await store.saveProject(adopted.project, {reason: '別案を採用'})).project;
    await expect(runImportWork(request(project))).resolves.toEqual({});
    const missingCommand = {...project, history: project.history.slice(0, -1)};
    const refused = await failure(request(missingCommand));
    expect(refused.code).toBe('VALIDATION_FAILED'); expect(refused.message).toContain('対応する不変の変更履歴');
    expect(refused).toEqual(await failure(request(missingCommand), true));
  });

  it('routes a cold native read through one complete worker job without replacing its stored image', async () => {
    const databaseName = `full-read-native-${newId()}`, writer = open(databaseName), initial = createProject('端末に保存した原稿');
    initial.entities.push(createEntity(initial.projectId, 'note', '本文を保持するメモ'));
    const saved = (await writer.saveProject(initial, {reason: '初期原稿'})).project; writer.close();
    const reader = open(databaseName), native = (reader as unknown as {db: Dexie}).db;
    await native.open(); const before = await native.table('commands').toArray();
    const work = vi.spyOn(archive, 'performImportWork');
    const loaded = await reader.getProject(initial.projectId);
    expect(loaded).toEqual(saved); expect(work).toHaveBeenCalledTimes(1);
    expect(work.mock.calls[0][0]).toMatchObject({step: 'full_read', project: {history: saved.history}});
    await expect(work.mock.results[0].value).resolves.toEqual({});
    expect(await native.table('commands').toArray()).toEqual(before);
    expect(await reader.getProject(initial.projectId)).toEqual(saved); expect(work).toHaveBeenCalledTimes(1);
  });

  it('refuses cancellation without publishing a partial successful read', async () => {
    const signal = new AbortController(); signal.abort();
    await expect(runImportWork(request(retainedProject()), signal.signal)).rejects.toMatchObject({code: 'CANCELLED'});
  });
});
