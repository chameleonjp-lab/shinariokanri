import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { isContentCopyField } from '../../src/domain/model';
import type { Block, ProjectData } from '../../src/domain/types';
import { inspectScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, backup, navigate, openEntity } from './ap04-original-helpers';

// All AT-N06 original-clause observations are not_run until browser replay.
// Only fixture setup and declared failure injection use page.evaluate writes;
// migration retry and the multi-record edit use the real author UI.
const databaseName = 'scenario-manager-local-v1';

function versionOneRows(project: ProjectData) {
  const blocks: { id: string; projectId: string; entityId: string; block: Block }[] = [];
  const entities = project.entities.map(entity => {
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        if (value.length && value.every(item => item && typeof item === 'object' && 'id' in item && 'text' in item && ['paragraph', 'heading', 'list_item', 'quote'].includes((item as Block).kind))) {
          for (const block of value as Block[]) blocks.push({ id: block.id, projectId: entity.projectId, entityId: entity.id, block: structuredClone(block) });
          return { __scenarioRichText: value.map(item => (item as Block).id) };
        }
        return value.map(visit);
      }
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, isContentCopyField(key) ? structuredClone(item) : visit(item)]));
      return value;
    };
    return { id: entity.id, projectId: entity.projectId, kind: entity.kind, record: visit(entity) };
  });
  return { entities, blocks };
}

async function image(page: Page, canonicalOnly = false) {
  return page.evaluate(async ({ name, canonicalOnly }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const canonical = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'recordParts', 'historyKeyframes', 'historyDeltas'];
      const names = [...db.objectStoreNames].filter(name => !canonicalOnly || canonical.includes(name)).sort();
      const tx = db.transaction(names, 'readonly');
      type NativeTableImage = { keyPath: IDBObjectStore['keyPath']; indexes: Array<{ name: string; keyPath: IDBIndex['keyPath']; unique: boolean }>; rows: unknown[] };
      const tables = await Promise.all(names.map(name => new Promise<[string, NativeTableImage]>((resolve, reject) => {
        const table = tx.objectStore(name), request = table.getAll();
        request.onsuccess = () => resolve([name, { keyPath: table.keyPath, indexes: [...table.indexNames].sort().map(key => ({ name: key, keyPath: table.index(key).keyPath, unique: table.index(key).unique })), rows: request.result }]);
        request.onerror = () => reject(request.error);
      })));
      return { version: db.version, tables: Object.fromEntries(tables) };
    } finally { db.close(); }
  }, { name: databaseName, canonicalOnly });
}

