import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../domain/model';
import { captureRuntimeContent } from '../domain/runtimeVersions';
import { presentNextChapterScene, pinChapterReadingRecord, replayChapterReading, startChapterReading } from '../domain/presentation';
import { initializeRuntimeState } from '../domain/conditions';
import { appendAlternativeVersion, applyAlternativeChanges, diffAuthorAlternative, forkAuthorAlternative, projectContent, recordAlternativeApplication } from '../domain/writingWorkspace';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { addChangeReviews } from '../domain/changeReviews';
import type { Entity, ProjectData, ProjectSnapshot } from '../domain/types';
import { createWorldSnapshot } from '../domain/world';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { createPinnedWorldDigestCache, verifyPinnedWorlds } from '../domain/pinnedWorlds';
import { exportScenario, inspectScenario } from './archive';
import { collectImportIds, planCrossProjectImport } from './importMapping';
import { jsonBytes, sha256 } from './json';
import { ScenarioStore } from './store';

const stores: ScenarioStore[] = [];
const open = (name = `alternative-durability-${newId()}`) => {
  const store = new ScenarioStore({ databaseName: name }); stores.push(store); return store;
};
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });

function fixture(): ProjectData {
  const project = createProject('作者別案の保存');
  const scene = createEntity(project.projectId, 'scene', '門の前', { body: textToRichText('門は閉じていた。') });
  const chapter = createEntity(project.projectId, 'chapter', '第一章', { sceneIds: [scene.id] });
  scene.data.chapterId = chapter.id; project.entities = [chapter, scene]; return project;
}

async function snapshot(project: ProjectData, id = newId()): Promise<ProjectSnapshot> {
  const content = projectContent(project);
  return { id, versionLabel: '公開版', createdAt: '2026-01-01T00:00:00.000Z', contentHash: await sha256(jsonBytes(content)), content };
}

async function editedAlternative(project: ProjectData, name = '別の展開') {
  const alternative = forkAuthorAlternative(project, name, { now: '2026-01-02T00:00:00.000Z' });
  const content = projectContent(alternative.versions[0]!.content);
  const scene = content.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!;
  scene.name = '門を開ける'; scene.data.body[0]!.text = '門が開いた。';
  return sealAuthorAlternative(appendAlternativeVersion(alternative, content, '場面の書き換え', '2026-01-03T00:00:00.000Z'));
}

