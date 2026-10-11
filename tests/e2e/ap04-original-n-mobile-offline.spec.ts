import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { prepareAsset } from '../../src/domain/attachments';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// Browser viewport/touch/offline observations are supporting evidence. They do
// not establish physical target-device or actual airplane-mode acceptance.
async function reachable(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox(), viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error('対象操作の表示位置を観測できません');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height / 2).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height / 2).toBeLessThanOrEqual(viewport.height);
}

async function noPageWideScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  return dimensions;
}

for (const width of [320, 390]) test(`AT-N01 幅${width} CSS pxの縦画面で一覧から線を編集し、エラー・確定・復元へ到達し横図の表代替を開く`, async ({ browser }, info) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ baseURL: info.project.use.baseURL as string, viewport: { width, height: 820 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(), p = createProject(`AT-N01 幅${width}の線編集`);
    const a = createEntity(p.projectId, 'character', '表から編集する人物A'), b = createEntity(p.projectId, 'character', '表から編集する人物B');
    const flag = createEntity(p.projectId, 'variable', '線の真偽条件', { key: 'mobile_gate', valueType: 'boolean', initial: { type: 'boolean', value: true } });
    const entry = createEntity(p.projectId, 'flow_node', '縦画面の入口', { nodeType: 'entry' });
    const end = createEntity(p.projectId, 'flow_node', '縦画面の終端', { nodeType: 'terminal', terminalReason: '線を復元した' });
    const unfinished = createEntity(p.projectId, 'flow_edge', '一覧から編集する未接続の線', { fromId: entry.id, toId: { unresolved: { label: '行き先未定', reason: '作者が一覧から接続する' } }, label: '一覧から編集する線', condition: { op: 'compare', variableId: flag.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const graph = createEntity(p.projectId, 'flow_graph', '一覧の線を含むgraph', { nodeIds: [entry.id, end.id], edgeIds: [unfinished.id], entryIds: [entry.id], exitIds: [end.id] });
    p.entities.push(a, b, flag, entry, end, unfinished, graph);
    p.entities.forEach(entity => { entity.status = 'confirmed'; });
    const relationId = newId();
    p.relations.push({ id: relationId, projectId: p.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' });
    const bytes = await exportScenario(p);
    await attachGiven(info, 'AT-N01', bytes, { cssViewport: { width, height: 820 }, browserTouchEmulation: true, actualPhysicalDevice: 'not_run', entryId: entry.id, edgeId: unfinished.id, destinationId: end.id, relationId });
    await seed(page, bytes);
    await navigate(page, /^構成/);
    await page.getByRole('tab', { name: '分岐', exact: true }).tap();
    const line = page.locator('.branch-edge').filter({ hasText: unfinished.data.label! });
    await reachable(page, line);
    await line.tap();
    const editor = page.locator('.detail-panel');
    await expect(editor.locator('#entity-name')).toHaveValue(unfinished.name);
    await editor.getByLabel('行き先未定の下書き', { exact: true }).uncheck();
    const destination = editor.getByLabel('行き先ノード', { exact: true });
    await reachable(page, destination);
    await destination.selectOption(end.id);
    const comparator = editor.locator('[data-field="condition"]').getByLabel('比較演算', { exact: true });
    // The structured Boolean selector correctly prevents an ordered operator.
    // Exercise the same invalid AST through the ordinary advanced JSON input.
    await expect(comparator.locator('option[value="lt"]')).toBeDisabled();
    const save = editor.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ });
    await reachable(page, save);
    await save.tap();
    await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
    const details = editor.locator('details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
    await details.locator('summary').tap();
    const raw = details.getByRole('textbox', { name: '詳細データ', exact: true });
    const validData = JSON.parse(await raw.inputValue());
    expect(validData.toId).toBe(end.id);
    expect(validData.condition).toEqual(unfinished.data.condition);
    const invalidData = { ...validData, condition: { ...validData.condition, comparator: 'lt' } };
    const beforeInvalid = await authorFingerprint(page);
    await reachable(page, raw);
    await raw.fill(JSON.stringify(invalidData, null, 2));
    const issue = editor.locator('[data-field="condition"]').getByRole('alert');
    await expect(issue).toContainText('大小の比較には整数');
    await reachable(page, issue);
    await reachable(page, save);
    await expect(save).toBeDisabled();
    await expect(raw).toHaveValue(JSON.stringify(invalidData, null, 2));
    expect(await authorFingerprint(page)).toBe(beforeInvalid);
    await raw.fill(JSON.stringify(validData, null, 2));
    await expect(issue).toHaveCount(0);
    await reachable(page, save);
    await save.tap();
    await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
    const afterEditDimensions = await noPageWideScroll(page);
    await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).tap();
    await expect(line).toContainText(end.name);
    await navigate(page, /^年表/);
    await page.getByRole('tab', { name: '関係表・図', exact: true }).tap();
    await page.getByRole('button', { name: '関係図', exact: true }).tap();
    await expect(page.locator('.world-relation-canvas > svg')).toBeVisible();
    const tableButton = page.getByRole('button', { name: '関係表', exact: true });
    await reachable(page, tableButton);
    await tableButton.tap();
    const table = page.locator('.world-relation-table');
    await expect(table).toContainText(a.name);
    await expect(table).toContainText(b.name);
    const afterTableDimensions = await noPageWideScroll(page);
    const saved = await backup(page);
    expect(saved.project.entities.find(entity => entity.id === unfinished.id)?.data).toMatchObject({ fromId: entry.id, toId: end.id, condition: unfinished.data.condition });
    const beforeRestore = await authorFingerprint(page);
    await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'N01-invalid.scenario', mimeType: 'application/zip', buffer: Buffer.from('invalid archive bytes') });
    const restorationIssue = page.locator('.backup-panel').getByRole('alert');
    await expect(restorationIssue).toBeVisible();
    await reachable(page, restorationIssue);
    expect(await authorFingerprint(page)).toBe(beforeRestore);
    const restoredContext = await browser.newContext({ baseURL: info.project.use.baseURL as string, viewport: { width, height: 820 }, hasTouch: true, isMobile: true });
    try {
      const restored = await restoredContext.newPage();
      await seed(restored, saved.bytes);
      const cold = await backup(restored);
      expect(cold.project).toEqual(saved.project);
      await navigate(restored, /^構成/);
      await restored.getByRole('tab', { name: '分岐', exact: true }).tap();
      const recoveredLine = restored.locator('.branch-edge').filter({ hasText: unfinished.data.label! });
      await reachable(restored, recoveredLine);
      await recoveredLine.tap();
      await expect(restored.locator('.detail-panel').getByLabel('行き先ノード', { exact: true })).toHaveValue(end.id);
      const restoredSave = restored.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true });
      await reachable(restored, restoredSave);
      await restoredSave.tap();
      await expect(restored.locator('.editor-save-state')).toContainText('端末内保存済み');
      const restoredDimensions = await noPageWideScroll(restored);
      await attachObservation(info, 'AT-N01-observation', { width, edgeId: unfinished.id, destinationId: end.id, afterEditDimensions, afterTableDimensions, restoredDimensions, touchTargetsReached: true, dragOrHoverNeeded: false, currentAndRestoredProjectId: saved.project.projectId, actualPhysicalDevice: 'not_run' });
    } finally { await restoredContext.close(); }
  } finally { await context.close(); }
});