async function installVersionOne(page: Page, p: ProjectData, nativeRows: ReturnType<typeof versionOneRows>) {
  // This same-origin static document runs no App and holds no current DB open.
  // Native 10 is the repository's existing Dexie-v1 migration fixture layout.
  await page.goto('./build-info.json');
  await page.evaluate(async ({ name, p, nativeRows }) => {
    const schema: Record<string, { key: string | string[]; indexes: [string, string | string[]][] }> = {
      projects: { key: 'projectId', indexes: [['name', 'name']] },
      entities: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+kind]', ['projectId', 'kind']]] },
      relations: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+fromId]', ['projectId', 'fromId']], ['[projectId+toId]', ['projectId', 'toId']]] },
      blocks: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+entityId]', ['projectId', 'entityId']]] },
      snapshots: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId']] },
      commands: { key: 'operationId', indexes: [['projectId', 'projectId'], ['[projectId+revision]', ['projectId', 'revision']]] },
      outbox: { key: 'operationId', indexes: [['projectId', 'projectId'], ['accountId', 'accountId']] },
      assets: { key: 'contentHash', indexes: [] }, views: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId']] },
      viewStates: { key: 'key', indexes: [['projectId', 'projectId']] }, syncMetadata: { key: 'projectId', indexes: [] },
      acks: { key: 'operationId', indexes: [['projectId', 'projectId']] }, restorePoints: { key: 'id', indexes: [['projectId', 'projectId'], ['createdAt', 'createdAt']] },
      worlds: { key: 'id', indexes: [] }, importLogs: { key: 'operationId', indexes: [['projectId', 'projectId']] },
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 10);
      request.onupgradeneeded = () => {
        for (const [name, spec] of Object.entries(schema)) {
          const table = request.result.createObjectStore(name, { keyPath: spec.key });
          for (const [index, key] of spec.indexes) table.createIndex(index, key);
        }
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(schema), 'readwrite');
        const { entities, relations, snapshots, history, views, ...header } = p;
        tx.objectStore('projects').put({ ...header, entityIds: entities.map(entity => entity.id), relationIds: relations.map(relation => relation.id), snapshotIds: snapshots.map(snapshot => snapshot.id), historyIds: history.map(command => command.operationId), viewIds: views.map(view => view.id) });
        for (const entity of nativeRows.entities) tx.objectStore('entities').put(entity);
        for (const block of nativeRows.blocks) tx.objectStore('blocks').put(block);
        for (const relation of relations) tx.objectStore('relations').put(relation);
        for (const snapshot of snapshots) tx.objectStore('snapshots').put({ ...snapshot, projectId: p.projectId });
        for (const command of history) tx.objectStore('commands').put({ operationId: command.operationId, projectId: p.projectId, revision: command.revision, record: command });
        for (const view of views) tx.objectStore('views').put({ ...view, projectId: p.projectId });
        tx.objectStore('syncMetadata').put({ projectId: p.projectId, serverRevision: p.revision, state: 'synced' });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { name: databaseName, p, nativeRows });
}

