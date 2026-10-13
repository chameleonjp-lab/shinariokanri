// Controlled-worker transport and fake IndexedDB evidence, not real browser or device evidence.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import type {CommandRecord, ContentState} from '../domain/types';
import {createWorldSnapshot} from '../domain/world';
import {inspectScenario, performImportWork} from './archive';
import {FORMAT_VERSION, jsonBytes, sha256} from './json';
import {StorageError} from './errors';
import {runImportWork, type ImportWork} from './importWork';
import {createImportWorkSession} from './importWorkSession';
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
      const id = ++this.nextAsset; this.assets.set(id, {resolve, reject}); this.emit({type: 'asset', requestId: captured.requestId, id, hash});
    }))
      .then(result => this.emit({type: 'done', requestId: captured.requestId, result: structuredClone(result)}))
      .catch(cause => this.emit({type: 'error', requestId: captured.requestId, error: {
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
function recoveryFixture(count = 113) {
  const project = createProject('復元hashの作品');
  project.entities.push(...Array.from({length: 65}, (_, index) => createEntity(project.projectId, 'note', `保存メモ${index}`, {body: textToRichText(`本文${index}😀`)})));
  const {history: _history, ...base} = project;
  const states: ContentState[] = Array.from({length: count + 1}, (_, index) => {
    const state = structuredClone(base); state.revision = String(index); state.name = `復元版${index}`;
    if (index === count) {
      const changed = state.entities[0]!;
      if (changed.kind !== 'note') throw new Error('Expected note fixture');
      changed.name = '最終版の同ID記録😀'; changed.data.body = textToRichText('順序とUnicodeを変えた最終記録😀');
      state.entities = [...state.entities.slice(1), changed];
    }
    return state;
  });
  const commands: CommandRecord[] = Array.from({length: count}, (_, index) => ({operationId: newId(), projectId: project.projectId,
    baseRevision: String(index), revision: String(index + 1), targetIds: [project.projectId], reason: `復元保存${index}`,
    createdAt: '2026-10-13T00:00:00.000Z', before: structuredClone(states[index]!), after: structuredClone(states[index + 1]!)}));
  Object.assign(project, structuredClone(states[count]!)); project.history = commands;
  return {project, commands};
}
async function captureImportDigests(work: ImportWork, afterFirstDigest?: () => void | Promise<void>, signal?: AbortSignal) {
  const calls: Uint8Array[] = [];
  let entered!: () => void, release!: () => void, released = false;
  const firstDigest = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const data = args[1], view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    calls.push(view.slice());
    if (!released) { entered(); await gate; }
    const result = createHash('sha256').update(view).digest();
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
  });
  try {
    const pending = runImportWork(work, signal);
    if (afterFirstDigest) { await firstDigest; await afterFirstDigest(); }
    release(); released = true;
    return {result: await pending, calls};
  } finally { release(); released = true; spy.mockRestore(); }
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

describe('operation-owned import worker', () => {
  it('keeps the direct Node structure result mutable and detached from caller input', async () => {
    const work = request();
    work.project = Object.assign(Object.create(null), work.project);
    const original = structuredClone(work.project);
    const result = await runImportWork(work);
    expect(result.project).toEqual(original);
    expect(result.project).not.toBe(work.project);
    expect(Object.getPrototypeOf(result.project)).toBe(null);
    expect(Object.isFrozen(result.project)).toBe(false);
    result.project!.name = '編集できるNode検査結果';
    expect(work.project).toEqual(original);
  });

  it('runs the real checks again on changed input rather than reusing the previous proof', async () => {
    browser(true); const session = createImportWorkSession(), first = request();
    try {
      expect((await session.run(first)).project).toEqual(first.project);
      const changed = structuredClone(first); (changed.project as unknown as {name: unknown}).name = 42;
      await expect(session.run(changed)).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
      expect(first.project.name).toBe('受領した作品😀');
      expect(ControlledWorker.instances).toHaveLength(1);
      expect(ControlledWorker.instances[0].terminated).toBe(1);
    } finally { session.dispose(); }
  });
  it('ignores the preceding step\'s delayed result and asset request', async () => {
    browser(); const session = createImportWorkSession();
    try {
      const first = session.run(request()), worker = ControlledWorker.instances[0];
      const oldId = worker.messages[0].requestId; worker.emit({type: 'done', requestId: oldId, result: {}}); await first;
      const read = vi.fn(), second = session.run(request(), {loadAsset: read}); let settled = false;
      void second.then(() => { settled = true; });
      worker.emit({type: 'done', requestId: oldId, result: {ids: []}});
      worker.emit({type: 'asset', requestId: oldId, id: 91, hash: 'preceding-step'});
      await Promise.resolve(); await Promise.resolve();
      expect(settled).toBe(false); expect(read).not.toHaveBeenCalled();
      worker.emit({type: 'done', requestId: worker.messages[1].requestId, result: {}}); await expect(second).resolves.toEqual({});
    } finally { session.dispose(); }
    expect(ControlledWorker.instances[0].terminated).toBe(1);
  });
  it('terminates a cancelled session and discards an already requested asset reply', async () => {
    browser(); const session = createImportWorkSession(), controller = new AbortController(); let release!: (bytes: Uint8Array) => void;
    const pending = session.run(request(), {signal: controller.signal, loadAsset: () => new Promise(resolve => { release = resolve; })});
    const rejected = expect(pending).rejects.toMatchObject({code: 'CANCELLED'}), worker = ControlledWorker.instances[0];
    worker.emit({type: 'asset', requestId: worker.messages[0].requestId, id: 23, hash: 'held-asset'});
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    controller.abort(); release(new Uint8Array([1, 2, 3])); await rejected; await Promise.resolve();
    await expect(session.run(request())).rejects.toMatchObject({code: 'CANCELLED'}); session.dispose();
    expect(worker.messages).toHaveLength(1); expect(worker.terminated).toBe(1);
  });
});

describe('owned recovery rehash work', () => {
  it('recomputes the 113 exact canonical command hashes in both mapping paths', async () => {
    const {project, commands} = recoveryFixture(), sourceOperationIds = commands.map(() => newId());
    const recovery = {version: 1 as const, projectId: newId(), sourceRevision: project.revision, serverRevision: '12',
      pending: commands.map((command, index) => ({operationId: sourceOperationIds[index]!, command: structuredClone(command), commandHash: '0'.repeat(64)}))};
    const idMap = Object.fromEntries(sourceOperationIds.map((id, index) => [id, commands[index]!.operationId]));
    const mapWork: ImportWork = {step: 'map_recovery', project, recovery, idMap, worlds: {}};
    const expectedMapped = structuredClone(commands), mapped = await captureImportDigests(mapWork);
    expect(mapped.calls).toEqual(expectedMapped.map(command => jsonBytes(command)));
    expect(mapped.result.recovery!.pending.map(item => item.commandHash)).toEqual(await Promise.all(expectedMapped.map(command => sha256(jsonBytes(command)))));
    expect(mapped.result.recovery!.pending.map(item => item.command)).toEqual(expectedMapped);
    expect(mapped.result.recovery!.pending[0]!.commandHash).not.toBe(recovery.pending[0]!.commandHash);
    expect(Object.isFrozen(mapped.result.recovery!.pending[0]!.command.after.entities)).toBe(false);
    const adjacentAfter = mapped.result.recovery!.pending[0]!.command.after.entities[0]!;
    const nextBefore = mapped.result.recovery!.pending[1]!.command.before.entities.find(entity => entity.id === adjacentAfter.id)!;
    expect(adjacentAfter).not.toBe(nextBefore);
    const nextBeforeName = nextBefore.name;
    adjacentAfter.name = '隣接する履歴は別の編集対象';
    expect(nextBefore.name).toBe(nextBeforeName);
    const sourceName = project.history[0]!.after.entities[0]!.name;
    mapped.result.recovery!.pending[0]!.command.after.entities[0]!.name = '編集可能な復元結果';
    expect(project.history[0]!.after.entities[0]!.name).toBe(sourceName);

    const fallback = structuredClone(commands[0]!); fallback.operationId = newId(); fallback.reason = '履歴にない送信待ち操作';
    const rehashRecovery = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '19',
      pending: [...commands.map(command => ({operationId: command.operationId, command: {...structuredClone(command), reason: '改ざん入力'}, commandHash: 'f'.repeat(64)})),
        {operationId: fallback.operationId, command: fallback, commandHash: 'a'.repeat(64)}]};
    const rehashWork: ImportWork = {step: 'rehash_recovery', project, recovery: rehashRecovery, worlds: {}};
    const expectedRehashed = [...structuredClone(commands), structuredClone(fallback)], rehashed = await captureImportDigests(rehashWork);
    expect(rehashed.calls).toEqual(expectedRehashed.map(command => jsonBytes(command)));
    expect(rehashed.result.recovery!.pending.map(item => item.commandHash)).toEqual(await Promise.all(expectedRehashed.map(command => sha256(jsonBytes(command)))));
    expect(rehashed.result.recovery!.pending.map(item => item.command)).toEqual(expectedRehashed);
    expect(rehashed.result.recovery!.pending.slice(0, commands.length).every(item => item.commandHash !== 'f'.repeat(64))).toBe(true);
    expect(Object.isFrozen(rehashed.result.recovery!.pending[0]!.command.after.entities)).toBe(false);
    const beforeResultEdit = project.history[0]!.after.entities[0]!.name;
    rehashed.result.recovery!.pending[0]!.command.after.entities[0]!.name = '編集可能な再hash結果';
    expect(project.history[0]!.after.entities[0]!.name).toBe(beforeResultEdit);
  }, 60_000);

  it('maps only the captured project, pending list and id map after the first digest yields', async () => {
    const {project, commands} = recoveryFixture(2), sourceOperationIds = [newId(), newId()];
    const recovery = {version: 1 as const, projectId: newId(), sourceRevision: project.revision, serverRevision: '0',
      pending: commands.map((command, index) => ({operationId: sourceOperationIds[index]!, command: structuredClone(command), commandHash: '0'.repeat(64)}))};
    const idMap = Object.fromEntries(sourceOperationIds.map((id, index) => [id, commands[index]!.operationId]));
    const work: ImportWork = {step: 'map_recovery', project, recovery, idMap, worlds: {}}, initialCommands = structuredClone(commands);
    const captured = await captureImportDigests(work, () => {
      project.history[1]!.after.name = 'SHA開始後に変更';
      recovery.serverRevision = '9'; recovery.pending[0]!.commandHash = 'f'.repeat(64);
      delete idMap[sourceOperationIds[1]!];
    });
    expect(captured.calls).toEqual(initialCommands.map(command => jsonBytes(command)));
    expect(captured.result.recovery!.sourceRevision).toBe('2');
    expect(captured.result.recovery!.pending.map(item => item.command)).toEqual(initialCommands);
    expect(captured.result.recovery!.pending[0]!.origin?.serverRevision).toBe('0');
    await expect(runImportWork(work)).rejects.toMatchObject({code: 'IMPORT_CONFLICT', path: sourceOperationIds[1]});

    idMap[sourceOperationIds[1]!] = commands[1]!.operationId;
    const fresh = await runImportWork(work);
    expect(fresh.recovery!.pending[1]!.command.after.name).toBe('SHA開始後に変更');
    expect(fresh.recovery!.pending[0]!.origin?.serverRevision).toBe('9');
  });

  it('rehashes the captured project and pending command before using a later fallback', async () => {
    const {project, commands} = recoveryFixture(1), recovery = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '2',
      pending: [{operationId: commands[0]!.operationId, command: {...structuredClone(commands[0]!), reason: '偽造したfallback'}, commandHash: '0'.repeat(64)}]};
    const work: ImportWork = {step: 'rehash_recovery', project, recovery, worlds: {}}, originalCommand = structuredClone(commands[0]!);
    const captured = await captureImportDigests(work, () => {
      project.revision = '8'; recovery.pending[0]!.operationId = newId();
      recovery.pending[0]!.command.reason = '後から採用するfallback'; recovery.pending[0]!.commandHash = 'f'.repeat(64);
    });
    expect(captured.calls).toEqual([jsonBytes(originalCommand)]);
    expect(captured.result.recovery!.sourceRevision).toBe('1');
    expect(captured.result.recovery!.pending[0]!.command).toEqual(originalCommand);
    expect(captured.result.recovery!.pending[0]!.commandHash).toBe(await sha256(jsonBytes(originalCommand)));

    const fallback = await runImportWork(work);
    expect(fallback.recovery!.sourceRevision).toBe('8');
    expect(fallback.recovery!.pending[0]!.command.reason).toBe('後から採用するfallback');
    expect(fallback.recovery!.pending[0]!.commandHash).toBe(await sha256(jsonBytes(fallback.recovery!.pending[0]!.command)));
  });

  it('validates the captured recovery and returns its original editable graph', async () => {
    const {project, commands} = recoveryFixture(2), recovery = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '4',
      pending: await Promise.all(commands.map(async command => ({operationId: command.operationId, command: structuredClone(command), commandHash: await sha256(jsonBytes(command))})))};
    const work: ImportWork = {step: 'recovery', project, recovery, worlds: {}}, expected = structuredClone(recovery);
    const captured = await captureImportDigests(work, () => {
      project.history[1]!.after.name = '検査開始後に変わった正本履歴';
      recovery.pending[0]!.command.reason = '検査開始後に変わった送信待ち';
    });
    expect(captured.calls).toEqual(expected.pending.map(item => jsonBytes(item.command)));
    expect(captured.result.recovery).toEqual(expected);
    expect(Object.isFrozen(captured.result.recovery!.pending[0]!.command.after.entities)).toBe(false);
    const after = captured.result.recovery!.pending[0]!.command.after.entities[0]!;
    const nextBefore = captured.result.recovery!.pending[1]!.command.before.entities.find(entity => entity.id === after.id)!;
    expect(after).not.toBe(nextBefore);
    const nextName = nextBefore.name;
    after.name = '復元結果だけを編集';
    expect(nextBefore.name).toBe(nextName);
    await expect(runImportWork(work)).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
  });

  it('keeps recovery operation conflicts and owner-specific historical ID checks', async () => {
    const {project, commands} = recoveryFixture(1), command = {...structuredClone(commands[0]!), reason: '同じIDに別の有効な内容'};
    const conflicting = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '5',
      pending: [{operationId: command.operationId, command, commandHash: await sha256(jsonBytes(command))}]};
    for (const step of ['recovery', 'ids'] as const) await expect(runImportWork({step, project, recovery: conflicting, worlds: {}})).rejects.toMatchObject({
      code: 'OPERATION_CONFLICT', path: command.operationId,
    });

    const ownerProject = createProject('所有者別の旧block ID'), ownerA = createEntity(ownerProject.projectId, 'note', '現在稿の所有者');
    ownerA.data.body = textToRichText('共有される固定ID');
    const ownerB = createEntity(ownerProject.projectId, 'note', '復元履歴の所有者');
    ownerB.data.body = structuredClone(ownerA.data.body);
    ownerProject.entities.push(ownerA); ownerProject.revision = '1';
    const {history: _history, ...base} = ownerProject, before = structuredClone(base), after = structuredClone(base);
    after.entities = [ownerB]; after.revision = '1';
    const pendingCommand: CommandRecord = {operationId: newId(), projectId: ownerProject.projectId, baseRevision: '0', revision: '1',
      targetIds: [ownerProject.projectId], reason: '保存する過去の所有者', createdAt: '2026-10-13T00:00:00.000Z', before, after};
    const pendingOnly = {version: 1 as const, projectId: ownerProject.projectId, sourceRevision: ownerProject.revision, serverRevision: '5',
      pending: [{operationId: pendingCommand.operationId, command: pendingCommand, commandHash: '0'.repeat(64)}]};
    await expect(runImportWork({step: 'ids', project: ownerProject, recovery: pendingOnly, worlds: {}})).rejects.toMatchObject({
      code: 'IMPORT_CONFLICT', path: ownerA.data.body![0]!.id,
    });
  });

  it.each(['map_recovery', 'rehash_recovery'] as const)('cancels %s after an awaited command digest', async step => {
    const {project, commands} = recoveryFixture(2), controller = new AbortController();
    const recovery = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '3',
      pending: commands.map(command => ({operationId: command.operationId, command: structuredClone(command), commandHash: '0'.repeat(64)}))};
    const work: ImportWork = step === 'map_recovery'
      ? {step, project, recovery: {...recovery, projectId: newId()}, idMap: Object.fromEntries(recovery.pending.map(item => [item.operationId, item.operationId])), worlds: {}}
      : {step, project, recovery, worlds: {}};
    await expect(captureImportDigests(work, () => controller.abort(), controller.signal)).rejects.toMatchObject({code: 'CANCELLED'});
  });

  it.each(['map_recovery', 'rehash_recovery'] as const)('retains the legacy encoder for unsupported %s graphs', async step => {
    const {project, commands} = recoveryFixture(1), command = commands[0]!;
    let reads = 0;
    Object.defineProperty(command.after, 'legacyExtension', {enumerable: true, configurable: true, get: () => { reads++; return 'legacy value'; }});
    const expectedHash = await sha256(jsonBytes(command)), expectedReads = reads;
    reads = 0;
    const sourceOperationId = newId(), pending = [{operationId: sourceOperationId, command, commandHash: '0'.repeat(64)}];
    const recovery = {version: 1 as const, projectId: project.projectId, sourceRevision: project.revision, serverRevision: '7', pending};
    const work: ImportWork = step === 'map_recovery'
      ? {step, project, recovery: {...recovery, projectId: newId()}, idMap: {[sourceOperationId]: command.operationId}, worlds: {}}
      : {step, project, recovery, worlds: {}};
    const result = await runImportWork(work);
    expect(result.recovery!.pending[0]!.commandHash).toBe(expectedHash);
    expect(reads).toBe(expectedReads);
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
