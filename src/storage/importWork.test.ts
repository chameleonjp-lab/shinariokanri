// Controlled-worker transport and fake IndexedDB evidence, not real browser or device evidence.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import {createWorldSnapshot} from '../domain/world';
import {inspectScenario, performImportWork} from './archive';
import {FORMAT_VERSION} from './json';
import {StorageError} from './errors';
import {runImportWork, type ImportWork} from './importWork';
import {ScenarioStore} from './store';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  static automatic = false;
  messages: any[] = [];
  assets = new Map<number, {resolve: (bytes: Uint8Array | undefined) => void; reject: (cause: unknown) => void}>();
  nextAsset = 0;
  terminated = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { ControlledWorker.instances.push(this); }
  postMessage(message: any) {
    const captured = structuredClone(message); this.messages.push(captured);
    if (captured.type === 'import-asset') {
      const pending = this.assets.get(captured.id); this.assets.delete(captured.id);
      if (captured.error) pending?.reject(Object.assign(new StorageError(captured.error.code, captured.error.message, captured.error.path), {issues: captured.error.issues ?? []}));
      else pending?.resolve(captured.bytes);
      return;
    }
    if (ControlledWorker.automatic) queueMicrotask(() => { void runImportWork(captured.work, undefined, hash => new Promise((resolve, reject) => {
      const id = ++this.nextAsset; this.assets.set(id, {resolve, reject}); this.emit({type: 'asset', id, hash});
    }))
      .then(result => this.emit({type: 'done', result: structuredClone(result)}))
      .catch(cause => this.emit({type: 'error', error: {
        code: cause.code, message: cause.message, path: cause.path, issues: cause.issues,
      }})); });
  }
  terminate() { this.terminated++; }
  emit(message: unknown) { this.onmessage?.({data: message} as MessageEvent); }
}
function browser(automatic = false) {
  ControlledWorker.automatic = automatic;
  vi.stubGlobal('window', {}); vi.stubGlobal('Worker', ControlledWorker);
}
function request() {
  const project = createProject('受領した作品😀'), world = createProject('受領した世界😀');
  return {step: 'structure', project, worlds: {[world.projectId]: world}} satisfies ImportWork;
}
const stores: ScenarioStore[] = [];
function open(databaseName = `import-work-${newId()}`) {
  const store = new ScenarioStore({databaseName, accountId: 'local-worker-transport-fixture'});
  stores.push(store); return store;
}
afterEach(async () => {
  vi.unstubAllGlobals(); ControlledWorker.instances = []; ControlledWorker.automatic = false;
  for (const store of stores.splice(0)) await store.deleteDatabase();
});

