// Controlled-worker transport and fake IndexedDB evidence, not real browser or device evidence.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEntity, createProject, newId, RELATION_TYPES, textToRichText} from '../domain/model';
import type {CommandRecord, ContentState} from '../domain/types';
import {createWorldSnapshot} from '../domain/world';
import {inspectScenario, performImportWork} from './archive';
import {FORMAT_VERSION, jsonBytes, sha256} from './json';
import {StorageError} from './errors';
import {createImportWorkWorkerRunner, freezeCapturedImportWork, runImportWork, runImportWorkForWorker, type ImportWork} from './importWork';
import {createImportWorkSession} from './importWorkSession';
import {ScenarioStore} from './store';
import {isImmutablePlainData} from '../domain/immutablePlainData';

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
async function capturedOutputWork(step: 'structure' | 'recovery' | 'map_recovery' | 'rehash_recovery'): Promise<ImportWork> {
  const {project, commands} = recoveryFixture(2), serverRevision = '4';
  const recovery = {version: 1 as const, projectId: step === 'map_recovery' ? newId() : project.projectId,
    sourceRevision: project.revision, serverRevision,
    pending: await Promise.all(commands.map(async command => ({operationId: step === 'map_recovery' ? newId() : command.operationId,
      command: structuredClone(command), commandHash: step === 'rehash_recovery' ? '0'.repeat(64) : await sha256(jsonBytes(command))}))) };
  if (step === 'structure') return {step, project, worlds: {}};
  if (step === 'recovery') return {step, project, recovery, worlds: {}};
  if (step === 'rehash_recovery') return {step, project, recovery, worlds: {}};
  const idMap = Object.fromEntries(recovery.pending.map((item, index) => [item.operationId, commands[index]!.operationId]));
  return {step, project, recovery, idMap, worlds: {}};
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

describe('private import validation DTO boundary', () => {
  it.each(['full_read', 'structure', 'integrity', 'recovery', 'ids', 'hashes', 'map_recovery', 'rehash_recovery'] as const)(
    'freezes only the private copy for %s validation', step => {
      const caller = {...request(), step} satisfies ImportWork, privateWork = structuredClone(caller);
      expect(freezeCapturedImportWork(privateWork)).toBe(privateWork);
      expect(isImmutablePlainData(privateWork)).toBe(true);
      expect(Object.isFrozen(caller)).toBe(false); expect(Object.isFrozen(caller.project)).toBe(false);
      expect(Object.isFrozen(caller.worlds)).toBe(false); expect(caller.project.name).toBe('受領した作品😀');
    });

  it('leaves every object mutable when the captured graph contains an unsupported value', () => {
    const privateWork = structuredClone(request());
    Object.defineProperty(privateWork.project, 'legacyDate', {value: new Date('2026-10-13T00:00:00.000Z'), enumerable: true});
    expect(freezeCapturedImportWork(privateWork)).toBe(privateWork);
    expect(Object.isFrozen(privateWork)).toBe(false); expect(Object.isFrozen(privateWork.project)).toBe(false);
    expect(Object.isFrozen(privateWork.project.entities)).toBe(false); expect(Object.isFrozen(privateWork.worlds)).toBe(false);
  });

  it.each(['worlds', 'sync_recovery', 'clone', 'mapped_plan', 'merge_conflicts', 'merge', 'combine_history'] as const)(
    'keeps result-bearing or transformation step %s on its existing mutable path', step => {
      const work = {...request(), step, target: createProject('既存の統合先')} satisfies ImportWork;
      expect(freezeCapturedImportWork(work)).toBe(work);
      expect(Object.isFrozen(work)).toBe(false); expect(Object.isFrozen(work.project)).toBe(false);
      expect(Object.isFrozen(work.target)).toBe(false);
    });

  it.each(['performImportWork', 'createImportWorkSession'] as const)(
    '%s freezes a detached Node validation copy and rechecks later edits', async route => {
      const work = request(), original = structuredClone(work), session = route === 'createImportWorkSession' ? createImportWorkSession() : undefined;
      const run = (candidate: ImportWork) => session ? session.run(candidate) : performImportWork(candidate);
      try {
        const result = await run(work);
        expect(result.project).toEqual(original.project); expect(result.project).not.toBe(work.project);
        expect(Object.isFrozen(work)).toBe(false); expect(Object.isFrozen(work.project)).toBe(false);
        expect(Object.isFrozen(result.project)).toBe(false);
        result.project!.name = 'Node側で編集できる結果';
        expect(work.project).toEqual(original.project);

        const changed = structuredClone(original); (changed.project as unknown as {name: unknown}).name = 42;
        await expect(run(changed)).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
        expect(Object.isFrozen(changed)).toBe(false); expect(Object.isFrozen(changed.project)).toBe(false);
      } finally { session?.dispose(); }
    });

  it.each([
    ['performImportWork', 'combine_history'], ['createImportWorkSession', 'combine_history'],
    ['performImportWork', 'merge_conflicts'], ['createImportWorkSession', 'merge_conflicts'],
  ] as const)('%s leaves %s result aliases editable and detached from both callers', async (route, step) => {
    const session = route === 'createImportWorkSession' ? createImportWorkSession() : undefined;
    const run = (work: ImportWork) => session ? session.run(work) : performImportWork(work);
    try {
      if (step === 'combine_history') {
        const target = recoveryFixture(1).project, originalTarget = structuredClone(target);
        const result = await run({step, project: createProject('履歴の結合候補'), target, worlds: {}});
        expect(result.history).toEqual(target.history); expect(Object.isFrozen(result.history)).toBe(false);
        expect(Object.isFrozen(result.history![0]!.after.entities[0])).toBe(false);
        result.history![0]!.after.entities[0]!.name = 'Node結合結果だけの編集';
        expect(target).toEqual(originalTarget);
      } else {
        const target = createProject('競合先'), existing = createEntity(target.projectId, 'note', '既存内容');
        target.entities.push(existing);
        const incoming = structuredClone(target); incoming.name = '取り込み作品'; incoming.entities[0]!.name = '取り込み内容';
        const originalTarget = structuredClone(target), originalIncoming = structuredClone(incoming);
        const result = await run({step, project: incoming, target, worlds: {}}), conflict = result.conflicts!.find(item => item.kind === 'entity')!;
        expect(Object.isFrozen(result.conflicts)).toBe(false); expect(Object.isFrozen(conflict.existing)).toBe(false);
        expect(Object.isFrozen(conflict.incoming)).toBe(false);
        (conflict.existing as {name: string}).name = '結果側の既存編集';
        (conflict.incoming as {name: string}).name = '結果側の受入編集';
        expect(target).toEqual(originalTarget); expect(incoming).toEqual(originalIncoming);
      }
    } finally { session?.dispose(); }
  });

  it.each(['performImportWork', 'createImportWorkSession'] as const)(
    '%s keeps validated Node recovery output mutable and detached from its source images', async route => {
      const {project, commands} = recoveryFixture(2), recovery = {version: 1 as const, projectId: project.projectId,
        sourceRevision: project.revision, serverRevision: '4', pending: await Promise.all(commands.map(async command => ({
          operationId: command.operationId, command: structuredClone(command), commandHash: await sha256(jsonBytes(command)),
        })))};
      const originalRecovery = structuredClone(recovery), originalProject = structuredClone(project), session = route === 'createImportWorkSession' ? createImportWorkSession() : undefined;
      const work: ImportWork = {step: 'recovery', project, recovery, worlds: {}}, run = (candidate: ImportWork) => session ? session.run(candidate) : performImportWork(candidate);
      try {
        const result = await run(work), returned = result.recovery!;
        expect(returned).toEqual(originalRecovery); expect(Object.isFrozen(returned)).toBe(false);
        expect(Object.isFrozen(returned.pending[0]!.command.after.entities)).toBe(false);
        returned.pending[0]!.command.after.entities[0]!.name = 'Node recovery結果だけの編集';
        expect(recovery).toEqual(originalRecovery); expect(project).toEqual(originalProject);
        expect(Object.isFrozen(work)).toBe(false); expect(Object.isFrozen(work.project)).toBe(false);
      } finally { session?.dispose(); }
    });

  it('returns the original editable topology when equal current and historical records were interned privately', async () => {
    const {saved} = await savedSource(), workProject = structuredClone(saved), current = workProject.entities[0]!;
    const historical = workProject.history[0]!.after.entities.find(entity => entity.id === current.id)!;
    workProject.history[0]!.after.entities[workProject.history[0]!.after.entities.indexOf(historical)] = structuredClone(current);
    const source = structuredClone(workProject), work: ImportWork = {step: 'structure', project: workProject, worlds: {}};
    const result = await performImportWork(work), currentResult = result.project!.entities.find(entity => entity.id === current.id)!;
    const historicalResult = result.project!.history[0]!.after.entities.find(entity => entity.id === current.id)!;
    expect(historicalResult).toEqual(currentResult); expect(historicalResult).not.toBe(currentResult);
    expect(Object.isFrozen(currentResult)).toBe(false); expect(Object.isFrozen(historicalResult)).toBe(false);
    currentResult.name = '編集可能な現稿';
    expect(historicalResult.name).toBe(current.name); expect(workProject).toEqual(source);
    expect(Object.isFrozen(work.project)).toBe(false);
  });

  it.each(['structure', 'recovery', 'map_recovery', 'rehash_recovery'] as const)(
    'publishes %s results through the same detached mutable worker message boundary', async step => {
      const caller = await capturedOutputWork(step), baseline = await runImportWork(structuredClone(caller));
      const workerWork = structuredClone(caller);
      expect(freezeCapturedImportWork(workerWork)).toBe(workerWork);
      expect(isImmutablePlainData(workerWork)).toBe(true);
      const privateResult = await runImportWorkForWorker(workerWork);
      // Worker postMessage performs this structured clone before the result is
      // visible to the caller; it restores the established mutable result API.
      const received = structuredClone(privateResult);
      expect(received).toEqual(baseline);
      expect(Object.isFrozen(caller)).toBe(false); expect(Object.isFrozen(caller.project)).toBe(false);
      expect(Object.isFrozen(workerWork)).toBe(true); expect(Object.isFrozen(workerWork.project)).toBe(true);
      const value = step === 'structure' ? received.project! : received.recovery!;
      expect(Object.isFrozen(value)).toBe(false);
      if (step !== 'structure') for (const item of received.recovery!.pending) {
        expect(item.commandHash).toBe(await sha256(jsonBytes(item.command)));
      }
      if (step === 'structure') {
        const current = received.project!.entities[0]!, historical = received.project!.history.at(-1)!.after.entities.find(item => item.id === current.id)!;
        const historicalName = historical.name, callerName = caller.project.entities[0]!.name;
        expect(historical).not.toBe(current);
        current.name = 'Worker受信後の現稿編集';
        expect(historical.name).toBe(historicalName);
        expect(caller.project.entities[0]!.name).toBe(callerName);
        expect(workerWork.project.entities[0]!.name).toBe(callerName);
      } else {
        const command = received.recovery!.pending[0]!.command;
        const originalReason = command.reason;
        expect(Object.isFrozen(command)).toBe(false);
        const adjacentAfter = command.after.entities[0]!;
        const adjacentBefore = received.recovery!.pending[1]!.command.before.entities.find(item => item.id === adjacentAfter.id)!;
        const adjacentName = adjacentBefore.name;
        expect(adjacentBefore).not.toBe(adjacentAfter);
        adjacentAfter.name = '隣のWorker履歴とは独立した編集';
        expect(adjacentBefore.name).toBe(adjacentName);
        command.reason = 'Worker受信後の復元編集';
        expect(command.reason).not.toBe(originalReason);
        expect(Object.isFrozen(workerWork.recovery!.pending[0]!.command)).toBe(true);
        if (step === 'recovery') expect(caller.recovery!.pending[0]!.command.reason).toBe(originalReason);
        else expect(caller.project.history[0]!.reason).toBe(originalReason);
      }
    });

  it.each(['structure', 'recovery', 'map_recovery', 'rehash_recovery'] as const)(
    'keeps %s rejection details identical on Node and worker paths', async step => {
      const makeInvalid = async (): Promise<ImportWork> => {
        const work = await capturedOutputWork(step);
        if (step === 'structure') (work.project as unknown as {name: unknown}).name = 42;
        if (step === 'recovery') work.recovery!.pending[0]!.commandHash = 'bad-hash';
        if (step === 'map_recovery') delete work.idMap;
        if (step === 'rehash_recovery') delete work.recovery;
        return work;
      };
      const rejectionDetails = async (promise: Promise<unknown>) => {
        try { await promise; }
        catch (error) {
          const value = error as StorageError & {issues?: unknown};
          return {code: value.code, message: value.message, path: value.path, issues: value.issues};
        }
        throw new Error('Expected import work to reject');
      };
      const nodeDetails = await rejectionDetails(runImportWork(await makeInvalid()));
      const workerWork = freezeCapturedImportWork(await makeInvalid());
      const workerDetails = await rejectionDetails(runImportWorkForWorker(workerWork));
      expect(workerDetails).toEqual(nodeDetails);
    });
});

describe('archive worker private validation boundary', () => {
  it('freezes the worker-owned validation message while keeping author input and result editable', async () => {
    const caller = {...request(), project: recoveryFixture(2).project}, workerWork = structuredClone(caller), posted: unknown[] = [];
    const workerScope: {onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void} = {
      onmessage: null, postMessage: message => { posted.push(structuredClone(message)); },
    };
    vi.stubGlobal('self', workerScope);
    await import('./archive.worker');
    workerScope.onmessage!({data: {type: 'import-work', requestId: 41, work: workerWork}} as MessageEvent);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const done = posted[0] as {type: string; result: {project: NonNullable<ImportWork['project']>}};
    expect(done.type).toBe('done');
    expect(Object.isFrozen(workerWork)).toBe(true); expect(Object.isFrozen(workerWork.project)).toBe(true);
    expect(Object.isFrozen(caller)).toBe(false); expect(Object.isFrozen(caller.project)).toBe(false);
    expect(done.result.project).not.toBe(workerWork.project); expect(Object.isFrozen(done.result.project)).toBe(false);
    const originalProjectName = caller.project.name;
    done.result.project.name = 'Worker結果の編集';
    expect(workerWork.project.name).toBe(originalProjectName); expect(caller.project.name).toBe(originalProjectName);
    const entityId = workerWork.project.entities[0]!.id;
    const current = done.result.project.entities.find(entity => entity.id === entityId)!;
    const historical = done.result.project.history.at(-1)!.after.entities.find(entity => entity.id === entityId)!;
    const historicalName = historical.name;
    expect(historical).not.toBe(current);
    current.name = 'Worker現稿の編集';
    expect(historical.name).toBe(historicalName);
    expect(workerWork.project.entities.find(entity => entity.id === entityId)!.name).toBe(historicalName);
    expect(caller.project.entities.find(entity => entity.id === entityId)!.name).toBe(historicalName);
  });
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
  it('reuses one private validation session only for unchanged worker images and clears it on corruption', async () => {
    const source = await capturedOutputWork('recovery'), runner = createImportWorkWorkerRunner();
    const structure = await runner.run({step: 'structure', project: source.project, worlds: source.worlds});
    expect(structure.project).toEqual(source.project);
    expect(Object.isFrozen(source.project)).toBe(false);
    const received = structuredClone(structure.project!);
    received.name = '受信後に編集した値';
    expect(source.project.name).not.toBe(received.name);

    const integrity = await runner.run({step: 'integrity', project: structuredClone(source.project), worlds: structuredClone(source.worlds)});
    expect(integrity).toEqual({});
    const recovery = await runner.run(structuredClone(source));
    expect(structuredClone(recovery.recovery)).toEqual(source.recovery);

    source.project.history[0]!.projectId = newId();
    expect(Object.isFrozen(source.project.history[0])).toBe(false);
    const changedHistory: ImportWork = {step: 'integrity', project: source.project, worlds: source.worlds};
    const details = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        const value = error as StorageError;
        return {code: value.code, message: value.message, path: value.path};
      }
      throw new Error('Expected changed history owner to reject');
    };
    expect(await details(runner.run(changedHistory))).toEqual(await details(runImportWork(structuredClone(changedHistory))));
    runner.reset();
  });

  it('keeps comparing late history values after the selected-array memo reaches its limit', async () => {
    const project = createProject('上限後も履歴を照合する');
    project.entities.push(createEntity(project.projectId, 'note', '履歴記録', {body: textToRichText('保持する本文😀')}));
    const {history: _history, ...base} = project;
    // The 44 before/after images contribute 132 selected collection arrays, exceeding the 128-pair cache limit.
    project.history = Array.from({length: 22}, (_, index) => ({
      operationId: newId(), projectId: project.projectId,
      baseRevision: String(index * 2), revision: String(index * 2 + 1), targetIds: [project.projectId],
      reason: `履歴${index}`, createdAt: '2026-10-14T00:00:00.000Z',
      before: {...structuredClone(base), revision: String(index * 2), name: `変更前${index}`},
      after: {...structuredClone(base), revision: String(index * 2 + 1), name: `変更後${index}`},
    }));
    const runner = createImportWorkWorkerRunner();
    await runner.run({step: 'structure', project: structuredClone(project), worlds: {}});

    const changed = structuredClone(project);
    changed.history.at(-1)!.after.entities[0]!.projectId = newId();
    expect(Object.isFrozen(changed.history.at(-1)!.after)).toBe(false);
    const changedWork: ImportWork = {step: 'structure', project: changed, worlds: {}};
    const details = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        const value = error as StorageError & {issues?: unknown};
        return {code: value.code, message: value.message, path: value.path, issues: value.issues};
      }
      throw new Error('Expected the late malformed history image to reject');
    };
    expect(await details(runner.run(changedWork))).toEqual(await details(runImportWork(structuredClone(changedWork))));
    runner.reset();
  });

  it('invalidates the session when a same-ID world snapshot or relation registry changes', async () => {
    const fixedWorld = await createWorldSnapshot(createProject('固定世界'), '参照版'), pin = fixedWorld.snapshots[0]!;
    const project = createProject('参照作品');
    project.worldReferences = [{projectId: fixedWorld.projectId, immutableSnapshotId: pin.id, contentHash: pin.contentHash}];
    const worlds = {[pin.id]: pin.content}, runner = createImportWorkWorkerRunner();
    await runner.run({step: 'structure', project: structuredClone(project), worlds: structuredClone(worlds)});
    const details = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        const value = error as StorageError;
        return {code: value.code, message: value.message, path: value.path};
      }
      throw new Error('Expected changed dependency to reject');
    };
    const unsupportedContexts = [
      {...worlds, unused: Number.NaN as unknown as typeof pin.content},
      {...worlds, ['\uD800']: pin.content},
    ];
    for (const unsupportedWorlds of unsupportedContexts) {
      const fallbackWork: ImportWork = {step: 'structure', project: structuredClone(project), worlds: unsupportedWorlds};
      const workerResult = await runner.run(fallbackWork), baseline = await runImportWork(structuredClone(fallbackWork));
      expect(structuredClone(workerResult.project)).toEqual(baseline.project);
      expect(Object.isFrozen(fallbackWork.project)).toBe(false);
      await runner.run({step: 'structure', project: structuredClone(project), worlds: structuredClone(worlds)});
    }
    const editedWorld = structuredClone(pin.content); editedWorld.name = '同じIDの別内容';
    const changedWorlds = {[pin.id]: editedWorld};
    const worldIntegrity: ImportWork = {step: 'integrity', project: structuredClone(project), worlds: changedWorlds};
    expect(await details(runner.run(worldIntegrity))).toEqual(await details(runImportWork(structuredClone(worldIntegrity))));

    const relationProject = createProject('対称関係'), a = createEntity(relationProject.projectId, 'character', '人物A'), b = createEntity(relationProject.projectId, 'character', '人物B');
    relationProject.entities.push(a, b);
    relationProject.relations.push({id: newId(), projectId: relationProject.projectId, revision: '0', fromId: a.id, toId: b.id,
      relationType: 'related', direction: 'symmetric', validity: {worldRange: null, routeCondition: null, presentationAnchor: null},
      evidenceIds: [], status: 'provisional', visibility: 'private'});
    const relationRunner = createImportWorkWorkerRunner();
    await relationRunner.run({step: 'structure', project: structuredClone(relationProject), worlds: {}});
    const related = RELATION_TYPES.find(type => type.key === 'related')!;
    const oldAllowSymmetric = related.allowSymmetric;
    related.allowSymmetric = false;
    try {
      const relationIntegrity: ImportWork = {step: 'integrity', project: structuredClone(relationProject), worlds: {}};
      expect(await details(relationRunner.run(relationIntegrity))).toEqual(await details(runImportWork(structuredClone(relationIntegrity))));
    } finally { related.allowSymmetric = oldAllowSymmetric; }
    runner.reset();
    relationRunner.reset();
  });

  it('does not reuse a same-ID pending command after its contents and SHA change, and keeps pending-only recovery valid', async () => {
    const source = await capturedOutputWork('recovery'), runner = createImportWorkWorkerRunner();
    await runner.run({step: 'structure', project: structuredClone(source.project), worlds: structuredClone(source.worlds)});
    const changedPending = structuredClone(source);
    changedPending.recovery!.pending[0]!.command.reason = '同じ操作IDの新しい本文';
    changedPending.recovery!.pending[0]!.commandHash = await sha256(jsonBytes(changedPending.recovery!.pending[0]!.command));
    const details = async (promise: Promise<unknown>) => {
      try { await promise; } catch (error) {
        const value = error as StorageError;
        return {code: value.code, message: value.message, path: value.path};
      }
      throw new Error('Expected operation conflict');
    };
    expect(await details(runner.run(changedPending))).toEqual(await details(runImportWork(structuredClone(changedPending))));
    await runner.run({step: 'structure', project: structuredClone(source.project), worlds: structuredClone(source.worlds)});
    const malformed = {...structuredClone(source), recovery: {...source.recovery!, pending: [null]} as unknown as ImportWork['recovery']};
    expect(await details(runner.run(malformed))).toEqual(await details(runImportWork(structuredClone(malformed))));

    const pendingSource = recoveryFixture(1), pendingProject = structuredClone(pendingSource.project), [pendingCommand] = pendingProject.history;
    pendingProject.history = [];
    const pendingRecovery: NonNullable<ImportWork['recovery']> = {version: 1, projectId: pendingProject.projectId,
      sourceRevision: pendingProject.revision, serverRevision: '2', pending: [{operationId: pendingCommand!.operationId,
        command: structuredClone(pendingCommand!), commandHash: await sha256(jsonBytes(pendingCommand!))}]};
    const pendingRunner = createImportWorkWorkerRunner();
    await pendingRunner.run({step: 'structure', project: structuredClone(pendingProject), worlds: {}});
    const pendingResult = await pendingRunner.run({step: 'recovery', project: structuredClone(pendingProject), worlds: {}, recovery: pendingRecovery});
    expect(structuredClone(pendingResult.recovery)).toEqual(pendingRecovery);
    runner.reset(); pendingRunner.reset();
  });

  it('clears proof state after failure, cancellation, reset, and overlapping work', async () => {
    const fixedWorld = await createWorldSnapshot(createProject('並行確認の世界'), '固定版'), pin = fixedWorld.snapshots[0]!;
    const project = createProject('並行確認の作品');
    project.worldReferences = [{projectId: fixedWorld.projectId, immutableSnapshotId: pin.id, contentHash: pin.contentHash}];
    const worlds = {[pin.id]: pin.content}, runner = createImportWorkWorkerRunner();
    await runner.run({step: 'structure', project: structuredClone(project), worlds: structuredClone(worlds)});
    let entered!: () => void, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let held = false;
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (!held) { held = true; entered(); await gate; }
      return digest(...args);
    });
    const controller = new AbortController();
    try {
      const canceled = runner.run({step: 'integrity', project: structuredClone(project), worlds: structuredClone(worlds)}, controller.signal);
      await started;
      const changedWorld = structuredClone(pin.content); changedWorld.name = '並行中に差し替えた同ID世界';
      const overlapping: ImportWork = {step: 'integrity', project: structuredClone(project), worlds: {[pin.id]: changedWorld}};
      await expect(runner.run(overlapping)).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
      controller.abort(); release();
      await expect(canceled).rejects.toMatchObject({code: 'CANCELLED'});
    } finally { release(); spy.mockRestore(); }
    runner.reset();
    const changedWorld = structuredClone(pin.content); changedWorld.name = 'reset後の同ID別世界';
    const afterReset: ImportWork = {step: 'integrity', project: structuredClone(project), worlds: {[pin.id]: changedWorld}};
    await expect(runner.run(afterReset)).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
  });

  it('keeps runner instances isolated and warm worker publications editable without history aliases', async () => {
    const source = await capturedOutputWork('recovery'), firstRunner = createImportWorkWorkerRunner(), secondRunner = createImportWorkWorkerRunner();
    const first = await firstRunner.run({step: 'structure', project: structuredClone(source.project), worlds: {}});
    const warm = structuredClone((await firstRunner.run({step: 'structure', project: structuredClone(source.project), worlds: {}})).project!);
    const entityId = source.project.entities[0]!.id;
    const current = warm.entities.find(entity => entity.id === entityId)!, historical = warm.history.at(-1)!.after.entities.find(entity => entity.id === entityId)!;
    expect(historical).not.toBe(current);
    const historyName = historical.name; current.name = 'warm worker output edit';
    expect(historical.name).toBe(historyName); expect(source.project.entities[0]!.name).toBe(historyName);
    const invalid = structuredClone(source.project); invalid.name = 42 as unknown as string;
    await expect(secondRunner.run({step: 'structure', project: invalid, worlds: {}})).rejects.toMatchObject({code: 'VALIDATION_FAILED'});
    expect((await firstRunner.run({step: 'structure', project: structuredClone(source.project), worlds: {}})).project).toEqual(source.project);
    expect(structuredClone(first.project)).toEqual(source.project);
    firstRunner.reset(); secondRunner.reset();
  });

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
