import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inspectScenario, type PreparedScenario } from '../../src/storage/archive';

const fixtureRoot = 'tests/fixtures/rb10-import-errors/';
interface Fixture { path: string; bytes: number; sha256: string; expected_reason?: string; expected_path?: string }
async function fixture(row: Fixture) {
  const bytes = await readFile(fixtureRoot + row.path);
  expect(bytes.length).toBe(row.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
  return bytes;
}
async function navigate(page: Page, name: RegExp) {
  await page.locator('.app-shell').waitFor();
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function openBackup(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
}
async function backup(page: Page) {
  await openBackup(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return inspectScenario(new Uint8Array(await readFile((await file.path())!)), { worker: false });
}
async function durable(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Keep binary bytes in the comparison, including retained import inputs.
    const normalize = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
      if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
      return value;
    };
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'restorePoints', 'worlds', 'recoveredPending', 'recordParts', 'workspaceInputs', 'authorToolDrafts', 'importDrafts'];
        const tx = db.transaction(names, 'readonly'), rows: Record<string, unknown> = {};
        for (const name of names) {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => { rows[name] = normalize(request.result); };
        }
        tx.oncomplete = () => resolve(rows);
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
function assetsAndWorlds(value: PreparedScenario) {
  return { worlds: value.worlds, assets: value.assets.map(asset => ({
    path: asset.path, hash: asset.contentHash, mediaType: asset.mediaType,
    bytes: Array.from(asset.bytes),
  })).sort((a, b) => a.path.localeCompare(b.path)) };
}

test('AT-N09 rejects every original corrupt fixture with its path and reason, keeps native bytes and the prior draft, then retries and cold-restores', async ({ page }) => {
  test.setTimeout(60_000);
  const manifest = JSON.parse(await readFile(fixtureRoot + 'MANIFEST.json', 'utf8')) as { complete: Fixture; negative: Fixture[] };
  expect(manifest.negative).toHaveLength(7);
  for (const row of manifest.negative) expect(row.expected_path).toBeTruthy();
  const goodBytes = await fixture(manifest.complete), original = await inspectScenario(new Uint8Array(goodBytes), { worker: false });
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'complete.scenario', mimeType: 'application/zip', buffer: goodBytes });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  const scene = original.project.entities.find(entity => entity.kind === 'scene')!;
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: scene.name, exact: true }) }).click();
  await page.getByLabel('名前', { exact: true }).fill('不正ファイルの後も保持する場面😀');
  await page.locator('.editor-footer').getByRole('button', { name: /^(保存する|保存を再試行)$/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const before = await backup(page);
  const fileInput = page.getByLabel('保存ファイルを選ぶ', { exact: true });
  // Hold a valid, explicitly checked clone draft before selecting bad files.
  await fileInput.setInputFiles({ name: 'complete.scenario', mimeType: 'application/zip', buffer: goodBytes });
  await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('clone');
  const confirmation = page.getByLabel('復元方法と対象への影響を確認しました');
  await confirmation.check();
  await expect(page.getByRole('button', { name: 'この内容で復元する', exact: true })).toBeEnabled();
  for (const row of manifest.negative) {
    const saved = await durable(page);
    await fileInput.setInputFiles({ name: row.path, mimeType: 'application/zip', buffer: await fixture(row) });
    const alert = page.locator('.backup-page').getByRole('alert');
    await expect(alert).toContainText(new RegExp(row.expected_reason!));
    await expect(alert).toContainText(row.expected_path!);
    await expect(page.getByRole('heading', { name: `検査済みの作品 · ${original.project.name}`, exact: true })).toBeVisible();
    await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('clone');
    await expect(confirmation).toBeChecked();
    expect(await durable(page)).toEqual(saved);
  }
  // An unreadable container has no inner path; keep the known selected name.
  const brokenContainer = Buffer.from(goodBytes), saved = await durable(page);
  brokenContainer.fill(0, brokenContainer.length - 22);
  await fileInput.setInputFiles({ name: 'broken-container.scenario', mimeType: 'application/zip', buffer: brokenContainer });
  const containerAlert = page.locator('.backup-page').getByRole('alert');
  await expect(containerAlert).toContainText('broken-container.scenario');
  await expect(containerAlert).toContainText(/ZIP|コンテナ|中央/);
  await expect(confirmation).toBeChecked();
  expect(await durable(page)).toEqual(saved);
  await page.reload();
  const after = await backup(page);
  expect(after.project).toEqual(before.project);
  expect(assetsAndWorlds(after)).toEqual(assetsAndWorlds(before));
  await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('clone');
  await expect(confirmation).not.toBeChecked();
  await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
  await confirmation.check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect.poll(async () => (await durable(page)).projects).toHaveLength(2);
  await expect(page.getByRole('heading', { name: `検査済みの作品 · ${original.project.name}`, exact: true })).toBeHidden();
  await page.reload();
  const retry = await backup(page);
  expect(retry.project.projectId).not.toBe(original.project.projectId);
  expect(retry.project.name).toBe(original.project.name);
  expect(retry.project.entities).toHaveLength(original.project.entities.length);
  expect(retry.project.entities.filter(entity => entity.kind === 'scene').map(entity => entity.name)).toContain(scene.name);
  expect(assetsAndWorlds(retry)).toEqual(assetsAndWorlds(original));
});