describe('cancellable import worker transport', () => {
  it('captures the fallback input before SHA awaits and does not borrow later caller content', async () => {
    const project = await createWorldSnapshot(createProject('固定した検査候補'), '固定版'), originalHash = project.snapshots[0].contentHash;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { entered(); await gate; return digest(...args); });
    try {
      const pending = performImportWork({step: 'hashes', project, worlds: {}}); await waiting;
      project.snapshots[0].contentHash = '0'.repeat(64); project.snapshots[0].content.name = '呼出後の変更';
      release(); await expect(pending).resolves.toEqual({});
      expect(project.snapshots[0].contentHash).not.toBe(originalHash); expect(project.snapshots[0].content.name).toBe('呼出後の変更');
    } finally { release(); spy.mockRestore(); }
  });
  it('captures manuscript and world bytes at postMessage and completes only once', async () => {
    browser(); const work = request(), promise = performImportWork(work), worker = ControlledWorker.instances[0];
    work.project.name = '後の稿'; Object.values(work.worlds)[0].name = '後の世界';
    const captured = worker.messages[0].work as ImportWork;
    expect(captured.project.name).toBe('受領した作品😀');
    expect(Object.values(captured.worlds)[0].name).toBe('受領した世界😀');
    const result = await runImportWork(captured); worker.emit({type: 'done', result});
    expect((await promise).project!.name).toBe('受領した作品😀'); expect(worker.terminated).toBe(1);
    worker.emit({type: 'done', result: {project: work.project}}); worker.onerror?.();
    expect(worker.terminated).toBe(1);
  });
  it('rejects an already cancelled request without starting a worker', async () => {
    browser(); const controller = new AbortController(); controller.abort();
    await expect(performImportWork(request(), {signal: controller.signal})).rejects.toMatchObject({code: 'CANCELLED'});
    expect(ControlledWorker.instances).toHaveLength(0);
  });
  it('terminates synchronous worker work immediately and rejects its later success', async () => {
    browser(); const controller = new AbortController(), promise = performImportWork(request(), {signal: controller.signal});
    const rejection = expect(promise).rejects.toMatchObject({code: 'CANCELLED'}), worker = ControlledWorker.instances[0];
    controller.abort(); worker.emit({type: 'done', result: {project: createProject('遅い結果')}});
    worker.emit({type: 'error', error: {code: 'HASH_MISMATCH', message: '古い失敗'}});
    await rejection; expect(worker.terminated).toBe(1);
  });
  it('retains the starting signal when caller options are replaced', async () => {
    browser(); const first = new AbortController(), later = new AbortController();
    const remove = vi.spyOn(first.signal, 'removeEventListener'), options = {signal: first.signal};
    const promise = performImportWork(request(), options), rejection = expect(promise).rejects.toMatchObject({code: 'CANCELLED'});
    options.signal = later.signal; first.abort(); await rejection;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(later.signal.aborted).toBe(false); expect(ControlledWorker.instances[0].terminated).toBe(1);
  });
  it('preserves the exact validation code, message, path and issues', async () => {
    browser(); const promise = performImportWork(request()), worker = ControlledWorker.instances[0];
    const issues = [{code: 'REFERENCE_MISSING', path: 'project.entities[0].data.targetId', message: '参照先がありません。'}];
    worker.emit({type: 'error', error: {code: 'VALIDATION_FAILED', message: '元の詳細😀', path: 'data/project.json', issues}});
    await expect(promise).rejects.toMatchObject({name: 'StorageError', code: 'VALIDATION_FAILED', message: '元の詳細😀', path: 'data/project.json', issues});
    expect(worker.terminated).toBe(1);
  });
  it('reports an unexpected worker failure without certifying archive corruption', async () => {
    browser(); const promise = performImportWork(request()), worker = ControlledWorker.instances[0];
    worker.onerror?.(); await expect(promise).rejects.toMatchObject({code: 'SAVE_FAILED'});
    expect(worker.terminated).toBe(1);
  });
  it('uses the starting asset reader and transfers a private byte copy', async () => {
    browser(); const bytes = new Uint8Array([0, 1, 2, 255]), first = vi.fn(() => bytes), later = vi.fn();
    const options = {loadAsset: first}, promise = performImportWork(request(), options), worker = ControlledWorker.instances[0];
    options.loadAsset = later; worker.emit({type: 'asset', id: 7, hash: 'fixture-content-hash'});
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2));
    const reply = worker.messages[1]; expect(reply).toMatchObject({type: 'import-asset', id: 7, bytes});
    expect(reply.bytes.buffer).not.toBe(bytes.buffer); expect(first).toHaveBeenCalledExactlyOnceWith('fixture-content-hash'); expect(later).not.toHaveBeenCalled();
    worker.emit({type: 'done', result: {}}); await promise;
  });
  it('keeps the original asset-read rejection details', async () => {
    browser(); const issues = [{path: 'assets/old.bin', message: '元の詳細'}];
    const promise = performImportWork(request(), {loadAsset: () => { throw Object.assign(new StorageError('HASH_MISMATCH', '元の素材エラー', 'assets/old.bin'), {issues}); }}), worker = ControlledWorker.instances[0];
    worker.emit({type: 'asset', id: 8, hash: 'fixture-content-hash'}); await vi.waitFor(() => expect(worker.messages).toHaveLength(2));
    const error = worker.messages[1].error; expect(error).toEqual({code: 'HASH_MISMATCH', message: '元の素材エラー', path: 'assets/old.bin', issues});
    worker.emit({type: 'error', error}); await expect(promise).rejects.toMatchObject(error);
  });
  it('does not send an in-flight asset response into a terminated worker', async () => {
    browser(); const controller = new AbortController(); let release!: (bytes: Uint8Array) => void;
    const promise = performImportWork(request(), {signal: controller.signal, loadAsset: () => new Promise(resolve => { release = resolve; })}), worker = ControlledWorker.instances[0];
    const rejection = expect(promise).rejects.toMatchObject({code: 'CANCELLED'});
    worker.emit({type: 'asset', id: 9, hash: 'fixture-content-hash'}); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.abort(); release(new Uint8Array([3, 4])); await rejection; await Promise.resolve();
    expect(worker.messages).toHaveLength(1); expect(worker.terminated).toBe(1);
  });
});

