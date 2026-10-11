import { expect, test, type Browser, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { inspectScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';
import { attachGiven, attachObservation, backup, navigate, openEntity } from './ap04-original-helpers';

const databaseName = 'scenario-manager-local-v1';
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

async function importComplete(page: Page, url: string, bytes: Uint8Array, mode: 'new' | 'clone' = 'new') {
  await page.goto(url);
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'e12-complete.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await page.getByLabel('復元方法', { exact: true }).selectOption(mode);
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function nativeImage(page: Page) {
  return page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const names = [...db.objectStoreNames].sort();
      const tables = await new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const transaction = db.transaction(names, 'readonly'), rows: Record<string, unknown[]> = {};
        for (const name of names) { const request = transaction.objectStore(name).getAll(); request.onsuccess = () => { rows[name] = request.result; }; }
        transaction.oncomplete = () => resolve(rows); transaction.onabort = () => reject(transaction.error);
      });
      return { version: db.version, tables };
    } finally { db.close(); }
  }, databaseName);
}

const durableNames = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'worlds', 'recoveredPending', 'recordParts'];
function durableImage(image: Awaited<ReturnType<typeof nativeImage>>) {
  return Object.fromEntries(durableNames.map(name => [name, image.tables[name]]));
}

async function fullNewClone(browser: Browser, url: string, bytes: Uint8Array, original: ProjectData) {
  const results: Record<string, unknown> = {};
  for (const mode of ['new', 'clone'] as const) {
    const context = await browser.newContext();
    try {
      const restored = await context.newPage(); await importComplete(restored, url, bytes, mode);
      await restored.reload(); await expect(restored.locator('.project-switch')).toContainText(original.name);
      await navigate(restored, /^構成/);
      await restored.getByRole('tab', { name: '試読・検査', exact: true }).click();
      await restored.getByRole('button', { name: /再実行して状態を比較/ }).first().click();
      await expect(restored.locator('.reader-trial-heading')).toContainText('意図した終端');
      await expect(restored.locator('.reader-issue')).toHaveCount(0);
      const complete = await backup(restored);
      if (mode === 'new') expect(complete.project).toEqual(original);
      else {
        expect(complete.project.projectId).not.toBe(original.projectId);
        expect(complete.project.entities.map(e => [e.kind, e.name])).toEqual(original.entities.map(e => [e.kind, e.name]));
        expect(complete.project.entities.every(e => !original.entities.some(before => before.id === e.id))).toBe(true);
        expect(complete.project.snapshots.map(pin => pin.versionLabel)).toEqual(original.snapshots.map(pin => pin.versionLabel));
        expect(complete.project.history).toHaveLength(original.history.length + 1);
        const cloneCommand = complete.project.history.at(-1)!;
        expect(cloneCommand.reason).toBe('専用ファイルをcloneで復元');
        expect(cloneCommand.projectId).toBe(complete.project.projectId);
        expect(cloneCommand.revision).toBe((BigInt(original.revision) + 1n).toString());
        expect(cloneCommand.baseRevision).toBe('0');
        expect(original.history.some(command => command.operationId === cloneCommand.operationId)).toBe(false);
        const idMap = cloneCommand.idMap!; expect(idMap).toBeDefined();
        expect(idMap[original.projectId]).toBe(complete.project.projectId);
        expect(Object.values(idMap)).not.toContain(cloneCommand.operationId);
        const retained = complete.project.history.slice(0, -1);
        expect(retained.map(command => command.operationId)).toEqual(original.history.map(command => idMap[command.operationId]));
        for (const [index, source] of original.history.entries()) {
          const command = retained[index];
          expect(command).toMatchObject({ projectId: complete.project.projectId, reason: source.reason, revision: source.revision,
            baseRevision: source.baseRevision, createdAt: source.createdAt, targetIds: source.targetIds.map(id => idMap[id] ?? id) });
          for (const state of ['before', 'after'] as const) {
            expect(command[state].name).toBe(source[state].name);
            expect(command[state].revision).toBe(source[state].revision);
            expect(command[state].entities.map(e => [e.id, e.kind, e.name, e.revision])).toEqual(source[state].entities.map(e => [idMap[e.id], e.kind, e.name, e.revision]));
            expect(command[state].snapshots.map(pin => [pin.id, pin.versionLabel, pin.createdAt])).toEqual(source[state].snapshots.map(pin => [idMap[pin.id], pin.versionLabel, pin.createdAt]));
          }
        }
        const { history: _history, ...cloneContent } = complete.project;
        expect(cloneCommand.after).toEqual(cloneContent);
        expect(cloneCommand.after.entities.map(e => [e.id, e.kind, e.name])).toEqual(original.entities.map(e => [idMap[e.id], e.kind, e.name]));
        expect(cloneCommand.before.entities).toHaveLength(0);
      }
      results[mode] = { projectId: complete.project.projectId, fileSHA256: sha256(complete.bytes), historyCount: complete.project.history.length,
        pendingCount: complete.recovery?.pending.length ?? 0, oldTraceReplayedAfterCold: true };
    } finally { await context.close(); }
  }
  return results;
}

