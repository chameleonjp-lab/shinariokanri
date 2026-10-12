import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { exportScenario, inspectScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// This independent F33 entrance covers a local deleted resume link and device
// classes in one browser. Physical smartphone/other-device acceptance remains
// not_run; viewport switching is not evidence of cross-device synchronization.
test.setTimeout(180_000);

async function graph(page: Page) {
  await navigate(page, /^年表/);
  await page.getByRole('tab', { name: '関係表・図', exact: true }).click();
  await page.getByRole('button', { name: '関係図', exact: true }).click();
  await page.getByLabel('中心にする情報', { exact: true }).selectOption('');
}
async function marks(page: Page) {
  const panel = page.locator('details.navigation-marks');
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  return panel;
}
async function readMarks(page: Page, projectId: string) {
  return page.evaluate(id => {
    const key = Object.keys(localStorage).find(candidate => candidate.startsWith('scenario-workspace-marks:v1:') && candidate.endsWith(`:${encodeURIComponent(id)}`));
    if (!key) throw new Error('The normal UI did not save navigation marks');
    return JSON.parse(localStorage.getItem(key)!);
  }, projectId);
}

test('AT-F33 ローカル補助: お気に入り・最近開いた削除済み場面を説明付き履歴へ移し、coldと履歴取消で同じ本文ID・表示設定を保つ', async ({ page }, info) => {
  const p = createProject('AT-F33 削除済み再開リンク');
  const sceneBody = textToRichText('再開する同じ場面🌸。削除と復元でも段落IDを保つ。');
  const scene = createEntity(p.projectId, 'scene', '削除後に再開する場面', { body: sceneBody });
  const other = createEntity(p.projectId, 'scene', '先に登録した場面', { body: textToRichText('もう一件の順序を保持する。') });
  const a = createEntity(p.projectId, 'character', '再開配置A'), b = createEntity(p.projectId, 'character', '再開配置B');
  p.entities.push(scene, other, a, b); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  p.relations.push({ id: newId(), projectId: p.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F33-local-recovery', bytes, { localScopeOnly: true, sceneId: scene.id, sourceBlockIds: sceneBody.map(block => block.id), secondSceneId: other.id, graphIds: [a.id, b.id], actualSmartphoneAndOtherDevice: 'not_run' });
  await page.setViewportSize({ width: 1440, height: 1000 }); await seed(page, bytes);
  const originalNative = await authorFingerprint(page);
  await graph(page);
  const node = page.getByRole('button', { name: `${a.name}を選択。矢印キーで配置を移動、Enterで詳細`, exact: true });
  await node.click(); await page.getByLabel('選択した項目の横位置', { exact: true }).fill('400');
  await page.getByLabel('選択した項目の縦位置', { exact: true }).fill('240');
  await page.getByRole('button', { name: '座標を適用', exact: true }).click();
  const zoom = page.getByLabel('関係図の拡大率', { exact: true });
  await zoom.press('End'); await zoom.press('ArrowLeft'); await zoom.press('ArrowLeft');
  await expect(node.locator('text')).toHaveAttribute('x', '400');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('関係図の拡大率', { exact: true })).toHaveValue('1');
  await node.click(); await page.getByLabel('選択した項目の横位置', { exact: true }).fill('220');
  await page.getByLabel('選択した項目の縦位置', { exact: true }).fill('160');
  await page.getByRole('button', { name: '座標を適用', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(node.locator('text')).toHaveAttribute('x', '400');
  await expect(page.getByLabel('関係図の拡大率', { exact: true })).toHaveValue('1.5');
  expect(await authorFingerprint(page)).toBe(originalNative);
  for (const target of [other, scene]) {
    await openEntity(page, 'scene', target.name); const panel = await marks(page);
    await panel.getByRole('button', { name: 'お気に入りに登録', exact: true }).click();
  }
  const savedMarks = await readMarks(page, p.projectId);
  expect(savedMarks).toEqual({ favoriteIds: [other.id, scene.id], recentIds: [scene.id, other.id] });
  await page.locator('.editor-footer').getByRole('button', { name: 'アーカイブ', exact: true }).click();
  await page.getByRole('dialog', { name: 'アーカイブの確認', exact: true }).getByRole('button', { name: 'アーカイブする', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'アーカイブの確認', exact: true })).toHaveCount(0);
  await page.reload(); const panel = await marks(page);
  expect(await readMarks(page, p.projectId)).toEqual(savedMarks);
  const afterArchiveNative = await authorFingerprint(page);
  for (const title of ['お気に入り', '最近開いた情報']) {
    const section = panel.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const stale = section.locator('.navigation-mark-stale');
    await expect(stale).toContainText(scene.name); await expect(stale).toContainText('アーカイブ済み');
    await expect(stale).toContainText('変更履歴で元の情報と復元方法を確認できます');
    await stale.getByRole('button', { name: `${scene.name} の履歴・復元案内を開く`, exact: true }).click();
    await expect(page.getByRole('tab', { name: '変更履歴', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.history-page')).toBeVisible();
    await expect(page.locator('.history-page')).toContainText('アーカイブ済みの情報');
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    expect(await readMarks(page, p.projectId)).toEqual(savedMarks);
    expect(await authorFingerprint(page)).toBe(afterArchiveNative);
  }
  await page.locator('.history-page').getByRole('button', { name: 'この変更を取り消す', exact: true }).click();
  await expect(page.locator('.history-page').getByRole('status').filter({ hasText: '復元' })).toBeVisible();
  await page.reload(); const restoredPanel = await marks(page);
  await expect(restoredPanel.locator('.navigation-mark-stale')).toHaveCount(0);
  expect(await readMarks(page, p.projectId)).toEqual(savedMarks);
  const favorite = restoredPanel.locator('section').filter({ has: page.getByRole('heading', { name: 'お気に入り', exact: true }) });
  await favorite.getByRole('button', { name: `${scene.name} 場面`, exact: true }).click();
  await page.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true }).click();
  await expect(page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true })).toHaveValue(sceneBody[0].text);
  const saved = await backup(page), retained = saved.project.entities.find(entity => entity.id === scene.id);
  expect(retained?.deletedAt).toBeFalsy(); expect(retained?.data).toEqual(scene.data);
  expect(saved.project.entities.map(entity => entity.id).sort()).toEqual(p.entities.map(entity => entity.id).sort());
  expect(saved.project.relations).toEqual(p.relations);
  expect(saved.project.history.filter(command => command.compensatesOperationId)).toHaveLength(1);
  await graph(page); await expect(node.locator('text')).toHaveAttribute('x', '400');
  await expect(page.getByLabel('関係図の拡大率', { exact: true })).toHaveValue('1.5');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(node.locator('text')).toHaveAttribute('x', '220');
  await expect(page.getByLabel('関係図の拡大率', { exact: true })).toHaveValue('1');
  await attachObservation(info, 'AT-F33-local-recovery-observed', { sceneId: scene.id, sourceBlockIds: sceneBody.map(block => block.id), savedMarks, recoveryGuidanceFromBothLists: true, guidanceDoesNotRestoreOrChangeAuthorData: true, undoRestoredSameEntityAndBlockIds: true, sameBrowserDesktop: { x: 400, zoom: 1.5 }, sameBrowserPhoneClass: { x: 220, zoom: 1 }, physicalSmartphoneAndOtherDevice: 'not_run', revision: saved.project.revision });
});

test('CP08 AT-F33 ローカル補助: 変更前へ復元して実際に欠けたIDを両再開一覧から説明し、元履歴を完全保存する', async ({ page }, info) => {
  const bytes = new Uint8Array(await readFile('tests/fixtures/rb06-history.scenario'));
  const original = (await inspectScenario(bytes, { worker: false })).project;
  const first = original.history[0], scene = original.entities.find(entity => entity.kind === 'scene')!;
  expect(first.before.entities.some(entity => entity.id === scene.id)).toBe(false);
  await attachGiven(info, 'AT-F33-missing-native-local', bytes, { projectId: original.projectId, missingEntityId: scene.id, firstOperationId: first.operationId, localScopeOnly: true });
  await seed(page, bytes);
  await openEntity(page, 'scene', scene.name);
  await (await marks(page)).getByRole('button', { name: 'お気に入りに登録', exact: true }).click();
  const savedMarks = await readMarks(page, original.projectId);
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '変更履歴', exact: true }).click();
  const history = page.locator('.history-page');
  await history.getByLabel('履歴を検索', { exact: true }).fill(first.operationId);
  await history.getByRole('button', { name: /原作品を保存 · 版 1/ }).click();
  await history.getByLabel('復元する時点', { exact: true }).selectOption('before');
  await history.getByRole('button', { name: '作品全体の復元差分を確認', exact: true }).click();
  await history.getByRole('button', { name: '確認した作品全体へ復元', exact: true }).click();
  await expect(history.getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
  await page.reload();
  const beforeGuidance = await authorFingerprint(page);
  for (const title of ['お気に入り', '最近開いた情報']) {
    const section = (await marks(page)).locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const stale = section.locator('.navigation-mark-stale').filter({ hasText: scene.id });
    await expect(stale).toContainText('対象が見つかりません');
    await expect(stale).toContainText('変更履歴または完全保存ファイルからの復元を確認してください');
    await stale.getByRole('button', { name: `対象 ${scene.id} の履歴・復元案内を開く`, exact: true }).click();
    await expect(page.getByRole('tab', { name: '変更履歴', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(history).toBeVisible();
    expect(await readMarks(page, original.projectId)).toEqual(savedMarks);
    expect(await authorFingerprint(page)).toBe(beforeGuidance);
  }
  const exported = await backup(page);
  expect(exported.project.entities.some(entity => entity.id === scene.id)).toBe(false);
  expect(exported.project.history.slice(0, original.history.length)).toEqual(original.history);
  expect(exported.project.history).toHaveLength(original.history.length + 1);
  await page.reload();
  const cold = await backup(page);
  expect(cold.project).toEqual(exported.project);
  expect(cold.worlds).toEqual(exported.worlds);
  expect(cold.assets).toEqual(exported.assets);
  await attachObservation(info, 'AT-F33-missing-native-local-observed', { projectId: original.projectId, missingEntityId: scene.id, savedMarks, bothListsExplainAndKeepAuthorData: true, originalHistoryIds: original.history.map(command => command.operationId), finalHistoryIds: cold.project.history.map(command => command.operationId), physicalDeviceAndTwoDeviceSync: 'not_run' });
});
