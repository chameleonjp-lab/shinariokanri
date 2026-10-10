// Canonical compatibility probes are separate from real saved-command recovery.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText, validateProject } from '../domain/model';
import type { CommandRecord, ProjectData } from '../domain/types';
import { inspectScenario } from './archive';
import { StorageError } from './errors';
import { equalJson, jsonBytes, sha256 } from './json';
import { projectWithRecoveryHistory, validateRecovery, type PortableRecovery } from './recovery';
import { ScenarioStore } from './store';

const operationId = '1468c347-01e3-4ae1-84d6-46884c7bfbc8';
function comparison(left: unknown, right: unknown): boolean {
  const previous = { operationId, probe: left }, incoming = { operationId, probe: right };
  try {
    projectWithRecoveryHistory({ history: [previous] } as unknown as ProjectData, {
      pending: [{ operationId, command: incoming }],
    } as unknown as PortableRecovery);
    return true;
  } catch (cause) {
    if (cause instanceof StorageError && cause.code === 'OPERATION_CONFLICT') return false;
    throw cause;
  }
}
function outcome(action: () => boolean) {
  try { return { type: 'boolean', value: action() }; }
  catch (cause) {
    return cause instanceof StorageError
      ? { type: 'storage_error', code: cause.code, message: cause.message }
      : { type: 'other_error', name: (cause as Error).name, message: (cause as Error).message };
  }
}

describe('recovery comparator canonical language only; not domain acceptance', () => {
  const shared = { text: '😀漢字e\u0301\n', data: [null, true, false, -0, 1.5] };
  const equalCases: [string, unknown, unknown][] = [
    ['key order and object undefined', { b: 2, a: '😀', omitted: undefined }, { a: '😀', b: 2 }],
    ['finite signed zero', { value: -0 }, { value: 0 }],
    ['sharing is not equality by identity', { first: shared, second: shared }, structuredClone({ first: shared, second: shared })],
    ['null prototype data', Object.assign(Object.create(null), { a: '😀', b: [1, 2] }), { b: [1, 2], a: '😀' }],
    ['single sparse hole uses legacy encoder', new Array(1), []],
    ['two sparse holes keep legacy separators', new Array(2), new Array(2)],
    ['array extra own field stays legacy ignored', Object.assign([1], { extra: 'ignored' }), [1]],
    ['Date stays legacy object encoding', new Date('2026-10-10T00:00:00Z'), {}],
    ['object key escaping is not newly rejected', { ['\ud800']: 1 }, { ['\ud800']: 1 }],
  ];
  const unequalCases: [string, unknown, unknown][] = [
    ['array order', [1, 2], [2, 1]],
    ['null does not mean omitted', { value: null }, {}],
    ['no Unicode normalization', { value: '\u00e9' }, { value: 'e\u0301' }],
    ['two holes are not empty', new Array(2), []],
    ['one changed shared branch', { first: shared, second: shared }, { first: shared, second: { ...shared, text: '変更😀' } }],
  ];
  it.each(equalCases)('%s is equal under both algorithms', (_label, left, right) => {
    expect(equalJson(left, right)).toBe(true);
    expect(comparison(left, right)).toBe(true);
  });
  it.each(unequalCases)('%s differs under both algorithms', (_label, left, right) => {
    expect(equalJson(left, right)).toBe(false);
    expect(comparison(left, right)).toBe(false);
  });
  it('checks invalid values before identity or early inequality can return', () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    const invalid = [[undefined], { value: NaN }, { value: Infinity }, { value: -Infinity }, { value: 1n }, { value: () => 1 }, { value: Symbol('private') }, { text: '\ud800' }, { text: '\udc00' }, circular];
    for (const value of invalid) {
      expect(outcome(() => comparison(value, value))).toEqual(outcome(() => equalJson(value, value)));
      expect(outcome(() => comparison({ first: 1 }, value))).toEqual(outcome(() => equalJson({ first: 1 }, value)));
    }
  });
  it('falls back before calling an accessor and keeps the legacy read count', () => {
    let reads = 0;
    const getter = { get text() { reads++; return '😀'; } };
    expect(equalJson(getter, { text: '😀' })).toBe(true);
    const expectedReads = reads; reads = 0;
    expect(comparison(getter, { text: '😀' })).toBe(true);
    expect(reads).toBe(expectedReads);
  });
  it('starts a fresh proof scope on every call and rechecks changed Unicode, content and cycles', () => {
    const left: { text: string; child?: unknown } = { text: '😀' }, right = { text: '😀' };
    expect(comparison(left, right)).toBe(true);
    left.text = '\ud800';
    expect(outcome(() => comparison(left, right))).toEqual(outcome(() => equalJson(left, right)));
    left.text = '変更😀'; expect(comparison(left, right)).toBe(false);
    left.text = '😀'; left.child = left;
    expect(outcome(() => comparison(left, right))).toEqual(outcome(() => equalJson(left, right)));
    delete left.child; expect(comparison(left, right)).toBe(true);
  });
  it('keeps equality and a late mismatch exact after pair-cache eviction', () => {
    const left = Array.from({ length: 65_540 }, (_, index) => ({ index, text: '😀' }));
    const right = structuredClone(left);
    expect(equalJson(left, right)).toBe(true); expect(comparison(left, right)).toBe(true);
    right.at(-1)!.text = '末尾の変更😀';
    expect(equalJson(left, right)).toBe(false); expect(comparison(left, right)).toBe(false);
  });
});

