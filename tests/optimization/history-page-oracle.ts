// Frozen ae757fbb store.historyPage. Only db/type references are adapted.
// Keep independent of the candidate metadata implementation.
import type Dexie from 'dexie';
import type {CommandRecord} from '../../src/domain/types';
import {StorageError} from '../../src/storage/errors';
export async function originalHistoryPage(db:Dexie,projectId:string,options:{query?:string;page?:number;size?:number}={}) {
 const query = (options.query ?? '').normalize('NFKC').toLocaleLowerCase(), page = options.page ?? 0, size = options.size ?? 30;
 if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 60) throw new StorageError('VALIDATION_FAILED', '履歴のページは0以上、ページ件数は1〜60です。');
 const header = await db.table('projects').get(projectId); if (!header) throw new StorageError('NOT_FOUND', '作品が見つかりません。');
 const rows = await db.table('commands').bulkGet(header.historyIds);
 const entries = rows.map((row, index) => {
  const value = row?.delta?.metadata ?? row?.record;
  if (!value || value.projectId !== projectId || value.operationId !== header.historyIds[index]) throw new StorageError('SAVE_FAILED', '履歴の操作情報が不足しています。', header.historyIds[index]);
  const { before: _before, after: _after, ...metadata } = value as CommandRecord;
  return metadata;
 }).reverse().filter(entry => !query || [entry.reason, entry.revision, entry.baseRevision, entry.operationId, entry.createdAt, ...entry.targetIds].some(value => value.normalize('NFKC').toLocaleLowerCase().includes(query)));
 const maximum = Math.max(0, Math.ceil(entries.length / size) - 1), bounded = Math.min(page, maximum);
 return { entries: entries.slice(bounded * size, (bounded + 1) * size), page: bounded, maximum, total: entries.length, size };
}
