import 'fake-indexeddb/auto';
import Dexie, {type DBCore} from 'dexie';
import {afterEach, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import {inspectScenario} from './archive';
import {prepareAsset} from '../domain/attachments';
import {ScenarioStore} from './store';

const stores: ScenarioStore[] = [];
const open = (name: string) => { const store = new ScenarioStore({databaseName: name, accountId: 'isolated-save-state'}); stores.push(store); return store; };
const nativeDB = (store: ScenarioStore) => (store as unknown as {db: Dexie}).db;
function barrier() { let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; }); return {ready, release}; }
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });

function holdManuscript(db: Dexie) {
  const entered = barrier(), release = barrier(), stopped = barrier(); let enabled = false;
  db.use({stack: 'dbcore', name: 'hold-readonly-manuscript-result', create(down: DBCore): DBCore {
    return {...down, table(name) {
      const table = down.table(name); if (name !== 'entities') return table;
      return {...table, async query(request) {
        const actual = await table.query(request);
        if (!enabled) return actual;
        const transaction = request.trans as IDBTransaction;
        transaction.addEventListener('abort', stopped.release, {once: true});
        entered.release();
        // Hold a completed native result on its real readonly transaction.
        // This simulates expensive queued read work, never changes its rows.
        await new Promise<void>((resolve, reject) => {
          let released = false; void release.ready.then(() => { released = true; });
          const aborted = () => reject(transaction.error ?? new DOMException('Held native read aborted', 'AbortError'));
          transaction.addEventListener('abort', aborted, {once: true});
          const pump = () => {
            try {
              const request = transaction.objectStore('recordParts').get('__held_native_read__');
              request.onsuccess = () => { if (released) { transaction.removeEventListener('abort', aborted); resolve(); } else pump(); };
              request.onerror = () => { transaction.removeEventListener('abort', aborted); reject(request.error); };
            } catch (error) { transaction.removeEventListener('abort', aborted); reject(error); }
          };
          pump();
        });
        return actual;
      }};
    }};
  }});
  return {entered, release, stopped, enable: () => { enabled = true; }};
}

it('aborts the native export read while a manuscript result is held and preserves all rows for retry', async () => {
  const name = `export-queue-cancel-${newId()}`, writer = open(name), project = createProject('待機中読込の取消');
  project.entities.push(createEntity(project.projectId, 'note', '元の文章', {body: textToRichText('😀元の本文を減らさない')}));
  const saved = (await writer.saveProject(project, {reason: '元の保存'})).project;
  const reader = open(name), hold = holdManuscript(nativeDB(reader)); hold.enable();
  const controller = new AbortController(), exporting = reader.exportProject(project.projectId, {signal: controller.signal});
  const rejected = expect(exporting).rejects.toMatchObject({code: 'CANCELLED'});
  await hold.entered.ready;
  // Let the other bounded rows finish before cancellation. Only the held
  // manuscript result remains, so another read's signal check cannot abort it.
  await new Promise(resolve => { setTimeout(resolve, 30); });
  controller.abort();
  try {
    const outcome = await Promise.race([hold.stopped.ready.then(() => 'native_aborted'), new Promise<string>(resolve => { setTimeout(() => resolve('native_still_waiting'), 500); })]);
    expect(outcome).toBe('native_aborted');
  } finally { hold.release.release(); await rejected; }
  expect(await writer.getProject(project.projectId)).toEqual(saved);
  expect(await writer.listOutbox(project.projectId)).toHaveLength(1);
  const fresh = open(name), complete = await inspectScenario(await fresh.exportProject(project.projectId), {worker: false});
  expect(complete.project).toEqual(saved); expect(complete.recovery?.pending[0].command).toEqual(saved.history[0]);
});

it('reads live save counts from the same native snapshot without rereading an unchanged cached manuscript, and reloads a newer edition', async () => {
  const name = `save-state-current-${newId()}`, writer = open(name), project = createProject('保存表示の版と実素材');
  const first = await prepareAsset(new Uint8Array([1, 2, 3]), '最初の素材.bin', 'application/octet-stream');
  const {bytes: firstBytes, preview: _preview, ...metadata} = first;
  project.entities.push(createEntity(project.projectId, 'attachment', '最初の実素材', metadata));
  const saved = (await writer.saveProject(project, {reason: '最初の素材', assets: [{contentHash: first.contentHash, bytes: firstBytes, mediaType: first.mediaType}]})).project;
  const reader = open(name), hold = holdManuscript(nativeDB(reader));
  expect((await reader.getProjectForEditing(project.projectId))?.revision).toBe(saved.revision); hold.enable();
  const state = reader.getSaveState(project.projectId);
  try {
    const outcome = await Promise.race([state.then(value => ({state: value})), hold.entered.ready.then(() => ({manuscriptReadStarted: true}))]);
    expect(outcome).toEqual({state: {localSaved: true, pendingCount: 1, recoveredPendingCount: 0, pendingAssetCount: 1, serverRevision: '0', syncState: 'pending'}});
    await writer.confirmAssetUpload(project.projectId, {contentHash: first.contentHash, bytes: firstBytes.length, mediaType: first.mediaType});
    expect(await reader.getSaveState(project.projectId)).toMatchObject({pendingCount: 1, pendingAssetCount: 0});
    const second = await prepareAsset(new Uint8Array([4, 5, 6]), '新しい素材.bin', 'application/octet-stream');
    const {bytes: secondBytes, preview: _secondPreview, ...secondMetadata} = second;
    const changed = (await writer.getProjectForEditing(project.projectId))!;
    changed.entities.push(createEntity(project.projectId, 'attachment', '新版の実素材', secondMetadata));
    await writer.saveProject(changed, {reason: '新版の素材', assets: [{contentHash: second.contentHash, bytes: secondBytes, mediaType: second.mediaType}]});
    const newer = reader.getSaveState(project.projectId);
    await hold.entered.ready; hold.release.release();
    expect(await newer).toMatchObject({localSaved: true, pendingCount: 2, pendingAssetCount: 1});
  } finally { hold.release.release(); await state; }
});
