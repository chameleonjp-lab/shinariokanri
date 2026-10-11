import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const databaseName = 'scenario-manager-local-v1';

async function nativeImage(page: Page) {
  return page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const names = [...db.objectStoreNames].sort();
      const tables = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const transaction = db.transaction(names, 'readonly'), result: Record<string, unknown> = {};
        for (const name of names) { const table = transaction.objectStore(name), request = table.getAll(); request.onsuccess = () => { result[name] = { keyPath: table.keyPath, indexes: [...table.indexNames].sort().map(key => ({ name: key, keyPath: table.index(key).keyPath, unique: table.index(key).unique })), rows: request.result }; }; }
        transaction.oncomplete = () => resolve(result); transaction.onabort = () => reject(transaction.error);
      });
      return { version: db.version, tables };
    } finally { db.close(); }
  }, databaseName);
}

async function seedVersionOne(page: Page, project: ProjectData) {
  // A real same-origin document without the App leaves no open current DB.
  await page.goto('./build-info.json');
  await page.evaluate(async ({ name, p }) => {
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
    // Dexie schema version 1 is real native IndexedDB version 10.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 10);
      request.onupgradeneeded = () => { for (const [name, spec] of Object.entries(schema)) { const table = request.result.createObjectStore(name, { keyPath: spec.key }); for (const [index, key] of spec.indexes) table.createIndex(index, key); } };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(Object.keys(schema), 'readwrite'), { entities, relations, snapshots, history, views, ...header } = p;
        transaction.objectStore('projects').put({ ...header, entityIds: entities.map(e => e.id), relationIds: relations.map(e => e.id), snapshotIds: snapshots.map(e => e.id), historyIds: history.map(e => e.operationId), viewIds: views.map(e => e.id) });
        for (const entity of entities) transaction.objectStore('entities').put({ id: entity.id, projectId: p.projectId, kind: entity.kind, record: entity });
        for (const relation of relations) transaction.objectStore('relations').put(relation);
        for (const snapshot of snapshots) transaction.objectStore('snapshots').put({ ...snapshot, projectId: p.projectId });
        for (const command of history) transaction.objectStore('commands').put({ operationId: command.operationId, projectId: p.projectId, revision: command.revision, record: command });
        for (const view of views) transaction.objectStore('views').put({ ...view, projectId: p.projectId });
        transaction.objectStore('syncMetadata').put({ projectId: p.projectId, serverRevision: p.revision, state: 'synced' });
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }, { name: databaseName, p: project });
}