test('AT-N11 補助: 取得済みPWAの作品をbrowser offlineで編集し、閉じて再開し実保存ファイルと未送信・素材bytes不足を区別する', async ({ page, context, browser }, info) => {
  test.setTimeout(90_000);
  const p = createProject('AT-N11 取得済み作品の継続');
  const scene = createEntity(p.projectId, 'scene', 'オフラインで残す本文', { body: textToRichText('取得済みの本文😀は端末内に残る。') });
  const preparedAsset = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), 'N11 取得済みの音.wav', 'audio/wav');
  const { bytes: _assetBytes, preview: _assetPreview, ...assetMetadata } = preparedAsset;
  const attachment = createEntity(p.projectId, 'attachment', 'N11 取得済みの音', assetMetadata);
  p.entities.push(scene, attachment);
  const bytes = await exportScenario(p, { loadAsset: async hash => hash === preparedAsset.contentHash ? preparedAsset.bytes : undefined });
  await seed(page, bytes);
  const url = page.url();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cachesObserved = await page.evaluate(async () => Promise.all((await caches.keys()).map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(request => request.url) }))));
  expect(cachesObserved.some(cache => cache.urls.some(url => /\/assets\/index-.*\.js$/.test(url)))).toBe(true);
  await attachGiven(info, 'AT-N11', bytes, { cachedProductionWorker: true, cachesObserved, projectId: p.projectId, sceneId: scene.id, assetHash: preparedAsset.contentHash, networkCondition: 'Playwright browser offline', physicalAirplaneMode: 'blocked_external_condition', realUncachedRemoteAttachment: 'blocked_external_condition' });
  try {
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await openEntity(page, 'scene', scene.name);
    await page.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true }).click();
    const changedBody = '機内モードの補助試験で保存した本文😀。実機の機内モードとは区別する。';
    await page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true }).fill(changedBody);
    await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
    await expect(page.locator('.topbar-status')).toContainText('端末内保存済み');
    await expect(page.locator('.topbar-status')).toContainText('OFFLINE');
    const beforeClose = await backup(page), beforeCloseScene = beforeClose.project.entities.find(entity => entity.id === scene.id);
    if (!beforeCloseScene || beforeCloseScene.kind !== 'scene') throw new Error('閉じる前に保存した本文がありません');
    expect(beforeCloseScene.data.body).toHaveLength(1);
    const editedBlockId = beforeCloseScene.data.body[0].id;
    expect(editedBlockId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(editedBlockId).not.toBe(scene.data.body[0].id);
    expect(beforeCloseScene.data).toEqual({ ...scene.data, body: [{ ...scene.data.body[0], id: editedBlockId, text: changedBody }] });
    expect(beforeClose.project.entities.map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(p.entities.map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)));
    expect(beforeClose.project.entities.find(entity => entity.id === attachment.id)?.data).toEqual(attachment.data);
    const editOperation = beforeClose.project.history.find(command => command.before.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === scene.data.body[0].id)
      && command.after.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === editedBlockId && entity.data.body[0]?.text === changedBody));
    expect(editOperation).toBeDefined();
    const beforeCloseFingerprint = await authorFingerprint(page);
    await info.attach('AT-N11-before-close.scenario', { body: Buffer.from(beforeClose.bytes), contentType: 'application/zip' });
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(reopened.locator('.app-shell')).toBeVisible();
    await expect.poll(() => reopened.evaluate(() => navigator.onLine)).toBe(false);
    expect(await authorFingerprint(reopened)).toBe(beforeCloseFingerprint);
    await openEntity(reopened, 'scene', scene.name);
    await reopened.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true }).click();
    await expect(reopened.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true })).toHaveValue(changedBody);
    const saved = await backup(reopened);
    expect(saved.project.entities).toEqual(beforeClose.project.entities);
    expect(saved.project.history).toEqual(beforeClose.project.history);
    expect(saved.project.snapshots).toEqual(beforeClose.project.snapshots);
    expect(saved.assets).toEqual(beforeClose.assets);
    expect(saved.recovery?.pending).toEqual(beforeClose.recovery?.pending);
    expect(saved.project.entities.find(entity => entity.id === scene.id)?.data).toEqual(beforeCloseScene.data);
    expect(saved.assets[0].bytes).toEqual(preparedAsset.bytes);
    expect(saved.recovery?.pending.length).toBeGreaterThan(0);
    await info.attach('AT-N11-offline-complete.scenario', { body: Buffer.from(saved.bytes), contentType: 'application/zip' });
    // The normal replacement preview explicitly identifies unsent edits while
    // the same app's topbar already identifies a completed local save.
    await reopened.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'N11-complete.scenario', mimeType: 'application/zip', buffer: Buffer.from(saved.bytes) });
    await reopened.getByLabel('復元方法', { exact: true }).selectOption('replace');
    await reopened.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
    await expect(reopened.locator('.import-preview').getByRole('alert')).toContainText('未送信の変更');
    await expect(reopened.getByRole('button', { name: 'この内容で復元する', exact: true })).toBeDisabled();
    await reopened.locator('.import-preview').getByRole('button', { name: '中止', exact: true }).click();
    const authorBeforeMissing = await authorFingerprint(reopened);
    // Auxiliary native-cache loss fixture: remove actual stored bytes, leaving
    // author metadata untouched. This is not a real uncached remote download.
    await reopened.evaluate(async hash => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('scenario-manager-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(hash); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); }
      finally { db.close(); }
    }, preparedAsset.contentHash);
    await openEntity(reopened, 'attachment', attachment.name);
    await expect(reopened.locator('.asset-preview').getByRole('status')).toContainText('この端末には素材bytesがありません');
    await expect(reopened.locator('.asset-preview').getByRole('button', { name: '素材を保存', exact: true })).toHaveCount(0);
    await expect(reopened.locator('.asset-preview audio')).toHaveCount(0);
    expect(await authorFingerprint(reopened)).toBe(authorBeforeMissing);
    let missingDownloads = 0;
    reopened.on('download', () => { missingDownloads++; });
    await navigate(reopened, /^作品・保存/);
    await reopened.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
    await reopened.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
    await expect(reopened.locator('.backup-panel').getByRole('alert')).toContainText(/添付|素材|bytes/);
    expect(missingDownloads).toBe(0);
    await openEntity(reopened, 'scene', scene.name);
    await reopened.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true }).click();
    await expect(reopened.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true })).toHaveValue(changedBody);
    const firstAcquisition = await browser.newContext({ offline: true });
    try {
      const firstPage = await firstAcquisition.newPage();
      expect(await firstPage.goto(url).then(() => false, () => true)).toBe(true);
      await expect(firstPage.locator('.app-shell')).toHaveCount(0);
    } finally { await firstAcquisition.close(); }
    await attachObservation(info, 'AT-N11-supporting-observation', { projectId: p.projectId, sceneId: scene.id, originalBodyBlockId: scene.data.body[0].id, bodyBlockId: editedBlockId, editOperationId: editOperation?.operationId, coldBody: changedBody, fullBeforeCloseEntities: beforeClose.project.entities, fullAfterReopenEntities: saved.project.entities, pendingOperations: saved.recovery?.pending.map(operation => operation.operationId), embeddedAssetBytesBeforeLoss: saved.assets[0].bytes.length, firstAcquisitionOfflineRejected: true, missingAssetNotPresentedAsAvailable: true, networkCondition: 'synthetic_browser_offline', materialCondition: 'synthetic_native_cache_loss', physicalAirplaneMode: 'blocked_external_condition', realUncachedRemoteAttachment: 'blocked_external_condition', fullOriginalAcceptanceResult: 'not_run' });
  } finally { await context.setOffline(false); }
});