describe('native author alternative durability', () => {
  it('keeps branch-only attachment bytes through save, close/reopen, full backup, and restore', async () => {
    const databaseName = `alternative-asset-${newId()}`, first = open(databaseName);
    let project = (await first.saveProject(fixture(), { reason: '初期保存' })).project;
    const alternative = forkAuthorAlternative(project, '添付つき別案', { now: '2026-01-02T00:00:00.000Z' });
    const content = projectContent(alternative.versions[0]!.content);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const contentHash = await sha256(bytes), assetPath = `assets/${contentHash}.png`;
    content.entities.push(createEntity(project.projectId, 'attachment', '別案だけの絵', { contentHash, mediaType: 'image/png', byteSize: bytes.length, assetPath }));
    project.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(alternative, content, '絵を追加', '2026-01-03T00:00:00.000Z'))];
    project = (await first.saveProject(project, { reason: '別案と添付を保存', assets: [{ contentHash, bytes, mediaType: 'image/png', assetPath }] })).project;
    first.close();

    const reopened = open(databaseName), loaded = (await reopened.getProject(project.projectId))!;
    expect(loaded.authorAlternatives?.[0]?.versions).toHaveLength(2);
    expect(await reopened.getAsset(contentHash)).toEqual(bytes);
    const archive = await inspectScenario(await reopened.exportProject(project.projectId), { worker: false });
    expect(archive.assets).toHaveLength(1); expect(archive.assets[0]?.bytes).toEqual(bytes);

    const restoredStore = open(), restored = await restoredStore.importScenario(archive, { mode: 'new' });
    expect(restored.project.authorAlternatives).toEqual(loaded.authorAlternatives);
    expect(await restoredStore.getAsset(contentHash)).toEqual(bytes);
  });

  it('keeps published snapshots and runtime captures branch-free while selecting an older edition', async () => {
    const db = open();
    let project = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    const published = await snapshot(project); project.snapshots.push(published);
    project.authorAlternatives = [await editedAlternative({ ...project, snapshots: project.snapshots }, '公開版からの別案')];
    const saved = (await db.saveProject(project, { reason: '公開版と別案' })).project;
    const captured = await captureRuntimeContent(saved, saved.projectId);
    expect(Object.hasOwn(captured, 'authorAlternatives')).toBe(false);
    expect(Object.hasOwn(saved.snapshots[0]!.content, 'authorAlternatives')).toBe(false);
    const archive = await inspectScenario(await db.exportProject(saved.projectId, { snapshotId: published.id }), { worker: false });
    expect(archive.manifest.snapshotId).toBe(published.id);
    expect(Object.hasOwn(archive.project, 'authorAlternatives')).toBe(false);
  });

  it('rejects a re-sealed rewrite of an existing version ID and leaves the saved project and outbox unchanged', async () => {
    const db = open(); let project = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    project.authorAlternatives = [await editedAlternative(project)];
    project = (await db.saveProject(project, { reason: '別案保存' })).project;
    const before = structuredClone(project), bad = structuredClone(project), alternative = bad.authorAlternatives![0]!;
    const head = alternative.versions.at(-1)!;
    const scene = head.content.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!;
    scene.name = '同じIDの別内容';
    bad.authorAlternatives = [await sealAuthorAlternative(alternative)];
    await expect(db.saveProject(bad, { reason: '版IDを再利用' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await db.getProject(project.projectId)).toEqual(before);
    expect(await db.listOutbox(project.projectId)).toHaveLength(2);
  });

  it('merges new alternative IDs without dropping destination branches and blocks same-ID replacement', async () => {
    const db = open(); let target = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    target.authorAlternatives = [await editedAlternative(target, '保存済みの別案')];
    target = (await db.saveProject(target, { reason: '保存済み別案' })).project;
    const imported = structuredClone(target);
    imported.authorAlternatives = [
      ...imported.authorAlternatives!,
      await sealAuthorAlternative(forkAuthorAlternative(imported, '読み込む別案', { now: '2026-03-01T00:00:00.000Z' })),
    ];
    const prepared = await inspectScenario(await exportScenario(imported), { worker: false });
    const added = await db.importScenario(prepared, { mode: 'merge', baseRevision: target.revision });
    expect(added.project.authorAlternatives?.map(alternative => alternative.name)).toEqual(['保存済みの別案', '読み込む別案']);

    const collision = structuredClone(added.project), changed = structuredClone(collision.authorAlternatives![0]!);
    changed.name = '異なる同一ID';
    collision.authorAlternatives = [await sealAuthorAlternative(changed)];
    const conflictPackage = await inspectScenario(await exportScenario(collision), { worker: false });
    const preview = await db.previewImport(conflictPackage, { mode: 'merge' });
    expect(preview.conflicts).toContainEqual(expect.objectContaining({ id: changed.id, kind: 'alternative' }));
    await expect(db.importScenario(conflictPackage, { mode: 'merge', baseRevision: added.project.revision })).rejects.toMatchObject({ code: 'IMPORT_CONFLICT' });
    await expect(db.importScenario(conflictPackage, { mode: 'merge', baseRevision: added.project.revision, resolutions: { [changed.id]: 'incoming' } })).rejects.toMatchObject({ code: 'IMPORT_CONFLICT', message: expect.stringContaining('上書きできません') });
    expect(await db.getProject(target.projectId)).toEqual(added.project);
  });

  it('restores an old branch head by appending a new immutable version instead of deleting later versions', async () => {
    const db = open(); let project = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    project.authorAlternatives = [await editedAlternative(project)];
    project = (await db.saveProject(project, { reason: '別案を編集' })).project;
    const before = project.authorAlternatives![0]!, originalIds = before.versions.map(version => version.id);
    const rollback = structuredClone(project), branch = rollback.authorAlternatives![0]!;
    branch.versions = branch.versions.slice(0, 1); branch.headVersionId = branch.versions[0]!.id;
    const restored = (await db.saveProject(rollback, { reason: '別案の版を復元' })).project.authorAlternatives![0]!;
    expect(restored.versions.map(version => version.id).slice(0, originalIds.length)).toEqual(originalIds);
    expect(restored.versions).toHaveLength(3);
    expect(restored.versions.at(-1)?.content.entities.find(entity => entity.kind === 'scene' && entity.id === project.entities[1]?.id)?.name).toBe('門の前');
    expect(restored.headVersionId).toBe(restored.versions.at(-1)?.id);
  });

  it('recomputes selected changes at adoption and rejects a re-sealed receipt rewrite', async () => {
    const db = open(); let project = (await db.saveProject(fixture(), { reason: '初期保存' })).project;
    project.authorAlternatives = [await editedAlternative(project)];
    project = (await db.saveProject(project, { reason: '別案保存' })).project;
    const alternative = project.authorAlternatives![0]!, changes = diffAuthorAlternative(alternative, project);
    const rename = changes.find(change => change.scope === 'entity' && change.path[0] === 'name')!;
    const staleCanonical = structuredClone(project);
    (staleCanonical.entities.find(entity => entity.kind === 'scene') as Entity<'scene'>).name = '正本で先に改名';
    expect(() => applyAlternativeChanges(staleCanonical, alternative, changes, new Set([rename.key]))).toThrow(/競合/);

    const adopted = applyAlternativeChanges(project, alternative, changes, new Set([rename.key]), '2026-02-01T00:00:00.000Z', newId());
    adopted.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(alternative, adopted.receipt, '3'))];
    project = (await db.saveProject(adopted.project, { reason: '選んだ別案を正本に採用' })).project;
    expect(project.authorAlternatives?.[0]?.applyReceipts).toHaveLength(1);
    const before = structuredClone(project), tampered = structuredClone(project), current = tampered.authorAlternatives![0]!;
    current.applyReceipts[0]!.patches[0]!.after.value = '誤った採用値';
    tampered.authorAlternatives = [await sealAuthorAlternative(current)];
    await expect(db.saveProject(tampered, { reason: '採用記録を書き換え' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await db.getProject(project.projectId)).toEqual(before);
  });

  it('keeps reference-valued adoption receipts valid through full backup, clone, reopen, and re-export', async () => {
    const source = open(), project = fixture();
    const first = createEntity(project.projectId, 'character', '視点 A');
    const second = createEntity(project.projectId, 'character', '視点 B');
    const scene = project.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!;
    scene.data.povId = first.id;
    scene.data.body[0]!.text = `本文中の識別文字列 ${first.id} は文章です。`;
    project.entities.push(first, second);
    let current = (await source.saveProject(project, { reason: '初期版' })).project;

    const alternative = forkAuthorAlternative(current, '視点を変える', { now: '2026-04-01T00:00:00.000Z' });
    const branch = projectContent(alternative.versions[0]!.content);
    (branch.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!).data.povId = second.id;
    current.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(alternative, branch, '視点を変更', '2026-04-02T00:00:00.000Z'))];
    current = (await source.saveProject(current, { reason: '別案を保存' })).project;

    const storedAlternative = current.authorAlternatives![0]!, changes = diffAuthorAlternative(storedAlternative, current);
    const povChange = changes.find(change => change.scope === 'entity' && change.itemId === scene.id && change.path.join('.') === 'data.povId')!;
    const adopted = applyAlternativeChanges(current, storedAlternative, changes, new Set([povChange.key]), '2026-04-03T00:00:00.000Z', newId());
    expect(adopted.project.history).toBe(current.history);
    adopted.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(storedAlternative, adopted.receipt, '3'))];
    const reviewed = addChangeReviews(current, adopted.project);
    expect(reviewed.entities.some(entity => entity.kind === 'review' && entity.customValues['changeReview.generatedBy'] === 'semantic-change-review/v1')).toBe(true);
    const unexpected = createEntity(current.projectId, 'note', '採用保存に紛れた内容', { body: textToRichText('これは差分ではありません。') });
    await expect(source.saveProject({ ...reviewed, entities: [...reviewed.entities, unexpected] }, { reason: '採用へ任意変更を混ぜる' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    current = (await source.saveProject(reviewed, { reason: '別案の視点を採用', includeHistory: false })).project;
    const receipt = current.authorAlternatives![0]!.applyReceipts[0]!;
    expect(receipt.patches.find(patch => patch.path.join('.') === 'data.povId')).toMatchObject({ before: { present: true, value: first.id }, after: { present: true, value: second.id } });
    expect(await validateProjectIntegrity(current)).toEqual([]);

    const fullBackup = await inspectScenario(await source.exportProject(current.projectId), { worker: false });
    const importTarget = fixture(), explicitMap = Object.fromEntries(collectImportIds(fullBackup.project).map(item => [item.id, item.id === current.projectId ? importTarget.projectId : newId()]));
    const mappedPlan = await planCrossProjectImport(fullBackup, importTarget, { idMap: explicitMap });
    expect(await validateProjectIntegrity(mappedPlan.mappedProject)).toEqual([]);
    const mappedReceipt = mappedPlan.mappedProject.authorAlternatives![0]!.applyReceipts[0]!;
    expect(mappedReceipt.patches.find(patch => patch.path.join('.') === 'data.povId')?.after.value).toBe(explicitMap[second.id]);
    const cloneDatabase = `alternative-clone-${newId()}`, cloneStore = open(cloneDatabase), cloned = await cloneStore.importScenario(fullBackup, { mode: 'clone' });
    expect(cloned.project.projectId).not.toBe(current.projectId);
    cloneStore.close();
    const reopenedStore = open(cloneDatabase);
    const reopened = (await reopenedStore.getProject(cloned.project.projectId))!;
    const mapped = cloned.idMap!;
    const mappedScene = reopened.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene' && entity.id === mapped[scene.id])!;
    expect(mappedScene.data.povId).toBe(mapped[second.id]);
    expect(mappedScene.data.body[0]!.text).toContain(first.id);
    const clonedAlternative = reopened.authorAlternatives![0]!;
    const clonedPatch = clonedAlternative.applyReceipts[0]!.patches.find(patch => patch.path.join('.') === 'data.povId')!;
    expect(clonedPatch.itemId).toBe(mapped[scene.id]);
    expect(clonedPatch.before.value).toBe(mapped[first.id]);
    expect(clonedPatch.after.value).toBe(mapped[second.id]);
    expect(await validateProjectIntegrity(reopened)).toEqual([]);
    const reexported = await inspectScenario(await reopenedStore.exportProject(reopened.projectId), { worker: false });
    expect(reexported.project.authorAlternatives?.[0]?.applyReceipts[0]?.patches).toEqual(clonedAlternative.applyReceipts[0]?.patches);
  });

  it('records removed entities and relations as logically absent across native reopen and full backup', async () => {
    const databaseName = `alternative-removal-${newId()}`, db = open(databaseName), project = fixture();
    const character = createEntity(project.projectId, 'character', 'つながりの起点');
    const note = createEntity(project.projectId, 'note', '別案で削除する記録', { body: textToRichText('本文') });
    project.entities.push(character, note);
    const relation = { id: newId(), projectId: project.projectId, revision: '0', fromId: character.id, toId: note.id, relationType: 'reference', direction: 'forward' as const, validity: emptyValidity(), evidenceIds: [], status: 'confirmed' as const, visibility: 'private' as const };
    project.relations.push(relation);
    let current = (await db.saveProject(project, { reason: '初期版' })).project;
    const alternative = forkAuthorAlternative(current, '記録を外す', { now: '2026-05-01T00:00:00.000Z' });
    const branch = projectContent(alternative.versions[0]!.content);
    branch.entities = branch.entities.filter(entity => entity.id !== note.id);
    branch.relations = branch.relations.filter(item => item.id !== relation.id);
    current.authorAlternatives = [await sealAuthorAlternative(appendAlternativeVersion(alternative, branch, '記録と関係を削除', '2026-05-02T00:00:00.000Z'))];
    current = (await db.saveProject(current, { reason: '削除する別案' })).project;
    const stored = current.authorAlternatives![0]!, changes = diffAuthorAlternative(stored, current);
    const selected = new Set(changes.filter(change => change.itemId === note.id || change.itemId === relation.id).map(change => change.key));
    const adopted = applyAlternativeChanges(current, stored, changes, selected, '2026-05-03T00:00:00.000Z', newId());
    adopted.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(stored, adopted.receipt, '3'))];
    current = (await db.saveProject(adopted.project, { reason: '記録と関係を削除', includeHistory: false })).project;
    expect(current.entities.find(entity => entity.id === note.id)?.deletedAt).toBeTruthy();
    expect(current.relations.find(item => item.id === relation.id)?.deletedAt).toBeTruthy();
    expect(await validateProjectIntegrity(current)).toEqual([]);
    db.close();
    const reopened = open(databaseName), loaded = (await reopened.getProject(current.projectId))!;
    expect(await validateProjectIntegrity(loaded)).toEqual([]);
    await expect(reopened.exportProject(current.projectId)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('creates and clones a snapshot-origin branch on the first native save with empty history', async () => {
    const db = open(), project = fixture();
    project.snapshots.push(await snapshot(project));
    project.authorAlternatives = [await sealAuthorAlternative(forkAuthorAlternative(project, '公開版から始める', { snapshotId: project.snapshots[0]!.id, now: '2026-06-01T00:00:00.000Z' }))];
    const saved = (await db.saveProject(project, { reason: '固定版からの別案を初回保存' })).project;
    expect(saved.history[0]?.before.authorAlternatives).toEqual([]);
    expect(await validateProjectIntegrity(saved)).toEqual([]);
    const archive = await inspectScenario(await db.exportProject(saved.projectId), { worker: false });
    const cloned = await open().importScenario(archive, { mode: 'clone' });
    expect(cloned.project.authorAlternatives?.[0]?.sourceSnapshotId).toBe(cloned.idMap![project.snapshots[0]!.id]);
    expect(await validateProjectIntegrity(cloned.project)).toEqual([]);
  });

  it('persists chapter-reading evidence against its pinned content and rejects a changed observation', async () => {
    const db = open(), project = fixture();
    const published = await snapshot(project); project.snapshots.push(published);
    let session = await startChapterReading(project, { contentVersionId: published.id });
    session = presentNextChapterScene(project, session);
    const checkpointId = newId(), record = pinChapterReadingRecord(session, { checkpointId, snapshotId: published.id });
    const checkpoint = createEntity(project.projectId, 'checkpoint', '章読み通しの開始', record.checkpoint); checkpoint.id = checkpointId;
    const trace = createEntity(project.projectId, 'trace', '章読み通し', record.trace);
    project.entities.push(checkpoint, trace);
    const saved = (await db.saveProject(project, { reason: '章読み通し記録を保存' })).project;
    expect(saved.entities.find(entity => entity.id === trace.id && entity.kind === 'trace')?.kind).toBe('trace');
    const invalid = structuredClone(saved), invalidTrace = invalid.entities.find((entity): entity is Entity<'trace'> => entity.kind === 'trace')!;
    invalidTrace.data.readingPath!.occurrences[0]!.after.rngPosition += 1;
    await expect(db.saveProject(invalid, { reason: '観察結果を改ざん' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await db.getProject(project.projectId)).toEqual(saved);
  });

  it('replays a borrowed character holder from the exact hashed world pin without merging that world into local content', async () => {
    const foreign = createProject('固定された共通世界'), foreignCharacter = createEntity(foreign.projectId, 'character', '遠い案内人');
    foreign.entities.push(foreignCharacter);
    const fixedWorld = await createWorldSnapshot(foreign, '共通世界の固定版'), worldEdition = fixedWorld.snapshots[0]!;
    const project = fixture(), scene = project.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!;
    const localCharacter = createEntity(project.projectId, 'character', '地元の人物');
    const assertion = createEntity(project.projectId, 'assertion', '聞いた話', { subjectId: localCharacter.id, predicate: '案内人の存在', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: localCharacter.id });
    const foreshadow = createEntity(project.projectId, 'foreshadow', '遠方からの知らせ');
    const disclosure = createEntity(project.projectId, 'disclosure', '案内人を知っている', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id }, condition: { op: 'known', assertionId: assertion.id, holderId: foreignCharacter.id } });
    project.entities.push(localCharacter, assertion, foreshadow, disclosure);
    project.worldReferences.push({ projectId: foreign.projectId, immutableSnapshotId: worldEdition.id, contentHash: worldEdition.contentHash });
    const published = await snapshot(project); project.snapshots.push(published);
    const state = initializeRuntimeState(project, published.id);
    state.assertions.push({ assertionId: assertion.id, holderId: foreignCharacter.id, truth: 'true' });
    const worldSnapshots = { [worldEdition.id]: worldEdition.content };
    let session = await startChapterReading(project, { contentVersionId: published.id, state, worldSnapshots });
    expect(session.content.entities.some(entity => entity.id === foreignCharacter.id)).toBe(false);
    session = presentNextChapterScene(project, session);
    expect(session.status).toBe('terminal');
    expect(session.occurrences[0]?.conditionResults).toContainEqual(expect.objectContaining({ targetId: disclosure.id, value: 'true' }));

    const checkpointId = newId(), record = pinChapterReadingRecord(session, { checkpointId, snapshotId: published.id });
    const checkpoint = createEntity(project.projectId, 'checkpoint', '開始状態', record.checkpoint); checkpoint.id = checkpointId;
    project.entities.push(checkpoint, createEntity(project.projectId, 'trace', '読書記録', record.trace));
    expect(await validateProjectIntegrity(project, { worldSnapshots })).toEqual([]);
    const trace = project.entities.find((entity): entity is Entity<'trace'> => entity.kind === 'trace')!;
    const replay = await replayChapterReading(project, trace.data, checkpoint.data, { worldSnapshots });
    expect(replay.occurrences).toEqual(session.occurrences);

    const changedWorld = structuredClone(worldEdition.content);
    changedWorld.entities.find(entity => entity.id === foreignCharacter.id)!.name = '別の案内人';
    await expect(startChapterReading(project, { contentVersionId: published.id, state, worldSnapshots: { [worldEdition.id]: changedWorld } })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'INTEGRITY_FAILED' })]) });
    await expect(startChapterReading(project, { contentVersionId: published.id, state })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'REFERENCE_INVALID' })]) });
  });

  it('hashes each immutable pinned world image once per durable validation run', async () => {
    const foreign = createProject('一度だけhashする世界'), fixed = await createWorldSnapshot(foreign, '固定版'), edition = fixed.snapshots[0]!;
    const project = fixture(); project.worldReferences.push({ projectId: fixed.projectId, immutableSnapshotId: edition.id, contentHash: edition.contentHash });
    const image = projectContent(project), worlds = { [edition.id]: edition.content };
    const cache = createPinnedWorldDigestCache(), digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    try {
      expect(await verifyPinnedWorlds(image, worlds, 'first', cache)).toEqual([]);
      expect(await verifyPinnedWorlds(image, worlds, 'second', cache)).toEqual([]);
      expect(digest).toHaveBeenCalledTimes(1);
    } finally { digest.mockRestore(); }
  });

  it('rejects one transitive snapshot ID claimed with different hashes in a diamond closure', async () => {
    const leaf = createProject('共有される末端'), leafEditionId = newId();
    const left = createProject('左の世界'), right = createProject('右の世界'), root = createProject('参照する作品');
    const leafContent = projectContent(leaf), leftContent = projectContent(left), rightContent = projectContent(right);
    const actualLeafHash = await sha256(jsonBytes(leafContent)), conflictingHash = actualLeafHash === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
    leftContent.worldReferences.push({ projectId: leaf.projectId, immutableSnapshotId: leafEditionId, contentHash: actualLeafHash });
    rightContent.worldReferences.push({ projectId: leaf.projectId, immutableSnapshotId: leafEditionId, contentHash: conflictingHash });
    root.worldReferences = [
      { projectId: left.projectId, immutableSnapshotId: newId(), contentHash: await sha256(jsonBytes(leftContent)) },
      { projectId: right.projectId, immutableSnapshotId: newId(), contentHash: await sha256(jsonBytes(rightContent)) },
    ];
    const snapshots = { [leafEditionId]: leafContent, [root.worldReferences[0]!.immutableSnapshotId]: leftContent, [root.worldReferences[1]!.immutableSnapshotId]: rightContent };
    expect(await verifyPinnedWorlds(projectContent(root), snapshots)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'REFERENCE_INVALID' })]));
  });

  it('freezes both captured edition bytes and world closure before an asynchronous digest yields', async () => {
    const foreign = createProject('hash待ちの共通世界'), character = createEntity(foreign.projectId, 'character', '固定人物'); foreign.entities.push(character);
    const fixed = await createWorldSnapshot(foreign, '固定版'), edition = fixed.snapshots[0]!;
    const project = fixture(); project.worldReferences.push({ projectId: fixed.projectId, immutableSnapshotId: edition.id, contentHash: edition.contentHash });
    const published = await snapshot(project); project.snapshots.push(published);
    const worlds = { [edition.id]: edition.content };
    let signalEntered!: () => void, resume!: () => void;
    const entered = new Promise<void>(resolve => { signalEntered = resolve; }), wait = new Promise<void>(resolve => { resume = resolve; });
    const original = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle); let first = true;
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      if (first) { first = false; signalEntered(); await wait; }
      return original(algorithm, data);
    });
    try {
      const pending = captureRuntimeContent(project, published.id, { worldSnapshots: worlds });
      await entered;
      project.snapshots[0]!.content.entities.find(entity => entity.kind === 'scene')!.name = '';
      worlds[edition.id]!.entities.find(entity => entity.id === character.id)!.name = '';
      resume();
      const captured = await pending;
      expect(captured.entities.find(entity => entity.kind === 'scene')?.name).toBe('門の前');
    } finally { digest.mockRestore(); }
  });
});
