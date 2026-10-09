import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { projectContent } from '../../src/domain/writingWorkspace';
import { exportScenario, inspectScenario } from '../../src/storage/archive';
import { jsonBytes, sha256 } from '../../src/storage/json';
import type { ProjectData } from '../../src/domain/types';

async function importProject(page: Page, project: ProjectData) {
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'writing.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
}
async function writing(page: Page, tab: string) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: /^構成/ }).first().click();
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function fixture() {
  const project = createProject('執筆と固定版の実画面');
  const chapter = createEntity(project.projectId, 'chapter', '第一章');
  const scene = createEntity(project.projectId, 'scene', '門の場面', { chapterId: chapter.id, body: textToRichText('固定版の本文😀門') });
  chapter.data.sceneIds = [scene.id]; project.entities = [chapter, scene];
  const content = projectContent(project);
  project.snapshots = [{ id: newId(), content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: '執筆前の固定版' }];
  scene.data.body = textToRichText('現在の本文😀門');
  return { project, scene };
}

test('作者別案の未保存入力を画面移動から保持し、版保存・再読込・完全保存へ接続する', async ({ page }) => {
  const { project, scene } = await fixture();
  await page.goto('./'); await importProject(page, project);
  await writing(page, '作者別案');
  await page.getByLabel('新しい別案の名前', { exact: true }).fill('門を閉じる案');
  await page.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  await expect(page.getByLabel('編集する作者別案')).toHaveValue(/.+/);
  await page.getByLabel('別案内の編集対象').selectOption(scene.id);
  const body = page.getByLabel('別案内の場面本文', { exact: true });
  await body.fill('未保存の別案😀門');
  await page.getByRole('tab', { name: '章・本文', exact: true }).click();
  await page.getByRole('tab', { name: '作者別案', exact: true }).click();
  await expect(body).toHaveValue('未保存の別案😀門');
  await page.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect(page.getByText('保存済み 2版', { exact: true })).toBeVisible();
  await page.reload(); await writing(page, '作者別案');
  await page.getByLabel('別案内の編集対象').selectOption(scene.id);
  await expect(body).toHaveValue('未保存の別案😀門');
  await page.getByText('保存済みの別案を章順で試読', { exact: true }).click();
  await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await page.getByRole('button', { name: '次の場面を提示', exact: true }).click();
  await expect(page.locator('.chapter-reading-presented')).toContainText('未保存の別案😀門');
  const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: /^作品・保存/ }).first().click();
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await pending;
  const archiveBytes = await readFile((await download.path())!);
  const prepared = await inspectScenario(new Uint8Array(archiveBytes), { worker: false });
  expect(prepared.project.authorAlternatives).toHaveLength(1);
  const alternative = prepared.project.authorAlternatives![0]!;
  expect(alternative.versions).toHaveLength(2);
  expect(alternative.versions.at(-1)!.content.entities.find(entity => entity.id === scene.id)?.data).toMatchObject({ body: [{ text: '未保存の別案😀門' }] });
  expect(prepared.project.entities.find(entity => entity.id === scene.id)?.data).toMatchObject({ body: [{ text: '現在の本文😀門' }] });
  expect(prepared.project.snapshots[0]!.content.entities.find(entity => entity.id === scene.id)?.data).toMatchObject({ body: [{ text: '固定版の本文😀門' }] });
  await page.locator('.project-switch').click();
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'writing-clone.scenario', mimeType: 'application/octet-stream', buffer: archiveBytes });
  await page.getByLabel('復元方法', { exact: true }).selectOption('clone');
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await writing(page, '作者別案');
  const clonedSceneId = await page.getByLabel('別案内の編集対象').locator('option').filter({ hasText: '門の場面' }).getAttribute('value');
  expect(clonedSceneId).toBeTruthy(); expect(clonedSceneId).not.toBe(scene.id);
  await page.getByLabel('別案内の編集対象').selectOption(clonedSceneId!);
  await expect(body).toHaveValue('未保存の別案😀門');
  await page.reload(); await writing(page, '作者別案');
  await page.getByLabel('別案内の編集対象').selectOption(clonedSceneId!);
  await expect(body).toHaveValue('未保存の別案😀門');
  const cloneMenu = page.getByRole('button', { name: 'メニューを開く' }); if (await cloneMenu.isVisible()) await cloneMenu.click();
  await page.getByRole('button', { name: /^作品・保存/ }).first().click();
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const clonePending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const cloneDownload = await clonePending;
  const clone = await inspectScenario(new Uint8Array(await readFile((await cloneDownload.path())!)), { worker: false });
  expect(clone.project.projectId).not.toBe(project.projectId);
  expect(clone.project.authorAlternatives![0]!.versions).toHaveLength(2);
  expect(clone.project.entities.find(entity => entity.id === clonedSceneId)?.data).toMatchObject({ body: [{ text: '現在の本文😀門' }] });

});