const stores: ScenarioStore[] = [];
function open(name = `pair-proposal-${newId()}`) {
  const store = new ScenarioStore({ databaseName: name, accountId: 'local-pair-proposal-fixture' });
  stores.push(store); return store;
}
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });
async function validFixture() {
  const store = open();
  let project = createProject('同一操作の完全比較');
  project.entities.push(createEntity(project.projectId, 'scene', '元場面', { body: textToRichText('😀原段落を保持') }));
  project = (await store.saveProject(project, { reason: '原作品を保存' })).project;
  for (const name of ['更新一😀', '更新二😀']) {
    const next = structuredClone(project); next.entities[0].name = name;
    project = (await store.saveProject(next, { reason: '名称だけを更新' })).project;
  }
  const complete = await store.exportProject(project.projectId);
  const prepared = await inspectScenario(complete, { worker: false });
  expect(validateProject(prepared.project)).toMatchObject({ ok: true });
  expect(prepared.recovery?.pending).toHaveLength(3);
  return { store, project: prepared.project, recovery: prepared.recovery!, complete };
}

describe('model-valid hashed history and portable recovery; support only', () => {
  it('merges all real equal commands without changing hashes, IDs, order or pending data', async () => {
    const f = await validFixture(), beforeProject = jsonBytes(f.project), beforeRecovery = jsonBytes(f.recovery);
    const reordered = structuredClone(f.recovery);
    for (const item of reordered.pending) item.command = Object.fromEntries(Object.entries(item.command).reverse()) as unknown as CommandRecord;
    await expect(validateRecovery(reordered, f.project, {})).resolves.toMatchObject({ pending: reordered.pending });
    const result = projectWithRecoveryHistory(f.project, reordered);
    expect(result.history.map(command => command.operationId)).toEqual(f.project.history.map(command => command.operationId));
    expect(equalJson(result.history, f.project.history)).toBe(true);
    expect(jsonBytes(f.project)).toEqual(beforeProject); expect(jsonBytes(f.recovery)).toEqual(beforeRecovery);
  });
  it('rejects a different valid command reason even with the same operation ID and a recomputed honest SHA', async () => {
    const f = await validFixture(), changed = structuredClone(f.recovery), item = changed.pending.at(-1)!;
    item.command.reason = '別の有効な理由😀'; item.commandHash = await sha256(jsonBytes(item.command));
    expect(validateProject({ ...item.command.after, history: [item.command] })).toMatchObject({ ok: true });
    expect(() => projectWithRecoveryHistory(f.project, changed)).toThrow('送信待ちの内容が保存履歴と一致しません');
    await expect(validateRecovery(changed, f.project, {})).rejects.toMatchObject({ code: 'OPERATION_CONFLICT', path: item.operationId });
  });
  it('still rejects a forged SHA before merge and leaves a stored target unchanged', async () => {
    const f = await validFixture(), beforeStored = await f.store.getProject(f.project.projectId), changed = structuredClone(f.recovery), item = changed.pending.at(-1)!;
    item.command.reason = '別内容を元hashと偽る😀';
    await expect(validateRecovery(changed, f.project, {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await f.store.getProject(f.project.projectId)).toEqual(beforeStored);
  });
});