test('AT-N06 同じ旧作品の移行失敗と台詞の複数対象保存の容量不足を原子拒否し、通常再試行後だけ全変更を確定する', async ({ page }, info) => {
  const fixture = new Uint8Array(await readFile('tests/fixtures/rb07-production.scenario'));
  const p = (await inspectScenario(fixture, { worker: false })).project;
  const nativeRows = versionOneRows(p);
  const line = p.entities.find(entity => entity.kind === 'dialogue_line');
  if (!line || line.kind !== 'dialogue_line') throw new Error('複数対象へ影響する既存の原台詞 fixture がありません');
  const linked = p.entities.filter(entity => (entity.kind === 'localization' || entity.kind === 'recording') && entity.data.sourceLineId === line.id);
  expect(linked.length).toBeGreaterThanOrEqual(2);
  await attachGiven(info, 'AT-N06', fixture, { projectId: p.projectId, nativeVersionBefore: 10, lineId: line.id, linkedIds: linked.map(entity => entity.id), oldSnapshotIds: p.snapshots.map(snapshot => snapshot.id), failures: ['createObjectStore(importDrafts) during native versionchange throws quota once', 'projects put during normal multi-target split throws quota once'] });
  await installVersionOne(page, p, nativeRows);
  const oldNative = await image(page);
  expect(oldNative.version).toBe(10);
  const byId = <T extends { id: string }>(rows: T[]) => rows.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  expect(nativeRows.blocks.length).toBeGreaterThan(0);
  expect(oldNative.tables.blocks.rows).toEqual(byId(nativeRows.blocks));
  expect(oldNative.tables.entities.rows).toEqual(byId(nativeRows.entities));
  await page.addInitScript(name => {
    const create = IDBDatabase.prototype.createObjectStore; let armed = true;
    IDBDatabase.prototype.createObjectStore = function (...args: Parameters<IDBDatabase['createObjectStore']>) {
      if (armed && this.name === name && args[0] === 'importDrafts') { armed = false; throw new DOMException('AT-N06 native migration quota', 'QuotaExceededError'); }
      return create.apply(this, args);
    };
  }, databaseName);
  await page.goto('./');
  await expect(page.getByRole('alert').filter({ hasText: /quota|Quota/ })).toBeVisible();
  expect(await image(page)).toEqual(oldNative);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.getByRole('button', { name: '読み込みを再試行', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: p.name }).click();
  const migrated = await backup(page);
  expect(migrated.project).toEqual(p);
  expect((await image(page)).version).toBe(70);

  // when: a normal split affects the old line, two new lines, scene ordering,
  // translations/recording review state, history and outbox in one transaction.
  await openEntity(page, 'dialogue_line', line.name);
  const tools = page.locator('.production-tools');
  await tools.locator('summary').click();
  await tools.getByLabel('分割する文字位置', { exact: true }).fill('4');
  await tools.getByLabel('台詞変更の理由', { exact: true }).fill('AT-N06 同じ複数対象の変更を再試行');
  await tools.getByRole('button', { name: '変更の影響を確認', exact: true }).click();
  await expect(tools).toContainText('新台詞 2件');
  const beforeSave = await image(page, true);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let armed = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (armed && this.name === 'projects') { armed = false; throw new DOMException('AT-N06 multi-target save quota', 'QuotaExceededError'); }
      return put.apply(this, args);
    };
  });
  await tools.getByRole('button', { name: '確認した変更を保存', exact: true }).click();
  await expect(tools.getByRole('alert')).toContainText('容量');
  await expect(tools).toContainText('新台詞 2件');
  await expect(tools.getByLabel('分割する文字位置', { exact: true })).toHaveValue('4');
  await expect(tools.getByLabel('台詞変更の理由', { exact: true })).toHaveValue('AT-N06 同じ複数対象の変更を再試行');
  await expect(tools.getByRole('status').filter({ hasText: '表示版を確認' })).toHaveCount(0);
  expect(await image(page, true)).toEqual(beforeSave);
  await navigate(page, /^構成/);
  await openEntity(page, 'dialogue_line', line.name);
  await tools.locator('summary').click();
  await expect(tools).toContainText('新台詞 2件');
  await tools.getByRole('button', { name: '確認した変更を保存', exact: true }).click();
  await expect(tools.getByRole('status').filter({ hasText: '表示版を確認' })).toBeVisible();
  await page.reload();
  const cold = await backup(page), oldLine = cold.project.entities.find(entity => entity.id === line.id);
  if (!oldLine || oldLine.kind !== 'dialogue_line') throw new Error('保存した原台詞がありません');
  expect(oldLine.status).toBe('rejected');
  expect(oldLine.data.replacedByLineIds).toHaveLength(2);
  const newIds = oldLine.data.replacedByLineIds!;
  const newLines = newIds.map(id => cold.project.entities.find(entity => entity.id === id));
  expect(newLines.every(entity => entity?.kind === 'dialogue_line')).toBe(true);
  const originalText = line.data.text.map(block => block.text).join('\n');
  const splitText = newLines.map(entity => entity?.kind === 'dialogue_line' ? entity.data.text.map(block => block.text).join('\n') : '').join('');
  expect(splitText).toBe(originalText);
  expect(cold.project.entities.some(entity => entity.kind === 'scene' && newIds.every(id => entity.data.dialogueLineIds?.includes(id)) && !entity.data.dialogueLineIds?.includes(line.id))).toBe(true);
  for (const original of linked) expect(cold.project.entities.find(entity => entity.id === original.id)?.data).toMatchObject({ stage: 'needs_review' });
  expect(cold.project.snapshots).toEqual(p.snapshots);
  expect(cold.project.history).toHaveLength(p.history.length + 1);
  expect(BigInt(cold.project.revision)).toBe(BigInt(p.revision) + 1n);
  await attachObservation(info, 'AT-N06-observation', { oldNativeVersion: oldNative.version, currentNativeVersion: (await image(page, true)).version, rejectedMigrationNativeUnchanged: true, rejectedMultiTargetNativeUnchanged: true, observedCanonicalTables: Object.keys(beforeSave.tables), originalLineId: line.id, newLineIds: newIds, affectedLinkedIds: linked.map(entity => entity.id), coldRevision: cold.project.revision, coldHistoryLength: cold.project.history.length, oldSnapshotIds: cold.project.snapshots.map(snapshot => snapshot.id) });
});