test('章試読は固定版の本文を提示して開始状態と経路を通常保存する', async ({ page }) => {
  const { project } = await fixture();
  await page.goto('./'); await importProject(page, project);
  await writing(page, '章の試読');
  await page.getByLabel('読む作品の版', { exact: true }).selectOption(project.snapshots[0]!.id);
  await expect(page.locator('.reading-body')).toContainText('固定版の本文😀門');
  await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await page.getByRole('button', { name: '次の場面を提示', exact: true }).click();
  await expect(page.locator('.chapter-reading-presented')).toContainText('固定版の本文😀門');
  await page.getByRole('button', { name: '開始状態と経路を保存', exact: true }).click();
  await expect(page.getByText('開始状態と実際に提示した場面を保存しました。', { exact: true })).toBeVisible();
  await page.reload();
  // Reload succeeds only when durable chapter records and their captured snapshot validate together.
  await writing(page, '章の試読');
  await expect(page.getByLabel('読む作品の版', { exact: true }).locator('option')).toHaveCount(3);
  await page.getByRole('region', { name: '保存した章読み通しの再開', exact: true }).getByRole('button', { name: /章読み通し経路/ }).click();
  await expect(page.getByText('保存した章読み通しを再実行し、提示順と状態を検証しました。', { exact: true })).toBeVisible();
  await expect(page.locator('.chapter-reading-presented')).toContainText('固定版の本文😀門');
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await expect(page.locator('.saved-traces')).toHaveCount(0);
});

test('参照値を変えた別案の採用を通常保存し、確認依頼と採用記録を再読込・完全保存する', async ({ page }) => {
  const { project, scene } = await fixture();
  const first = createEntity(project.projectId, 'character', '元の視点人物');
  const second = createEntity(project.projectId, 'character', '別案の視点人物');
  project.entities.push(first, second); scene.data.povId = first.id;
  await page.goto('./'); await importProject(page, project);
  await writing(page, '作者別案');
  await page.getByLabel('新しい別案の名前', { exact: true }).fill('視点を変える案');
  await page.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  await page.getByLabel('別案内の編集対象').selectOption(scene.id);
  await page.getByLabel('視点人物', { exact: true }).selectOption(second.id);
  await page.getByLabel('別案内の場面本文', { exact: true }).fill('採用した視点の本文😀');
  await page.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect(page.getByText('保存済み 2版', { exact: true })).toBeVisible();
  const changes = page.locator('.alternative-diff-list input[type=checkbox]');
  for (const change of await changes.all()) await change.check();
  await page.getByRole('button', { name: '選択した変更を正本へ採用', exact: true }).click();
  await expect(page.getByText(/正本へ採用した記録 1件/)).toBeVisible();
  await page.reload(); await writing(page, '作者別案');
  await expect(page.getByText(/正本へ採用した記録 1件/)).toBeVisible();
  const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: /^作品・保存/ }).first().click();
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await pending;
  const prepared = await inspectScenario(new Uint8Array(await readFile((await download.path())!)), { worker: false });
  expect(prepared.project.entities.find(entity => entity.id === scene.id)?.data).toMatchObject({ povId: second.id, body: [{ text: '採用した視点の本文😀' }] });
  expect(prepared.project.authorAlternatives![0]!.applyReceipts).toHaveLength(1);
  expect(prepared.project.entities.some(entity => entity.kind === 'review' && !entity.deletedAt)).toBe(true);
});

test('章と場面の順序・所属・筋の変更を通常保存して再読込する', async ({ page }) => {
  const { project, scene } = await fixture();
  const chapter = project.entities.find(entity => entity.kind === 'chapter')!;
  const nextChapter = createEntity(project.projectId, 'chapter', '第二章');
  const nextScene = createEntity(project.projectId, 'scene', '次の場面', { chapterId: chapter.id });
  const thread = createEntity(project.projectId, 'group', '門の筋', { groupType: 'plot_thread' });
  (chapter.data as { sceneIds: string[] }).sceneIds.push(nextScene.id);
  scene.data.threadIds = [thread.id]; project.entities.push(nextChapter, nextScene, thread);
  await page.goto('./'); await importProject(page, project);
  await writing(page, '章・本文');
  const workspace = page.getByRole('region', { name: '物語の構成', exact: true });
  await workspace.getByLabel('物語の並べ方', { exact: true }).selectOption('chapter');
  await workspace.getByLabel('第一章を下へ', { exact: true }).click();
  await expect(workspace.locator('.story-lane').first()).toHaveAttribute('data-lane-id', nextChapter.id);
  await workspace.locator(`[data-scene-id="${scene.id}"]`).getByRole('button', { name: '後へ', exact: true }).click();
  await expect(workspace.locator(`[data-lane-id="${chapter.id}"] [data-scene-id]`).first()).toHaveAttribute('data-scene-id', nextScene.id);
  await workspace.getByLabel('門の場面の移動先の章', { exact: true }).selectOption(nextChapter.id);
  await expect(workspace.locator(`[data-lane-id="${nextChapter.id}"] [data-scene-id="${scene.id}"]`)).toBeVisible();
  await workspace.getByLabel('物語の並べ方', { exact: true }).selectOption('thread');
  await workspace.locator(`[data-lane-id="${thread.id}"] [data-scene-id="${scene.id}"]`).getByRole('button', { name: 'この筋から外す', exact: true }).click();
  await expect(workspace.locator(`[data-lane-id="${thread.id}"] [data-scene-id="${scene.id}"]`)).toHaveCount(0);
  await page.reload(); await writing(page, '章・本文');
  await workspace.getByLabel('物語の並べ方', { exact: true }).selectOption('chapter');
  await expect(workspace.locator('.story-lane').first()).toHaveAttribute('data-lane-id', nextChapter.id);
  await expect(workspace.locator(`[data-lane-id="${nextChapter.id}"] [data-scene-id="${scene.id}"]`)).toBeVisible();
  await workspace.getByLabel('物語の並べ方', { exact: true }).selectOption('thread');
  await expect(workspace.locator(`[data-lane-id="${thread.id}"] [data-scene-id="${scene.id}"]`)).toHaveCount(0);
});
