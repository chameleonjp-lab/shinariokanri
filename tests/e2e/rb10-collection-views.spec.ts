import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, validateProject } from '../../src/domain/model';
import { exportScenario, inspectScenario } from '../../src/storage/archive';

async function nav(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).click();
}
async function durable(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open('scenario-manager-local-v1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    try {
      return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const names = ['projects', 'entities', 'relations', 'blocks', 'commands', 'outbox', 'recordParts'], tx = db.transaction(names, 'readonly'), rows: Record<string, unknown[]> = {};
        for (const name of names) { const q = tx.objectStore(name).getAll(); q.onsuccess = () => { rows[name] = q.result; }; }
        tx.oncomplete = () => resolve(rows); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
test('saved result IDs remain the same across cards/table/diagram/timeline, tail editing, relationship editing and a cold complete save', async ({ page }) => {
  const project = createProject('同じ結果を四つの表示へ');
  const a = createEntity(project.projectId, 'character', '人物A'), b = createEntity(project.projectId, 'character', '人物B');
  a.status = b.status = 'confirmed';
  const event = createEntity(project.projectId, 'event', '日時の元情報', { time: { mode: 'instant', at: '4', calendarId: project.calendarId } }); event.status = 'confirmed';
  const rejected = createEntity(project.projectId, 'event', '没の出来事', { time: { mode: 'instant', at: '1', calendarId: project.calendarId } }); rejected.status = 'rejected';
  const scenes = Array.from({ length: 65 }, (_, i) => createEntity(project.projectId, 'scene', `場面${String(i + 1).padStart(2, '0')}`, { eventIds: [event.id] }));
  const fixedIds = [...scenes, a, b, event, rejected].map(entity => entity.id);
  const dynamic = createEntity(project.projectId, 'collection', '場面の動的一覧', { mode: 'dynamic', query: { op: 'kind', value: 'scene' }, memberIds: [] });
  const fixed = createEntity(project.projectId, 'collection', '情報の固定一覧', { mode: 'fixed', query: null, memberIds: fixedIds });
  project.entities = [...scenes, a, b, event, rejected, dynamic, fixed];
  const relation = { id: newId(), projectId: project.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'related', direction: 'forward' as const, validity: emptyValidity(), evidenceIds: [event.id], status: 'confirmed' as const, visibility: 'private' as const };
  project.relations = [relation, { ...relation, id: newId(), status: 'rejected' }];
  expect(validateProject(project)).toMatchObject({ ok: true });
  await page.goto(''); await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'collections.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check(); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await expect(page.locator('.app-shell')).toBeVisible();
  await nav(page, /^検索/); await page.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(dynamic.id);
  const views = page.locator('[aria-label="検索結果の表示"]'), before = await durable(page);
  await views.getByRole('button', { name: '図', exact: true }).click();
  const diagram = page.getByRole('region', { name: '同じ検索結果の図', exact: true });
  await expect(diagram.locator('g[data-entity-id]')).toHaveCount(60);
  await page.getByRole('navigation', { name: '検索結果図の項目のページ', exact: true }).getByRole('button', { name: '次のページ' }).click();
  await expect(diagram.locator('g[data-entity-id]')).toHaveCount(5);
  expect(await diagram.locator('g[data-entity-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-entity-id')))).toEqual(scenes.slice(60).map(entity => entity.id));
  await diagram.getByRole('button', { name: '場面65 · 下書き · 詳細を開く', exact: true }).press('Enter');
  await expect(page.getByLabel('名前', { exact: true })).toHaveValue('場面65'); await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await expect(diagram.locator('g[data-entity-id]')).toHaveCount(5);
  await views.getByRole('button', { name: '年表', exact: true }).click();
  const timeline = page.getByRole('region', { name: '同じ検索結果の年表', exact: true });
  await expect(timeline.locator('li[data-entity-id]')).toHaveCount(60); await expect(timeline).toContainText('日時の元情報');
  await views.getByRole('button', { name: '表', exact: true }).click(); await expect(page.getByRole('table', { name: '同じ検索結果の一覧' }).locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('table', { name: '同じ検索結果の一覧' })).toContainText('場面65');
  await views.getByRole('button', { name: 'カード', exact: true }).click(); expect(await durable(page)).toEqual(before);
  await page.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(fixed.id); await views.getByRole('button', { name: '図', exact: true }).click();
  await expect(diagram).toContainText('同じ69件'); await expect(diagram).toContainText('66本の関係');
  await expect(diagram.locator('li[data-relation-id]')).toHaveCount(1);
  await diagram.locator(`li[data-relation-id="${relation.id}"]`).getByRole('button', { name: '元情報・根拠を確認', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '意味付きの関係を編集', exact: true }); await expect(modal).toContainText('日時の元情報');
  await modal.getByLabel('関係の向き', { exact: true }).selectOption('symmetric'); await modal.getByRole('button', { name: '関係を保存', exact: true }).click(); await expect(modal).toHaveCount(0); await expect(diagram).toContainText('←→');
  await views.getByRole('button', { name: '年表', exact: true }).click();
  await page.getByRole('navigation', { name: '検索結果年表のページ', exact: true }).getByRole('button', { name: '次のページ' }).click();
  await expect(timeline).toContainText('没の出来事は現在有効な日時へ含めません');
  await nav(page, /^作品・保存/); await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const restored = await inspectScenario(new Uint8Array(await readFile((await (await pending).path())!)), { worker: false });
  expect(restored.project.entities).toEqual(project.entities); expect(restored.project.relations.find(item => item.id === relation.id)?.direction).toBe('symmetric');
  expect(restored.project.relations.find(item => item.status === 'rejected')?.direction).toBe('forward');
  await page.reload(); await nav(page, /^検索/); await page.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(fixed.id); await views.getByRole('button', { name: '図', exact: true }).click(); await expect(diagram).toContainText('66本の関係'); await expect(diagram).toContainText('←→');
});