for (const failures of [1, 2]) test(`旧native v1の移行を${failures}回原子拒否した後、通常の再試行だけで作品・固定版・試読を復元する`, async ({ page, browser }, info) => {
  test.setTimeout(180000);
  const legacy = new Uint8Array(await readFile('docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario'));
  const original = (await inspectScenario(legacy, { worker: false })).project;
  await info.attach('actual-legacy-file.scenario', { body: Buffer.from(legacy), contentType: 'application/zip' });
  await seedVersionOne(page, original);
  const before = await nativeImage(page);
  expect(before.version).toBe(10);
  await page.addInitScript(({ name, count }) => {
    const create = IDBDatabase.prototype.createObjectStore; let remaining = count;
    IDBDatabase.prototype.createObjectStore = function (...args: Parameters<IDBDatabase['createObjectStore']>) {
      if (this.name === name && args[0] === 'importDrafts' && remaining > 0) { remaining--; throw new DOMException('native migration quota fixture', 'QuotaExceededError'); }
      return create.apply(this, args);
    };
  }, { name: databaseName, count: failures });
  await page.goto('./');
  for (let failure = 0; failure < failures; failure++) {
    await expect(page.getByRole('alert').filter({ hasText: /quota|Quota/ })).toBeVisible();
    expect(await nativeImage(page)).toEqual(before);
    await page.getByRole('button', { name: '読み込みを再試行', exact: true }).click();
  }
  await expect(page.locator('.project-card').filter({ hasText: original.name })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const migrated = await nativeImage(page);
  expect(migrated.version).toBe(70);
  await page.locator('.project-card').filter({ hasText: original.name }).click();
  await page.locator('.sidebar').getByRole('button', { name: /^作品/ }).click();
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const bytes = new Uint8Array(await readFile((await (await download).path())!));
  const complete = await inspectScenario(bytes, { worker: false });
  expect(complete.project).toEqual(original);
  await info.attach('actual-retried-complete-file.scenario', { body: Buffer.from(bytes), contentType: 'application/zip' });
  await page.reload();
  await expect(page.locator('.project-switch')).toContainText(original.name);
  for (const mode of ['new', 'clone'] as const) {
    const empty = await browser.newContext();
    try {
    const restored = await empty.newPage(); await restored.goto(page.url());
    await restored.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await restored.locator('input[type=file]').setInputFiles({ name: 'retried-complete.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
    if (mode === 'clone') await restored.getByLabel('復元方法', { exact: true }).selectOption('clone');
    await restored.getByLabel('復元方法と対象への影響を確認しました').check();
    await restored.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
    await expect(restored.locator('.project-switch')).toContainText(original.name);
    await restored.reload();
    await expect(restored.locator('.project-switch')).toContainText(original.name);
    await restored.locator('.sidebar').getByRole('button', { name: /^構成/ }).click();
    await restored.getByRole('tab', { name: '試読・検査', exact: true }).click();
    await restored.getByRole('button', { name: /再実行して状態を比較/ }).first().click();
    await expect(restored.locator('.reader-trial-heading')).toContainText('意図した終端');
    await expect(restored.locator('.reader-issue')).toHaveCount(0);
    await restored.locator('.sidebar').getByRole('button', { name: /^作品/ }).click();
    await restored.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
    const downloaded = restored.waitForEvent('download'); await restored.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
    const restoredBytes = new Uint8Array(await readFile((await (await downloaded).path())!));
    const coldProject = (await inspectScenario(restoredBytes, { worker: false })).project;
    if (mode === 'new') expect(coldProject).toEqual(original);
    else {
      expect(coldProject.projectId).not.toBe(original.projectId);
      expect(coldProject.entities.map(entity => [entity.kind, entity.name])).toEqual(original.entities.map(entity => [entity.kind, entity.name]));
      expect(coldProject.entities.every(entity => !original.entities.some(before => before.id === entity.id))).toBe(true);
      expect(coldProject.snapshots.map(snapshot => snapshot.versionLabel)).toEqual(original.snapshots.map(snapshot => snapshot.versionLabel));
      expect(coldProject.history).toHaveLength(original.history.length + 1);
      const audit = coldProject.history.at(-1)!;
      expect(audit).toMatchObject({ reason: '専用ファイルをcloneで復元', projectId: coldProject.projectId,
        revision: (BigInt(original.revision) + 1n).toString(), baseRevision: '0' });
      expect(original.history.some(command => command.operationId === audit.operationId)).toBe(false);
      expect(audit.idMap).toBeDefined();
      const idMap = audit.idMap!;
      expect(idMap[original.projectId]).toBe(coldProject.projectId);
      expect(Object.values(idMap)).not.toContain(audit.operationId);
      const retained = coldProject.history.slice(0, -1);
      expect(retained.map(command => command.operationId)).toEqual(original.history.map(command => idMap[command.operationId]));
      for (const [index, source] of original.history.entries()) {
        const command = retained[index];
        expect(command).toMatchObject({ projectId: coldProject.projectId, reason: source.reason, revision: source.revision,
          baseRevision: source.baseRevision, createdAt: source.createdAt, targetIds: source.targetIds.map(id => idMap[id] ?? id) });
        for (const state of ['before', 'after'] as const) {
          expect(command[state].name).toBe(source[state].name);
          expect(command[state].revision).toBe(source[state].revision);
          expect(command[state].entities.map(e => [e.id, e.kind, e.name, e.revision])).toEqual(source[state].entities.map(e => [idMap[e.id], e.kind, e.name, e.revision]));
          expect(command[state].snapshots.map(pin => [pin.id, pin.versionLabel, pin.createdAt])).toEqual(source[state].snapshots.map(pin => [idMap[pin.id], pin.versionLabel, pin.createdAt]));
        }
      }
      const { history: _history, ...cloneContent } = coldProject;
      expect(audit.after).toEqual(cloneContent);
      expect(audit.after.entities.map(e => [e.id, e.kind, e.name])).toEqual(original.entities.map(e => [idMap[e.id], e.kind, e.name]));
      expect(audit.before).toMatchObject({ projectId: coldProject.projectId, revision: '0', entities: [], relations: [], snapshots: [] });
    }
    await info.attach(`actual-retried-${mode}-cold.scenario`, { body: Buffer.from(restoredBytes), contentType: 'application/zip' });
    } finally { await empty.close(); }
  }
  await info.attach('observations.json', { body: Buffer.from(JSON.stringify({ failures, browserVersion: browser.version(), legacySHA256: hash(legacy), nativeVersionBefore: before.version,
    nativeVersionAfterRetry: migrated.version, allTablesUnchangedAtEachRefusal: true, completeFileSHA256: hash(bytes), completeProjectExact: true,
    coldAndEmptyEnvironmentReplay: true, originalWholeAcceptancePromotion: false, physicalDevice: false }, null, 2)), contentType: 'application/json' });
});

test('再試行のnative open完了が遅れても中止で通常画面へ戻り、新しい再試行だけを反映する', async ({ page, browser }, info) => {
  test.setTimeout(180000);
  const legacy = new Uint8Array(await readFile('docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario'));
  const original = (await inspectScenario(legacy, { worker: false })).project;
  await seedVersionOne(page, original); const before = await nativeImage(page);
  await page.addInitScript(name => {
    const create = IDBDatabase.prototype.createObjectStore; let armed = true;
    IDBDatabase.prototype.createObjectStore = function (...args: Parameters<IDBDatabase['createObjectStore']>) {
      if (armed && this.name === name && args[0] === 'importDrafts') { armed = false; throw new DOMException('native migration quota fixture', 'QuotaExceededError'); }
      return create.apply(this, args);
    };
  }, databaseName);
  await page.goto('./'); await expect(page.getByRole('alert').filter({ hasText: /quota|Quota/ })).toBeVisible();
  expect(await nativeImage(page)).toEqual(before);
  await page.evaluate(name => {
    const open = IDBFactory.prototype.open; let armed = true;
    IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
      const request = open.apply(this, args);
      if (armed && args[0] === name) {
        armed = false;
        Object.defineProperty(request, 'onsuccess', { configurable: true, set(handler: ((this: IDBRequest, event: Event) => void) | null) {
          if (handler) request.addEventListener('success', event => {
            (globalThis as typeof globalThis & { retryNativeSuccessHeld?: boolean }).retryNativeSuccessHeld = true;
            setTimeout(() => handler.call(request, event), 1000);
          }, { once: true });
        } });
      }
      return request;
    };
  }, databaseName);
  await page.getByRole('button', { name: '読み込みを再試行', exact: true }).click();
  await page.waitForFunction(() => (globalThis as typeof globalThis & { retryNativeSuccessHeld?: boolean }).retryNativeSuccessHeld === true);
  await page.getByRole('button', { name: '読み込みを中止して保存済みデータを保持', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('作品の確認を取り消しました');
  await expect(page.locator('.loading-screen')).toHaveCount(0);
  const cancelled = await nativeImage(page);
  for (const [name, table] of Object.entries(before.tables)) expect(cancelled.tables[name]).toEqual(table);
  // The completed native migration can retain its new empty stores. Cancellation
  // does not roll back a committed schema or fabricate a version-10 result.
  expect(cancelled.version).toBe(70);
  await page.getByRole('button', { name: '読み込みを再試行', exact: true }).click();
  await expect(page.locator('.project-card').filter({ hasText: original.name })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.locator('.project-card').filter({ hasText: original.name }).click();
  await page.locator('.sidebar').getByRole('button', { name: /^作品/ }).click();
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const bytes = new Uint8Array(await readFile((await (await pending).path())!));
  expect((await inspectScenario(bytes, { worker: false })).project).toEqual(original);
  await page.reload(); await expect(page.locator('.project-switch')).toContainText(original.name);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await info.attach('actual-complete-after-cancel-retry.scenario', { body: Buffer.from(bytes), contentType: 'application/zip' });
  await info.attach('cancel-retry-observations.json', { body: Buffer.from(JSON.stringify({ browserVersion: browser.version(), legacySHA256: hash(legacy),
    delayedNativeSuccessMilliseconds: 1000, nativeVersionBefore: before.version, nativeVersionAfterCommittedSchemaCancel: cancelled.version,
    allOriginalTablesUnchangedAtCancel: true, normalCancelAndRetry: true, completeFileSHA256: hash(bytes), completeProjectExact: true,
    physicalDevice: false, originalWholeAcceptancePromotion: false }, null, 2)), contentType: 'application/json' });
});
