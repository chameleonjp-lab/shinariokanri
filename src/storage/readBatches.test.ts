import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import {ScenarioStore} from './store';
import {installRecordPartsDatabase} from './recordPartsDatabase';

const stores: ScenarioStore[] = [];
function open(name = `read-batches-${newId()}`) {const store = new ScenarioStore({databaseName: name}); stores.push(store); return store;}
const db = (store: ScenarioStore) => (store as unknown as {db: Dexie}).db;
afterEach(async () => {for (const store of stores.splice(0)) await store.deleteDatabase();});
function fixture(count: number) {
  const project = createProject('取得境界の全本文とID');
  for (let i = 0; i < count; i++) {
    const entity = createEntity(project.projectId, 'note', `情報 ${i}`, {body: textToRichText(`境界 ${i}：😀e\u0301と日本語を保持`)});
    entity.id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    entity.data.body[0].id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    project.entities.push(entity);
  }
  project.entities.reverse(); return project;
}
async function rows(store: ScenarioStore) {
  const database = db(store); await database.open();
  return new Promise<Record<string, unknown[]>>((resolve, reject) => {
    const tables = database.tables.map(table => table.name), result: Record<string, unknown[]> = {};
    const transaction = database.backendDB().transaction(tables, 'readonly');
    for (const name of tables) {
      const query = transaction.objectStore(name).getAll(); query.onsuccess = () => {result[name] = query.result;};
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}
it.each([8191, 8192, 8193])('cold読み込みで%s件のID順と全Unicode本文を保ち、履歴を落とさない', async count => {
  const first = open(), input = fixture(count), saved = (await first.saveProject(input, {reason: '境界の保存', includeHistory: false})).project;
  const name = db(first).name; first.close(); const restarted = open(name);
  const actual = (await restarted.getProjectForEditing(input.projectId))!;
  expect(actual.entities).toEqual(saved.entities); expect(actual.relations).toEqual(saved.relations);
  expect(restarted.getHistoryCount(actual)).toBe(1); expect(actual.history).toEqual([]);
  expect((await restarted.getProject(input.projectId))!.history).toHaveLength(1);
}, 90_000);

it.each([false, true])('最初の実取得後の取消は同じ読込transactionを中止し、保存行と送信待ちを変更しない（signal差替え=%s）', async replaceSignal => {
  const first = open(), input = fixture(8193); await first.saveProject(input, {reason: '取消前', includeHistory: false});
  const name = db(first).name; first.close(); const restarted = open(name), before = await rows(restarted), controller = new AbortController();
  const replacement = new AbortController(), options = {signal: controller.signal};
  restarted.close();
  let nonemptyQueries = 0; const transactions = new Set<object>();
  db(restarted).use({stack: 'dbcore', name: 'observe-boundary-cancel', level: 1, create(down) {
    return {...down, table(name) {const table = down.table(name); if (name !== 'entities') return table;
      return {...table, query(request) {transactions.add(request.trans); return table.query(request).then(result => {
        if (request.values && result.result.length) {nonemptyQueries++; if (replaceSignal) options.signal = replacement.signal; controller.abort();} return result;
      });}};}};
  }});
  await db(restarted).open();
  const failure = await restarted.getProjectForEditing(input.projectId, options).then(
    () => {throw new Error('取消した読込は成功できません。');}, error => error as Error & {code?: string; cause?: Error});
  console.info('boundary cancellation observation', {signalAborted: controller.signal.aborted, nonemptyQueries, transactions: transactions.size, code: failure.code, causeName: failure.cause?.name, causeMessage: failure.cause?.message});
  expect(controller.signal.aborted).toBe(true); expect(replacement.signal.aborted).toBe(false); expect(failure).toMatchObject({code: 'CANCELLED'});
  expect(nonemptyQueries).toBe(1); expect(transactions.size).toBe(1); expect(await rows(restarted)).toEqual(before);
  expect((await open(name).getProject(input.projectId))!.entities).toEqual(input.entities);
}, 90_000);

it('後から差し替えたsignalの取消を読込エラーへ借用せず、開始時のsignalと保存済みデータを保持する', async () => {
  const first = open(), input = fixture(3); await first.saveProject(input, {reason: '読込起点', includeHistory: false});
  const name = db(first).name; first.close(); const restarted = open(name), before = await rows(restarted);
  restarted.close(); const original = new AbortController(), replacement = new AbortController(), options = {signal: original.signal};
  let injected = 0;
  db(restarted).use({stack: 'dbcore', name: 'observe-signal-replacement-failure', level: 1, create(down) {
    return {...down, table(name) {const table = down.table(name); if (name !== 'entities') return table;
      return {...table, query(request) {return table.query(request).then(result => {
        if (request.values && result.result.length) {injected++; options.signal = replacement.signal; replacement.abort(); throw new Error('read failure fixture');}
        return result;
      });}};
    }};
  }});
  await db(restarted).open();
  await expect(restarted.getProjectForEditing(input.projectId, options)).rejects.toMatchObject({code: 'SAVE_FAILED'});
  expect(injected).toBe(1); expect(original.signal.aborted).toBe(false); expect(replacement.signal.aborted).toBe(true);
  expect(await rows(restarted)).toEqual(before);
}, 90_000);

it.each(['missing', 'foreign', 'id', 'kind'] as const)('取得後半の%s行は保存済みデータを変更せず拒否する', async fault => {
  const first = open(), input = fixture(8193); await first.saveProject(input, {reason: '末尾確認', includeHistory: false});
  const name = db(first).name; first.close(); const restarted = open(name), table = db(restarted).table('entities'), target = input.entities[0];
  const original = await table.get([input.projectId, target.id]);
  if (fault === 'missing') await table.delete([input.projectId, target.id]);
  else if (fault === 'foreign') await table.put({...original, record: {...original.record, projectId: newId()}});
  else if (fault === 'id') await table.put({...original, record: {...original.record, id: newId()}});
  else await table.put({...original, kind: 'character'});
  const captured = await rows(restarted); await expect(restarted.getProjectForEditing(input.projectId)).rejects.toMatchObject({code: fault === 'foreign' ? 'VALIDATION_FAILED' : 'SAVE_FAILED'});
  expect(await rows(restarted)).toEqual(captured);
  await table.put(original); expect((await open(name).getProjectForEditing(input.projectId))!.entities).toEqual(input.entities);
}, 90_000);

it('後半の段落IDが保存索引と異なる場合は拒否し、保存済み本文と履歴を変更しない', async () => {
  const first = open(), input = fixture(8193); await first.saveProject(input, {reason: '段落の索引', includeHistory: false});
  const name = db(first).name; first.close(); const restarted = open(name), table = db(restarted).table('blocks');
  const tail = input.entities[0]; if (tail.kind !== 'note') throw new Error('境界fixtureの末尾はメモです。');
  const target = tail.data.body[0].id, original = await table.get([input.projectId, target]);
  await table.put({...original, block: {...original.block, id: newId()}}); const before = await rows(restarted);
  await expect(restarted.getProjectForEditing(input.projectId)).rejects.toMatchObject({code: 'SAVE_FAILED'});
  expect(await rows(restarted)).toEqual(before); await table.put(original);
  expect((await open(name).getProjectForEditing(input.projectId))!.entities).toEqual(input.entities);
}, 90_000);

it('後半にある分割記録のhash破損を拒否し、復元点と元の送信待ちを保持する', async () => {
  const first = open(); installRecordPartsDatabase(db(first), 8192);
  const input = fixture(8193); input.entities[0].customValues.largeField = '後半の分割値'.repeat(1000);
  await first.saveProject(input, {reason: '分割記録', includeHistory: false}); const name = db(first).name; first.close();
  const restarted = open(name); await db(restarted).open();
  const raw = await new Promise<any>((resolve, reject) => {const tx = db(restarted).backendDB().transaction('entities', 'readonly'); const query = tx.objectStore('entities').get([input.projectId, input.entities[0].id]); query.onsuccess = () => resolve(query.result); query.onerror = () => reject(query.error);});
  expect(raw.__scenarioRecordParts).toBeDefined();
  const parts = db(restarted).table('recordParts'), original = await parts.get(raw.__scenarioRecordParts.parts[0].key), bytes = original.bytes.slice(); bytes[0] ^= 1;
  await parts.put({...original, bytes});
  const before = await rows(restarted);
  await expect(restarted.getProjectForEditing(input.projectId)).rejects.toMatchObject({code: 'SAVE_FAILED', message: expect.stringContaining('分割記録が破損')});
  expect(await rows(restarted)).toEqual(before);
  await parts.put(original); expect((await open(name).getProjectForEditing(input.projectId))!.entities).toEqual(input.entities);
}, 90_000);
