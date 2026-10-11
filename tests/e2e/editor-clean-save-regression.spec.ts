import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inspectScenario } from '../../src/storage/archive';
import { seed, openEntity } from './ap04-original-helpers';

async function durableImage(page: Page) {
  return page.evaluate(async () => {
    const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'worlds', 'recoveredPending', 'recordParts'];
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('scenario-manager-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const transaction = db.transaction(names, 'readonly'), rows: Record<string, unknown[]> = {};
        for (const name of names) { const request = transaction.objectStore(name).getAll(); request.onsuccess = () => { rows[name] = request.result; }; }
        transaction.oncomplete = () => resolve(rows); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  });
}

test('正常UIの自動保存後の同じ手動保存は11保存表・履歴・未送信命令を増やさず、次の実編集を一度保存する', async ({ page }) => {
  const bytes = new Uint8Array(await readFile('docs/quality/current-review/evidence/legacy/3099c9d-flow-trace.scenario'));
  const original = (await inspectScenario(bytes, { worker: false })).project;
  const scene = original.entities.find(entity => entity.kind === 'scene');
  if (!scene) throw new Error('Regression legacy fixture has no scene');
  await seed(page, bytes);
  const imported = await durableImage(page);
  expect(imported.commands).toHaveLength(original.history.length + 1);
  expect(imported.outbox).toHaveLength(1);
  expect(JSON.stringify(imported.commands)).toContain('専用ファイルをnewで復元');
  await openEntity(page, 'scene', scene.name);
  const name = page.locator('.detail-panel').getByLabel('名前', { exact: true });
  await name.fill(`${scene.name}・自動保存された編集`);
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await expect.poll(async () => (await durableImage(page)).commands.length).toBe(imported.commands.length + 1);
  const saved = await durableImage(page);
  expect(saved.commands).toHaveLength(imported.commands.length + 1);
  expect(saved.outbox).toHaveLength(imported.outbox.length + 1);
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  expect(await durableImage(page)).toEqual(saved);
  await name.fill(`${scene.name}・次の実編集`);
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const changed = await durableImage(page);
  expect(changed.commands).toHaveLength(saved.commands.length + 1);
  expect(changed.outbox).toHaveLength(saved.outbox.length + 1);
  await expect(name).toHaveValue(`${scene.name}・次の実編集`);
});
