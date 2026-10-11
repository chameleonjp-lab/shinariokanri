import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectScenario } from '../../src/storage/archive';

export async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}

export async function seed(page: Page, bytes: Uint8Array) {
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({
    name: 'ap04-original.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes),
  });
  await page.getByLabel('復元方法', { exact: true }).selectOption('new');
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await page.getByRole('dialog', { name: '作品ファイルを読み込む', exact: true }).waitFor({ state: 'hidden' });
  await expect(page.locator('.app-shell')).toBeVisible();
}

export async function openEntity(page: Page, kind: string, name: string) {
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption(kind);
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
}

export async function editData(page: Page, data: unknown) {
  const details = page.locator('.detail-panel details.advanced-details').filter({
    has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }),
  });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.getByRole('textbox', { name: '詳細データ', exact: true }).fill(JSON.stringify(data, null, 2));
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel')).toContainText('端末内保存済み');
}

export async function backup(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const bytes = new Uint8Array(await readFile((await (await pending).path())!));
  return { bytes, ...(await inspectScenario(bytes, { worker: false })) };
}

// Read only the durable author records. Editor input retention is a separate,
// intentionally mutable store and is not evidence of a committed save.
export async function authorFingerprint(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['projects', 'entities', 'relations', 'snapshots', 'commands', 'outbox'];
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => new Promise<unknown[]>((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
      return JSON.stringify(rows);
    } finally { db.close(); }
  });
}

export async function attachGiven(info: TestInfo, caseId: string, bytes: Uint8Array, facts: unknown) {
  await info.attach(`${caseId}-given.scenario`, { body: Buffer.from(bytes), contentType: 'application/zip' });
  await attachObservation(info, `${caseId}-given`, {
    fixtureSha256: createHash('sha256').update(bytes).digest('hex'), fixtureBytes: bytes.length, facts,
  });
}

export async function attachObservation(info: TestInfo, name: string, observation: unknown) {
  await info.attach(`${name}.json`, { body: Buffer.from(JSON.stringify(observation, null, 2)), contentType: 'application/json' });
}