async function savedSource() {
  const source = open(), project = createProject('Worker復元元');
  project.entities.push(createEntity(project.projectId, 'note', '原本文', {body: textToRichText('😀原段落を維持')}));
  const saved = (await source.saveProject(project, {reason: '原本文を原子保存'})).project;
  const prepared = await inspectScenario(await source.exportProject(saved.projectId), {worker: false});
  return {saved, prepared};
}
describe('worker checks before the unchanged atomic import transaction', () => {
  it('cancels a full-history cold read without discarding history or pending operations', async () => {
    const name = `worker-read-cancel-${newId()}`, writer = open(name), project = createProject('取消しても残る全履歴');
    const saved = (await writer.saveProject(project, {reason: '全履歴を保存'})).project; writer.close();
    const reader = open(name), controller = new AbortController(); browser();
    const pending = reader.getProject(saved.projectId, {signal: controller.signal});
    const rejection = expect(pending).rejects.toMatchObject({code: 'CANCELLED'});
    await vi.waitFor(() => expect(ControlledWorker.instances).toHaveLength(1));
    const worker = ControlledWorker.instances[0], captured = worker.messages[0].work as ImportWork;
    expect(captured.project.history).toEqual(saved.history);
    controller.abort(); await rejection; expect(worker.terminated).toBe(1);
    worker.emit({type: 'done', result: {project: captured.project}});
    vi.unstubAllGlobals(); expect(await reader.getProject(saved.projectId)).toEqual(saved);
    expect(await reader.listOutbox(saved.projectId)).toHaveLength(1);
  });
  it.each(['complete', 'cancel'] as const)('handles a concurrent save replay (%s) outside the write transaction without changing the committed result', async disposition => {
    const name = `worker-save-replay-${newId()}`, writer = open(name), reader = open(name);
    const saved = (await writer.saveProject(createProject('同じ操作の二重保存'), {reason: '元の作品'})).project;
    const draft = (await reader.getProject(saved.projectId))!; draft.name = '一度だけ採用する名前';
    const operationId = newId(), controller = new AbortController(), internals = reader as unknown as {db: Dexie}, transaction = internals.db.transaction.bind(internals.db);
    let entered!: () => void, release!: () => void, held = false;
    const waiting = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const spy = vi.spyOn(internals.db, 'transaction').mockImplementation(((...args: unknown[]) => {
      if (args[0] === 'rw' && !held) { held = true; entered(); return gate.then(() => (transaction as (...values: unknown[]) => Promise<unknown>)(...args)); }
      return (transaction as (...values: unknown[]) => Promise<unknown>)(...args);
    }) as typeof internals.db.transaction);
    try {
      const pending = reader.saveProject(draft, {reason: '同じ採用操作', operationId, signal: controller.signal}); await waiting;
      const first = await writer.saveProject(draft, {reason: '同じ採用操作', operationId});
      browser(disposition === 'complete'); const activeTransactions: boolean[] = [], post = ControlledWorker.prototype.postMessage;
      const postSpy = vi.spyOn(ControlledWorker.prototype, 'postMessage').mockImplementation(function (this: ControlledWorker, message: unknown) {
        activeTransactions.push(!!Dexie.currentTransaction); return post.call(this, message);
      });
      try {
        release();
        if (disposition === 'cancel') {
          const rejection = expect(pending).rejects.toMatchObject({code: 'CANCELLED'});
          await vi.waitFor(() => expect(activeTransactions.length).toBeGreaterThan(0));
          controller.abort(); await rejection;
          expect(ControlledWorker.instances[0].terminated).toBe(1);
        } else expect(await pending).toEqual(first);
        expect(activeTransactions.length).toBeGreaterThan(0); expect(activeTransactions.every(active => !active)).toBe(true);
      } finally { postSpy.mockRestore(); }
      vi.unstubAllGlobals(); reader.close(); const cold = open(name), current = (await cold.getProject(saved.projectId))!;
      expect(current).toEqual(first.project); expect(current.history).toHaveLength(2); expect(await cold.listOutbox(saved.projectId)).toHaveLength(2);
    } finally { release(); spy.mockRestore(); }
  });
  it('keeps history, pending intents and current text independent after clone and cold reload', async () => {
    const {saved, prepared} = await savedSource(), name = `worker-clone-cold-${newId()}`, destination = open(name);
    browser(true); const imported = await destination.importScenario(prepared, {mode: 'clone'});
    const steps = ControlledWorker.instances.flatMap(worker => worker.messages.map(message => message.work.step));
    expect(steps).toEqual(['structure', 'recovery', 'ids', 'clone', 'map_recovery', 'hashes', 'integrity', 'structure', 'rehash_recovery', 'structure', 'integrity', 'recovery']);
    expect(ControlledWorker.instances.every(worker => worker.terminated === 1)).toBe(true);
    expect(Object.isFrozen(imported.project.history[0].after.entities[0])).toBe(true);
    expect(Object.isFrozen(imported.project.entities[0])).toBe(false);
    expect(() => { imported.project.history[0].after.entities[0].name = '旧版を改竄'; }).toThrow();
    vi.unstubAllGlobals(); destination.close(); const coldStore = open(name), cold = (await coldStore.getProject(imported.project.projectId))!;
    expect(cold.history).toHaveLength(2); expect((await coldStore.getSaveState(cold.projectId)).recoveredPendingCount).toBe(1);
    const historical = cold.history[0].after.entities[0], current = cold.entities[0];
    expect(historical.id).toBe(imported.idMap![saved.entities[0].id]); expect(current).not.toBe(historical);
    current.name = '現稿だけを編集'; expect(historical.name).toBe('原本文');
    expect(prepared.project).toEqual(saved);
  });
  it.each(['structure', 'commit'] as const)('cancels at %s without creating content, history or pending rows', async stage => {
    const {prepared} = await savedSource(), destination = open(), controller = new AbortController();
    browser(true);
    await expect(destination.importScenario(prepared, {mode: 'new', signal: controller.signal,
      onStage: value => { if (value === stage) controller.abort(); },
    })).rejects.toMatchObject({code: 'CANCELLED'});
    vi.unstubAllGlobals(); expect(await destination.listProjects()).toEqual([]);
    expect(await destination.listHistory(prepared.project.projectId)).toEqual([]);
    expect(await destination.listOutbox(prepared.project.projectId)).toEqual([]);
    expect(await destination.listRecoveredPending(prepared.project.projectId)).toEqual([]);
  });
  it('rechecks real owners despite a forged caller ID list, leaving the existing destination unchanged', async () => {
    const destination = open(), existing = (await destination.saveProject(createProject('保持する作品'), {reason: '先に保存'})).project;
    const source = createProject('ID衝突の候補'), note = createEntity(source.projectId, 'note', '原稿一', {body: textToRichText('😀原稿')});
    const publicBlock = textToRichText('独立した公開段落')[0];
    const profile = createEntity(source.projectId, 'projection_profile', '公開案一', {
      audience: 'reader', includedIds: [note.id], allowedKinds: ['note'], idPolicy: 'preserve',
      namePolicy: {mode: 'replace', replacement: '公開名'}, publicTexts: {[note.id]: {summary: [publicBlock]}},
      blockSources: {[publicBlock.id]: note.data.body[0].id},
    });
    const other = structuredClone(profile); other.id = newId(); other.name = '公開案二';
    source.entities = [profile, note, other];
    // Build the DTO without calling the archive inspector: public callers cannot
    // make precomputed metadata authoritative or bypass the store's own check.
    await expect(runImportWork({step: 'structure', project: source, worlds: {}})).resolves.toMatchObject({project: {projectId: source.projectId}});
    const prepared = {manifest: {format: 'scenario-package' as const, formatVersion: FORMAT_VERSION, minimumReaderVersion: FORMAT_VERSION,
      snapshotId: newId(), exportedAt: new Date().toISOString(), files: [], projectId: source.projectId, assetMode: 'embedded' as const},
      project: source, worlds: {}, assets: [], warnings: [],
      summary: {name: source.name, entities: 3, relations: 0, assetBytes: 0, missingAssets: 0, history: 0}, importIds: []};
    browser(true);
    await expect(destination.importScenario(prepared, {mode: 'new'})).rejects.toMatchObject({code: 'IMPORT_CONFLICT', path: publicBlock.id});
    vi.unstubAllGlobals(); expect(await destination.listProjects()).toEqual([existing]);
    expect(await destination.listOutbox(source.projectId)).toEqual([]);
  });
});
