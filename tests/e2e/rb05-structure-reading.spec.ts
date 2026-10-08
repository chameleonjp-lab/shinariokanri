import { test, expect, type Page } from '@playwright/test';
import { createProject, createEntity } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';
async function navigate(page: Page, label: RegExp) { const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click(); await page.getByRole('button', { name: label }).first().click(); }
async function importProject(page: Page, project: ProjectData) {
  await page.goto('./'); await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'rb05.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check(); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
}
test('RB05 途中開始の状態値を通常フォームで編集し、画面移動・再読込・試読・巻戻へ接続する', async ({ page }) => {
  const p = createProject('途中開始の通常操作');
  const variable = createEntity(p.projectId, 'variable', '好感度', { key: 'affinity', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } });
  const a = createEntity(p.projectId, 'flow_node', '途中の入口', { nodeType: 'entry' }), b = createEntity(p.projectId, 'flow_node', '途中の終端', { nodeType: 'terminal', terminalReason: '好感度を確認した' });
  const edge = createEntity(p.projectId, 'flow_edge', '好感度5で進む', { fromId: a.id, toId: b.id, label: '好感度5で進む', condition: { op: 'compare', variableId: variable.id, comparator: 'ge', value: { type: 'integer', value: 5 } } }); p.entities.push(variable, a, b, edge);
  await importProject(page, p); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(a.id); await page.getByRole('button', { name: '途中開始の状態を作成', exact: true }).click();
  const editor = page.locator('.detail-panel'); await expect(editor).toContainText('途中開始の状態');
  const values = editor.locator('[data-field="runtimeState"] .sd-record-rows').first();
  await values.getByLabel('値', { exact: true }).fill('5'); await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await page.getByRole('button', { name: '試読を始める', exact: true }).click(); await expect(page.locator('.reader-trial-heading')).toContainText('途中開始の経路');
  await page.getByRole('button', { name: '好感度5で進む', exact: true }).click(); await expect(page.locator('.reader-sheet h2')).toHaveText('途中の終端');
  await page.getByRole('button', { name: '一手戻る', exact: true }).click(); await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('5');
  await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  const version = await page.getByLabel('試読する作品版', { exact: true }).locator('option').filter({ hasText: '途中開始の固定版' }).getAttribute('value');
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(version!); await page.getByLabel('保存した開始状態', { exact: true }).selectOption({ label: '途中開始の状態' });
  await page.getByRole('button', { name: '試読を始める', exact: true }).click(); await expect(page.getByRole('button', { name: '好感度5で進む', exact: true })).toBeEnabled();
});

test('RB05 反応系列の下書きを移動から再開し、作成・保存・再読込・初回／再訪を通常試読する', async ({ page }) => {
  const p = createProject('短い反応の通常操作');
  const first = createEntity(p.projectId, 'scene', '初回の反応', { body: [{ id: crypto.randomUUID(), kind: 'paragraph', text: '初めまして。' }] });
  const again = createEntity(p.projectId, 'scene', '再訪の反応', { body: [{ id: crypto.randomUUID(), kind: 'paragraph', text: 'また会いましたね。' }] }); p.entities.push(first, again);
  await importProject(page, p); await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click();
  await page.locator('summary').filter({ hasText: '短い反応の系列を作る' }).click(); await page.getByLabel('反応の系列名', { exact: true }).fill('挨拶の系列');
  await page.getByRole('checkbox', { name: '初回の反応', exact: true }).check(); await page.getByRole('checkbox', { name: '再訪の反応', exact: true }).check();
  await navigate(page, /^資料/); await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click();
  await page.locator('summary').filter({ hasText: '短い反応の系列を作る' }).click(); await expect(page.getByLabel('反応の系列名', { exact: true })).toHaveValue('挨拶の系列');
  await page.getByRole('button', { name: '作成する分岐を確認', exact: true }).click(); await page.getByRole('button', { name: '確認した反応系列を保存', exact: true }).click();
  await expect(page.locator('.detail-panel h2')).toHaveText('挨拶の系列'); await page.locator('.detail-panel').getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByRole('button', { name: '試読を始める', exact: true }).click(); await page.getByRole('button', { name: '進行規則に従って次へ', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('初めまして。');
  await page.getByRole('button', { name: 'もう一度反応を見る', exact: true }).click(); await page.getByRole('button', { name: '進行規則に従って次へ', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('また会いましたね。');
  await page.getByRole('button', { name: '一手戻る', exact: true }).click(); await page.getByRole('button', { name: '進行規則に従って次へ', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('また会いましたね。');
});

test('RB05 折りたたんだ章の未完成出口を掘り下げ、通常接続編集と再読込で集計へ反映する', async ({ page }) => {
  const p = createProject('階層の通常操作');
  const chapter = createEntity(p.projectId, 'chapter', '第一章'), scene = createEntity(p.projectId, 'scene', '会話の場面', { chapterId: chapter.id }); chapter.data.sceneIds = [scene.id];
  const line = createEntity(p.projectId, 'dialogue_line', '場面の台詞'); scene.data.dialogueLineIds = [line.id];
  const a = createEntity(p.projectId, 'flow_node', '会話の入口', { nodeType: 'entry', sceneId: scene.id }), end = createEntity(p.projectId, 'flow_node', '会話の出口', { nodeType: 'terminal', terminalReason: '終了' });
  const unfinished = createEntity(p.projectId, 'flow_edge', '未完成の接続', { fromId: a.id, toId: { unresolved: { label: '未接続', reason: '接続前' } } }); p.entities.push(chapter, scene, line, a, end, unfinished);
  await importProject(page, p); await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click(); await page.getByRole('button', { name: '章・場面・会話へ掘り下げる', exact: true }).click();
  const hierarchy = page.getByRole('region', { name: '章・場面・会話と分岐の階層図' });
  await expect(hierarchy).toContainText('未完成 1'); await expect(hierarchy.getByRole('button', { name: /台詞 · 場面の台詞/ })).toHaveCount(0);
  await page.getByRole('button', { name: '第一章を掘り下げる', exact: true }).click(); await page.getByRole('button', { name: '会話の場面を掘り下げる', exact: true }).click();
  await expect(hierarchy.getByRole('button', { name: /台詞 · 場面の台詞/ })).toBeVisible(); await hierarchy.getByRole('button', { name: '接続の出口が未完成です。', exact: true }).first().click();
  const editor = page.locator('.detail-panel'); await editor.getByLabel('行き先未定の下書き', { exact: true }).uncheck(); await editor.getByLabel('行き先ノード', { exact: true }).selectOption(end.id); await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click(); await expect(hierarchy).not.toContainText('未完成 1');
  await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click(); await page.getByRole('button', { name: '章・場面・会話へ掘り下げる', exact: true }).click(); await expect(hierarchy).not.toContainText('未完成 1');
});