// The old native layout is a copied test environment, never the author's DB.
// It contains the same edited project and pending operation from the UI case.
async function seedVersionOne(page: Page, url: string, project: ProjectData, pending: unknown[]) {
  await page.goto(`${url}build-info.json`);
  await page.evaluate(async ({ name, p, pending }) => {
    const schema: Record<string, { key: string | string[]; indexes: [string, string | string[]][] }> = {
      projects: { key: 'projectId', indexes: [['name', 'name']] }, entities: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+kind]', ['projectId', 'kind']]] },
      relations: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+fromId]', ['projectId', 'fromId']], ['[projectId+toId]', ['projectId', 'toId']]] },
      blocks: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId'], ['[projectId+entityId]', ['projectId', 'entityId']]] }, snapshots: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId']] },
      commands: { key: 'operationId', indexes: [['projectId', 'projectId'], ['[projectId+revision]', ['projectId', 'revision']]] }, outbox: { key: 'operationId', indexes: [['projectId', 'projectId'], ['accountId', 'accountId']] },
      assets: { key: 'contentHash', indexes: [] }, views: { key: ['projectId', 'id'], indexes: [['projectId', 'projectId']] }, viewStates: { key: 'key', indexes: [['projectId', 'projectId']] },
      syncMetadata: { key: 'projectId', indexes: [] }, acks: { key: 'operationId', indexes: [['projectId', 'projectId']] }, restorePoints: { key: 'id', indexes: [['projectId', 'projectId'], ['createdAt', 'createdAt']] },
      worlds: { key: 'id', indexes: [] }, importLogs: { key: 'operationId', indexes: [['projectId', 'projectId']] },
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 10);
      request.onupgradeneeded = () => { for (const [name, spec] of Object.entries(schema)) { const table = request.result.createObjectStore(name, { keyPath: spec.key }); for (const [index, key] of spec.indexes) table.createIndex(index, key); } };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(schema), 'readwrite'), { entities, relations, snapshots, history, views, ...header } = p;
        tx.objectStore('projects').put({ ...header, entityIds: entities.map(e => e.id), relationIds: relations.map(e => e.id), snapshotIds: snapshots.map(e => e.id), historyIds: history.map(e => e.operationId), viewIds: views.map(e => e.id) });
        for (const entity of entities) tx.objectStore('entities').put({ id: entity.id, projectId: p.projectId, kind: entity.kind, record: entity });
        for (const relation of relations) tx.objectStore('relations').put(relation);
        for (const snapshot of snapshots) tx.objectStore('snapshots').put({ ...snapshot, projectId: p.projectId });
        for (const command of history) tx.objectStore('commands').put({ operationId: command.operationId, projectId: p.projectId, revision: command.revision, record: command });
        for (const view of views) tx.objectStore('views').put({ ...view, projectId: p.projectId });
        for (const operation of pending) tx.objectStore('outbox').put(operation);
        tx.objectStore('syncMetadata').put({ projectId: p.projectId, serverRevision: '0', state: 'pending' });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { name: databaseName, p: project, pending });
}

