import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach, expect, it, vi} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import {inspectScenario} from './archive';
import {packRecordData} from './recordPartsCore';
import {ScenarioStore} from './store';

class HeldPartsWorker {
  static instances: HeldPartsWorker[] = [];
  terminated = 0;
  messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { HeldPartsWorker.instances.push(this); }
  postMessage(message: unknown) { this.messages.push(structuredClone(message)); }
  terminate() { this.terminated++; }
  emit(value: unknown) { this.onmessage?.({data: {ok: true, value}} as MessageEvent); }
}

const stores: ScenarioStore[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  HeldPartsWorker.instances = [];
  for (const store of stores.splice(0)) await store.deleteDatabase();
});

it.each(['projects', 'commands', 'outbox'])('cancels a held split %s read during export and retries with every native row unchanged', async table => {
  const name = `export-read-cancel-${newId()}`, source = new ScenarioStore({databaseName: name});
  stores.push(source);
  const project = createProject('完全保存の読出し取消');
  project.entities.push(createEntity(project.projectId, 'note', '元の本文', {body: textToRichText('😀元の段落と送信待ちを保つ')}));
  const saved = (await source.saveProject(project, {reason: '原子保存した元の版'})).project;
  const db = (source as unknown as {db: Dexie}).db;
  const row = (await db.table(table).toArray())[0] as Record<string, unknown>;
  const packed = await packRecordData(row, `${table}:export-cancel-fixture`);
  const schema = db.table(table).schema, header: Record<string, unknown> = {__scenarioRecordParts: packed.packed};
  for (const index of [schema.primKey, ...schema.indexes]) {
    for (const key of typeof index.keyPath === 'string' ? [index.keyPath] : index.keyPath ?? []) {
      if (Object.hasOwn(row, key)) header[key] = row[key];
    }
  }
  // The exact same native value is encoded in its supported split form. No
  // domain input, count, limit, content or index value changes for this test.
  await new Promise<void>((resolve, reject) => {
    const tx = db.backendDB().transaction([table, 'recordParts'], 'readwrite');
    for (const part of packed.parts) tx.objectStore('recordParts').add(part);
    tx.objectStore(table).put(header);
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  const capture = () => new Promise<Record<string, unknown[]>>((resolve, reject) => {
    const names = Array.from(db.backendDB().objectStoreNames), tx = db.backendDB().transaction(names, 'readonly');
    const result: Record<string, unknown[]> = {};
    for (const name of names) { const request = tx.objectStore(name).getAll(); request.onsuccess = () => { result[name] = request.result; }; }
    tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
  });
  const before = await capture(), reader = new ScenarioStore({databaseName: name}); stores.push(reader);
  vi.stubGlobal('window', {}); vi.stubGlobal('Worker', HeldPartsWorker);
  const controller = new AbortController(), exporting = reader.exportProject(project.projectId, {signal: controller.signal});
  const rejected = expect(exporting).rejects.toMatchObject({code: 'CANCELLED'});
  let worker: HeldPartsWorker | undefined;
  try {
    await vi.waitFor(() => expect(HeldPartsWorker.instances).toHaveLength(1));
    worker = HeldPartsWorker.instances[0];
    expect(worker.messages[0]).toMatchObject({action: 'unpack', packed: packed.packed});
    controller.abort();
    await vi.waitFor(() => expect(worker!.terminated).toBe(1), {timeout: 500});
    await rejected;
    worker.emit(row); // A completed old worker cannot revive the cancelled read.
  } finally {
    worker?.emit(row);
    await rejected;
    vi.unstubAllGlobals();
  }
  expect(await capture()).toEqual(before);
  const complete = await inspectScenario(await reader.exportProject(project.projectId), {worker: false});
  expect(complete.project).toEqual(saved);
  expect(complete.recovery?.pending).toHaveLength(1);
  expect(complete.recovery?.pending[0].command).toEqual(saved.history[0]);
  expect(await capture()).toEqual(before);
  reader.close();
  const cold = new ScenarioStore({databaseName: name}); stores.push(cold);
  expect(await cold.getProject(project.projectId)).toEqual(saved);
});
