import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import { ScenarioStore } from '../storage/store';
import { inspectScenario } from '../storage/archive';
import { sha256 } from '../storage/json';
import { acknowledgeImportedVersions, retainImportedVersion } from './BackupPanel';
import { authorBusy, purgeAuthorMemory, ScenarioStoreProvider, useAuthorScope } from './StoreContext';

const stores: ScenarioStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) {
    purgeAuthorMemory(store.accountId!);
    await store.deleteDatabase();
  }
});
function open(accountId: string) {
  const store = new ScenarioStore({ accountId, databaseName: `import-ack-${newId()}` });
  stores.push(store);
  return store;
}
function bindScope(store: ScenarioStore, projectId: string) {
  let scope = '';
  function ScopeBinding() { scope = useAuthorScope(projectId); return null; }
  renderToStaticMarkup(createElement(ScenarioStoreProvider, { store, children: createElement(ScopeBinding) }));
  return scope;
}

describe('import completion follows the observed saved version across project selection', () => {
  it('retains the real input until the cloned ID is visible at the saved revision in its own account, then acknowledges once', async () => {
    const store = open('import-ack-author-A'), other = open('import-ack-author-B');
    const original = createProject('同じ作品名の復元');
    const scene = createEntity(original.projectId, 'scene', '保存済みの本文', { body: textToRichText('作者の原段落😀') });
    scene.status = 'confirmed'; original.entities.push(scene);
    const source = (await store.saveProject(original, { reason: '復元元の通常保存' })).project;
    const bytes = await store.exportProject(source.projectId), sourceHash = await sha256(bytes);
    const scope = bindScope(store, source.projectId);
    bindScope(other, source.projectId);
    await store.saveImportDraft({ key: scope, bytes, sourceHash, mode: 'clone', targetProjectId: '', idMap: {}, resolutions: {} });
    const retainedInput = await store.getImportDraft(scope);
    expect(retainedInput?.bytes).toEqual(bytes);
    const result = await store.importScenario(await inspectScenario(bytes), { mode: 'clone' });
    expect(result.localSaved).toBe(true);
    expect(result.project.projectId).not.toBe(source.projectId);
    expect(result.project.name).toBe(source.name);
    const persisted = await store.getProject(result.project.projectId);
    expect(persisted).toEqual(result.project);

    // This is the same public lifecycle entry that the real UI commit uses
    // after the native transaction resolves; no private draft map is exposed.
    retainImportedVersion(scope, result.project);
    expect(authorBusy(store.accountId!)).toBe(true);
    expect(acknowledgeImportedVersions([source], `${store.accountId}:`)).toEqual([]);
    const notYetVisible = { ...result.project, revision: (BigInt(result.project.revision) - 1n).toString() };
    expect(acknowledgeImportedVersions([source, notYetVisible], `${store.accountId}:`)).toEqual([]);
    expect(acknowledgeImportedVersions([source, persisted!], `${other.accountId}:`)).toEqual([]);
    expect(await store.getImportDraft(scope)).toEqual(retainedInput);
    expect(authorBusy(store.accountId!)).toBe(true);

    const confirmed = acknowledgeImportedVersions([source, persisted!], `${store.accountId}:`);
    expect(confirmed).toEqual([{ sourceScope: scope, projectId: persisted!.projectId, revision: result.project.revision, notice: '検査した作品を端末内に復元しました。保存した版を確認しました。' }]);
    expect(authorBusy(store.accountId!)).toBe(false);
    await vi.waitFor(async () => { expect(await store.getImportDraft(scope)).toBeUndefined(); });
    expect(acknowledgeImportedVersions([source, persisted!], `${store.accountId}:`)).toEqual([]);
    expect(await store.getProject(source.projectId)).toEqual(source);
    expect(await store.getProject(result.project.projectId)).toEqual(persisted);
  });
});