test('AT-E12 キャッシュ済み未送信作品をoffline・容量拒否・実waiting-worker・移行retry・完全new/cloneで継続する（実OS条件は別記）', async ({ page, browser }, info) => {
  test.setTimeout(240000);
  const bytes = new Uint8Array(await readFile('docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario'));
  const given = await inspectScenario(bytes, { worker: false });
  const scene = given.project.entities.find(e => e.kind === 'scene');
  if (!scene) throw new Error('原fixtureに編集対象の場面がありません');
  const root = resolve('dist'), originalWorker = await readFile(resolve(root, 'sw.js'), 'utf8');
  const build = JSON.parse(await readFile(resolve(root, 'build-info.json'), 'utf8'));
  const cacheMatch = originalWorker.match(/^const CACHE=("[^"]+")/), urlsMatch = originalWorker.match(/ URLS=(\[[^\n]+\]);/);
  if (!cacheMatch || !urlsMatch) throw new Error('E12 fixed worker cache manifest unavailable');
  const originalCache: string = JSON.parse(cacheMatch[1]), cachedURLs: string[] = JSON.parse(urlsMatch[1]);
  expect(originalCache).toBe(`shinariokanri:${build.base}:${build.version}`);
  expect(cachedURLs).toContain(build.base); expect(cachedURLs).toContain(`${build.base}index.html`);
  expect(cachedURLs.some(pathname => pathname.startsWith(`${build.base}assets/`))).toBe(true);
  const expectedCacheEntries = await Promise.all(cachedURLs.map(async pathname => {
    const bytes = await readFile(resolve(root, pathname.slice(build.base.length) || 'index.html'));
    return { pathname, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }));
  // A cache identity change exercises the real waiting/activation lifecycle.
  // Application bytes stay the fixed candidate; this is not an old-app upgrade.
  const newCache = `shinariokanri:${build.base}:${build.version}-e12-lifecycle-fixture`;
  const updatedWorker = originalWorker.replace(/^const CACHE="[^"]+"/, `const CACHE=${JSON.stringify(newCache)}`);
  expect(updatedWorker).not.toBe(originalWorker);
  let updateAvailable = false;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (pathname === '/e12-safe-point') { response.setHeader('Content-Type', 'text/plain'); response.end('The controlled editing documents have left their scope.'); return; }
      if (!pathname.startsWith(build.base)) { response.writeHead(404).end(); return; }
      const relative = decodeURIComponent(pathname.slice(build.base.length)) || 'index.html', file = resolve(root, relative);
      if (!file.startsWith(`${root}/`)) { response.writeHead(404).end(); return; }
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.setHeader('Cache-Control', 'no-store');
      response.end(relative === 'sw.js' ? updateAvailable ? updatedWorker : originalWorker : await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('E12 fixture server unavailable');
  const url = `http://127.0.0.1:${address.port}${build.base}`;
  try {
    await page.addInitScript(() => { Object.defineProperty(window, '__ap04E12DocumentNonce', { value: crypto.randomUUID() }); });
    await importComplete(page, url, bytes);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await openEntity(page, 'scene', scene.name);
    const initialName = `${scene.name}・未送信の編集😀`;
    await page.locator('.detail-panel').getByLabel('名前', { exact: true }).fill(initialName);
    await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
    const pendingImage = await nativeImage(page);
    expect(pendingImage.tables.outbox.length).toBeGreaterThan(0);
    const cachedEntries = await page.evaluate(async ({ cacheName, pathnames }) => {
      if (!(await caches.keys()).includes(cacheName)) throw new Error('E12 fixed active-worker cache unavailable');
      const cache = await caches.open(cacheName);
      return Promise.all(pathnames.map(async pathname => {
        const response = await cache.match(pathname, { ignoreVary: true });
        if (!response || !response.ok) throw new Error(`E12 cached resource unavailable: ${pathname}`);
        const bytes = await response.arrayBuffer(), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return { pathname, bytes: bytes.byteLength, sha256: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') };
      }));
    }, { cacheName: originalCache, pathnames: cachedURLs });
    expect(cachedEntries).toEqual(expectedCacheEntries);
    await attachGiven(info, 'AT-E12', bytes, { originalGiven: 'キャッシュ済みアプリと未送信作品', cachedController: true,
      initialFixtureIsGenuineLegacy: true, pendingOperationIds: pendingImage.tables.outbox.map(row => (row as { operationId: string }).operationId), build,
      originalCache, cachedEntries });
    const otherTab = await page.context().newPage(); await otherTab.goto(url); await expect(otherTab.locator('.app-shell')).toBeVisible();
    updateAvailable = true;
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); if (!registration) throw new Error('No cached registration'); await registration.update(); });
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    const beforeCold = await nativeImage(page);
    expect(durableImage(beforeCold)).toEqual(durableImage(pendingImage));
    const beforeDocumentNonce = await page.evaluate(() => (window as Window & { __ap04E12DocumentNonce: string }).__ap04E12DocumentNonce);
    expect(beforeDocumentNonce).toEqual(expect.any(String));
    await page.context().setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    // A distinct scoped navigation must create a new document while offline.
    // It exercises cached startup without WebKit's Page.reload protocol path.
    const coldURL = new URL(url); coldURL.searchParams.set('e12-cold-document', beforeDocumentNonce);
    await page.goto(coldURL.href); await expect(page.locator('.project-switch')).toContainText(given.project.name);
    const offlineDocumentNonce = await page.evaluate(() => (window as Window & { __ap04E12DocumentNonce: string }).__ap04E12DocumentNonce);
    expect(offlineDocumentNonce).toEqual(expect.any(String)); expect(offlineDocumentNonce).not.toBe(beforeDocumentNonce);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await expect.poll(() => page.evaluate(() => {
      const controller = navigator.serviceWorker.controller;
      return controller && { scriptURL: controller.scriptURL, state: controller.state };
    })).toEqual({ scriptURL: new URL('sw.js', url).href, state: 'activated' });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    expect(durableImage(await nativeImage(page))).toEqual(durableImage(beforeCold));
    await openEntity(page, 'scene', initialName);
    const beforeRefusal = await nativeImage(page), failedName = `${initialName}・容量不足でも残す入力`;
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put; let armed = true;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (armed && this.name === 'projects') { armed = false; throw new DOMException('E12 native quota fixture', 'QuotaExceededError'); }
        return put.apply(this, args);
      };
    });
    await page.locator('.detail-panel').getByLabel('名前', { exact: true }).fill(failedName);
    await expect(page.locator('.detail-panel').getByRole('alert')).toContainText('容量');
    await expect(page.locator('.editor-save-state')).toContainText('未保存');
    await expect(page.locator('.detail-panel').getByLabel('名前', { exact: true })).toHaveValue(failedName);
    expect(durableImage(await nativeImage(page))).toEqual(durableImage(beforeRefusal));
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await page.locator('.editor-footer').getByRole('button', { name: '保存を再試行', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
    const saved = await backup(page), savedImage = await nativeImage(page);
    expect(saved.project.entities.find(e => e.id === scene.id)?.name).toBe(failedName);
    expect(saved.project.history.length).toBe(given.project.history.length + 2);
    expect(saved.recovery?.pending.length).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await info.attach('AT-E12-offline-complete.scenario', { body: Buffer.from(saved.bytes), contentType: 'application/zip' });
    // The real waiting worker can activate only after both controlled documents
    // leave the scope. No skipWaiting or privileged product API is called.
    await otherTab.close(); await page.context().setOffline(false);
    await page.goto(new URL('/e12-safe-point', url).href);
    await expect.poll(() => page.evaluate(async scope => Boolean((await navigator.serviceWorker.getRegistration(scope))?.waiting), url)).toBe(false);
    await page.goto(url);
    await expect(page.locator('.project-switch')).toContainText(given.project.name);
    await expect.poll(() => page.evaluate(async expected => (await caches.keys()).includes(expected), newCache)).toBe(true);
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(false);
    const afterUpdate = await backup(page); expect(afterUpdate.project).toEqual(saved.project);
    expect((await nativeImage(page)).tables.outbox).toEqual(savedImage.tables.outbox);
    const uncachedContext = await browser.newContext({ offline: true });
    try {
      const uncachedPage = await uncachedContext.newPage();
      const rejected = await uncachedPage.goto(url).then(() => false, () => true);
      expect(rejected).toBe(true);
    } finally { await uncachedContext.close(); }
    const recovery = await fullNewClone(browser, url, saved.bytes, saved.project);

    const migrationContext = await browser.newContext();
    try {
      const migratedPage = await migrationContext.newPage(); await seedVersionOne(migratedPage, url, saved.project, savedImage.tables.outbox);
      const oldImage = await nativeImage(migratedPage); expect(oldImage.version).toBe(10);
      await migratedPage.addInitScript(name => {
        const create = IDBDatabase.prototype.createObjectStore; let armed = true;
        IDBDatabase.prototype.createObjectStore = function (...args: Parameters<IDBDatabase['createObjectStore']>) {
          if (armed && this.name === name && args[0] === 'importDrafts') { armed = false; throw new DOMException('E12 copied native migration quota fixture', 'QuotaExceededError'); }
          return create.apply(this, args);
        };
      }, databaseName);
      await migratedPage.goto(url); await expect(migratedPage.getByRole('alert').filter({ hasText: /quota|Quota/ })).toBeVisible();
      expect(await nativeImage(migratedPage)).toEqual(oldImage);
      await migratedPage.getByRole('button', { name: '読み込みを再試行', exact: true }).click();
      await migratedPage.locator('.project-card').filter({ hasText: saved.project.name }).click();
      await migratedPage.reload(); await expect(migratedPage.locator('.project-switch')).toContainText(saved.project.name);
      const migrated = await backup(migratedPage); expect(migrated.project).toEqual(saved.project);
      expect((await nativeImage(migratedPage)).tables.outbox).toEqual(savedImage.tables.outbox);
      await info.attach('AT-E12-migration-retry-complete.scenario', { body: Buffer.from(migrated.bytes), contentType: 'application/zip' });
    } finally { await migrationContext.close(); }
    await attachObservation(info, 'AT-E12-local-observed', { build, browserVersion: browser.version(), completeSHA256: sha256(saved.bytes), recovery,
      cachedOfflineCold: true, realPendingOutbox: true, quotaRejectedDurableEditionUnchanged: true, unsavedInputAndFailureVisible: true,
      offlineColdNavigation: { url: coldURL.href, beforeDocumentNonce, offlineDocumentNonce, originalCache, cachedEntries, entireDurableImageUnchanged: true },
      normalSaveRetry: true, actualWaitingWorkerStayedInstalledUntilAllTabsLeft: true, copiedNativeMigrationRefusalAtomicAndNormalRetry: true,
      firstUncachedOfflineNavigationRejected: true,
      workerFixture: { originalSHA256: sha256(originalWorker), updatedSHA256: sha256(updatedWorker), changedOnlyCacheIdentity: true, applicationBytesChanged: false },
      blockedConditions: ['real old-application-build upgrade', 'physical-device flight mode', 'real OS Files save-location cancellation', 'unfetched material via its actual product control'],
      physicalDevice: false, realOSFilesVerified: false, originalWholeAcceptancePromotion: false });
  } finally { await page.context().setOffline(false); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
