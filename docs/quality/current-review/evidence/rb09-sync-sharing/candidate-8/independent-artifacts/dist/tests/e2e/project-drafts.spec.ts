import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';
async function importProject(page: Page, project: ProjectData) {
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'project.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
}
async function library(page: Page) { await page.locator('.project-switch').click(); }
async function openTemplate(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name: /^検索/ }).click();
  await page.getByLabel('作品内を検索').fill(name);
  await page.locator('.entity-card').filter({ hasText: name }).first().click();
  return page.locator('.detail-panel');
}
test('同じ情報IDを持つ別作品でも未保存の雛形入力を作品ごとに保持する', async ({ page }) => {
  const a = createProject('作品A'), b = createProject('作品B');
  const ta = createEntity(a.projectId, 'template', '雛形A'), tb = createEntity(b.projectId, 'template', '雛形B');
  tb.id = ta.id; a.entities = [ta]; b.entities = [tb];
  await page.goto('./'); await importProject(page, a); await library(page); await importProject(page, b);
  await library(page); await page.locator('.project-card').filter({ hasText: a.name }).click();
  let editor = await openTemplate(page, ta.name);
  await editor.getByLabel('名前', { exact: true }).fill('作品Aの未保存入力');
  await expect(page.getByRole('button', { name: '1件の未保存入力' })).toBeVisible();
  await library(page); await page.locator('.project-card').filter({ hasText: b.name }).click();
  editor = await openTemplate(page, tb.name);
  await expect(editor.getByLabel('名前', { exact: true })).toHaveValue(tb.name);
  await editor.getByLabel('名前', { exact: true }).fill('作品Bの未保存入力');
  await library(page); await page.locator('.project-card').filter({ hasText: a.name }).click();
  editor = await openTemplate(page, ta.name);
  await expect(editor.getByLabel('名前', { exact: true })).toHaveValue('作品Aの未保存入力');
  await expect(page.getByRole('button', { name: '1件の未保存入力' })).toBeVisible();
});
