import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Entity, EntityKind, ProjectData } from '../../src/domain/types';
import { validateProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, authorFingerprint, navigate, seed, timeline } from './ap04-original-bm-helpers';
export * from './ap04-original-bm-helpers';

export async function assetGiven(page: Page, info: TestInfo, id: string, project: ProjectData, assets: Record<string, Uint8Array>, facts: unknown) {
  const checked = validateProject(project); if (!checked.ok) throw Error(JSON.stringify(checked.issues));
  const bytes = await exportScenario(project, { loadAsset: hash => assets[hash] }); await attachGiven(info, id, bytes, facts); await seed(page, bytes);
}
export async function storedEntity<K extends EntityKind>(page: Page, id: string, kind: K): Promise<Entity<K>> {
  const records = JSON.parse(await authorFingerprint(page))[1] as { id: string; kind: EntityKind; record: Entity }[];
  const row = records.find(record => record.id === id && record.kind === kind); if (!row || row.record.kind !== kind) throw Error(`正本情報がありません: ${kind} ${id}`); return row.record as Entity<K>;
}
export async function storedNamed<K extends EntityKind>(page: Page, name: string, kind: K): Promise<Entity<K>> {
  const records = JSON.parse(await authorFingerprint(page))[1] as { id: string; kind: EntityKind; record: Entity }[];
  const row = records.find(record => record.record.name === name && record.kind === kind); if (!row || row.record.kind !== kind) throw Error(`正本情報がありません: ${kind} ${name}`); return row.record as Entity<K>;
}
export async function selectEvent(page: Page, id: string) {
  await timeline(page); await page.getByRole('button', { name: '出来事一覧', exact: true }).click(); await page.locator(`.event-table-row[data-event-id="${id}"]`).click(); await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
}
export async function timeEditor(page: Page, event: Entity<'event'>) {
  await selectEvent(page, event.id); await page.getByRole('button', { name: '選択した出来事の日時・制約', exact: true }).click(); return page.getByRole('dialog', { name: `日時・前後関係 · ${event.name}`, exact: true });
}
export async function world(page: Page, tab: string) {
  await navigate(page, /^年表/); await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click(); await page.getByRole('tab', { name: tab, exact: true }).click();
}
export async function rejectData(page: Page, data: unknown, reason: RegExp) {
  const before = await authorFingerprint(page), details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) }); if ((await details.getAttribute('open')) === null) await details.locator('summary').click(); await details.getByRole('textbox', { name: '詳細データ', exact: true }).fill(JSON.stringify(data, null, 2)); const save = page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }); if (await save.isEnabled()) await save.click(); await expect(page.locator('.detail-panel')).toContainText(reason); expect(await authorFingerprint(page)).toBe(before);
}
export async function output(page: Page, profileId: string, purpose: string, html = false) {
  await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '目的別出力', exact: true }).click(); await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profileId); await page.getByLabel('出力目的', { exact: true }).selectOption(purpose); if (html) await page.getByLabel('本文の出力形式', { exact: true }).selectOption('html'); await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click(); await expect(page.getByRole('heading', { name: '出力内容の確認', exact: true })).toBeVisible(); const pending = page.waitForEvent('download'); await page.locator('.export-artifact').first().getByRole('button', { name: 'この内容を保存', exact: true }).click(); const download = await pending; expect(await download.failure()).toBeNull(); return readFile((await download.path())!, 'utf8');
}
