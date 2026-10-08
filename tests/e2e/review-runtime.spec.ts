import { test, expect, type Page } from '@playwright/test';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';

async function navigate(page: Page, label: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: label }).first().click();
}
async function importProject(page: Page, project: ProjectData) {
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'review.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
}
async function settings(page: Page) {
  await navigate(page, /^作品・保存$/); await page.getByRole('tab', { name: '作品の設定', exact: true }).click();
}

test('RV08 作品設定の未保存入力と不正暦入力を画面移動から再開し、設定を原子保存・再読込する', async ({ page }) => {
  const p = createProject('設定の通常操作'); p.entities.push(createEntity(p.projectId, 'event', '絶対日時を保持', { time: { mode: 'instant', calendarId: p.calendarId, at: '9007199254740993' } }));
  await page.goto('./'); await importProject(page, p); await settings(page);
  await page.getByLabel('作品名', { exact: true }).fill('未保存の作品設定😀'); await page.getByLabel('本編開始の世界内tick', { exact: true }).fill('-9007199254740993');
  await page.getByLabel('確定版の名称', { exact: true }).fill('次に確定する版');
  await navigate(page, /^資料/); await expect(page.getByRole('button', { name: '1件の未保存入力', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1件の未保存入力', exact: true }).click(); await page.getByRole('button', { name: /作品設定の入力へ戻る/ }).click();
  await expect(page.getByLabel('作品名', { exact: true })).toHaveValue('未保存の作品設定😀'); await expect(page.getByLabel('本編開始の世界内tick', { exact: true })).toHaveValue('-9007199254740993');
  await page.getByRole('button', { name: '作品の設定を保存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '作品の設定を端末内に保存しました' })).toBeVisible();
  await page.getByRole('button', { name: '現在の内容を確定版として保存', exact: true }).click(); await expect(page.getByLabel('確定版の名称', { exact: true })).toHaveValue('');
  await page.reload(); await settings(page); await expect(page.getByLabel('作品名', { exact: true })).toHaveValue('未保存の作品設定😀');
  await expect(page.getByLabel('本編開始の世界内tick', { exact: true })).toHaveValue('-9007199254740993');
  await page.locator('summary').filter({ hasText: '暦の定義を編集' }).click(); const raw = page.getByLabel('暦の定義', { exact: true }); await raw.fill('{未完😀');
  await navigate(page, /^資料/); await settings(page); await page.locator('summary').filter({ hasText: '暦の定義を編集' }).click();
  await expect(raw).toHaveValue('{未完😀'); await expect(page.getByRole('button', { name: '作品の設定を保存', exact: true })).toBeDisabled();
});

test('RV05/RV06 旧版の入口と固定リンクを通常画面で開き、経路保存・再読込・再実行する', async ({ page }) => {
  let p = createProject('旧版試読の通常操作'); const note = createEntity(p.projectId, 'note', '旧い参照本文', { body: textToRichText('😀門の引用') }); p.entities.push(note);
  p = await createWorldSnapshot(p, '引用版'); const citation = p.snapshots[0]!;
  const scene = createEntity(p.projectId, 'scene', '旧版の場面', { body: [{ id: newId(), kind: 'paragraph', text: '😀門へ進む', links: [{ start: 1, end: 2, target: { entityId: note.id, sourceVersionId: citation.id, blockId: note.data.body[0]!.id, start: 1, end: 2 } }] }] });
  const a = createEntity(p.projectId, 'flow_node', '旧版入口', { nodeType: 'entry', executionPolicy: 'first_match', sceneId: scene.id });
  const b = createEntity(p.projectId, 'flow_node', '旧版終端', { nodeType: 'terminal', terminalReason: '完了' }); const edge = createEntity(p.projectId, 'flow_edge', '旧版進行', { fromId: a.id, toId: b.id, edgeType: 'automatic', priority: 0 });
  p.entities.push(scene, a, b, edge); p = await createWorldSnapshot(p, '入口を含む旧版'); const edition = p.snapshots.at(-1)!;
  for (const e of p.entities.filter(e => e.kind === 'flow_node' || e.kind === 'flow_edge')) { e.deletedAt = '2026-10-08T00:00:00.000Z'; e.deletionOperationId = newId(); }
  note.data.body[0]!.text = '現在の違う本文';
  await page.goto('./'); await importProject(page, p); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await expect(page.getByRole('button', { name: '試読を始める', exact: true })).toBeDisabled();
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(edition.id); await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('旧版の場面'); await page.getByRole('button', { name: '門', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '固定版の参照先' }); await expect(dialog).toContainText('😀門の引用'); await expect(dialog.locator('mark')).toHaveText('門');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('旧版の場面');
  await page.getByRole('button', { name: '進行規則に従って次へ', exact: true }).click(); await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
  await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByRole('button', { name: /試読経路.*再実行して状態を比較/ }).click(); await expect(page.locator('.reader-sheet')).toContainText('旧版終端');
  await page.getByRole('button', { name: '一手戻る', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('旧版の場面');
});

test('RB05 相互排他を金額・物品と原子拒否し、二入口の台詞・経路を再読込して合流比較する', async ({ page }) => {
  const p = createProject('状態と回帰経路の通常操作');
  const x = createEntity(p.projectId, 'variable', '所属A', { key: 'member_a', scope: 'across_runs', initial: { type: 'boolean', value: false } });
  const y = createEntity(p.projectId, 'variable', '所属B', { key: 'member_b', scope: 'across_runs', initial: { type: 'boolean', value: false } });
  x.data.exclusions = [{ variableId: y.id, value: { type: 'boolean', value: true }, otherValue: { type: 'boolean', value: true }, reason: '二重所属は禁止' }];
  const money = createEntity(p.projectId, 'variable', '所持金', { key: 'money', scope: 'across_runs', valueType: 'integer', allowed: { min: 0, max: 100 }, initial: { type: 'integer', value: 10 } });
  const item = createEntity(p.projectId, 'item', '拒否時に受け取らない物品');
  const line = createEntity(p.projectId, 'dialogue_line', '入口の台詞', { text: textToRichText('😀ここで所属を選びます。') });
  const scene = createEntity(p.projectId, 'scene', '入口の場面', { body: textToRichText('所属を選ぶ場面'), dialogueLineIds: [line.id] });
  const a = createEntity(p.projectId, 'flow_node', '入口A', { nodeType: 'entry', sceneId: scene.id });
  const b = createEntity(p.projectId, 'flow_node', '入口B', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '共通の合流点', { nodeType: 'terminal', terminalReason: '所属を選んで終了' });
  const setX = createEntity(p.projectId, 'effect', 'A所属へ', { operation: 'set', targetId: x.id, value: { type: 'boolean', value: true } });
  const setY = createEntity(p.projectId, 'effect', 'B所属へ', { operation: 'set', targetId: y.id, value: { type: 'boolean', value: true } });
  const spend = createEntity(p.projectId, 'effect', '金額を変更', { operation: 'set', targetId: money.id, value: { type: 'integer', value: 5 } });
  const grant = createEntity(p.projectId, 'effect', '物品を取得', { operation: 'grant', targetId: item.id, value: { type: 'integer', value: 1 } });
  const illegal = createEntity(p.projectId, 'flow_edge', '両方へ所属する', { fromId: a.id, toId: end.id, edgeType: 'choice', label: '両方へ所属する', effectIds: [spend.id, grant.id, setX.id, setY.id] });
  const left = createEntity(p.projectId, 'flow_edge', 'Aへ所属する', { fromId: a.id, toId: end.id, edgeType: 'choice', label: 'Aへ所属する', effectIds: [setX.id] });
  const right = createEntity(p.projectId, 'flow_edge', 'Bへ所属する', { fromId: b.id, toId: end.id, edgeType: 'choice', label: 'Bへ所属する', effectIds: [setY.id] });
  const graph = createEntity(p.projectId, 'flow_graph', '二つの入口', { nodeIds: [a.id, b.id, end.id], edgeIds: [illegal.id, left.id, right.id], entryIds: [a.id, b.id], exitIds: [end.id] });
  p.entities.push(x, y, money, item, line, scene, a, b, end, setX, setY, spend, grant, illegal, left, right, graph);
  await page.goto('./'); await importProject(page, p); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(a.id); await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('😀ここで所属を選びます。');
  await page.getByRole('button', { name: '両方へ所属する', exact: true }).click();
  await expect(page.locator('.reader-issue')).toContainText('二重所属は禁止');
  await expect(page.locator('.runtime-variable').filter({ hasText: '所持金' })).toContainText('10');
  await expect(page.locator('.reader-state-counts')).toContainText('0個');
  await expect(page.locator('.reader-sheet h2')).toHaveText('入口の場面');
  await page.getByRole('button', { name: 'Aへ所属する', exact: true }).click();
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(''); await page.getByLabel('試読の開始点', { exact: true }).selectOption(b.id);
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click(); await page.getByRole('button', { name: 'Bへ所属する', exact: true }).click();
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.locator('.regression-paths input[type=checkbox]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '選んだ二経路を再生して比較', exact: true })).toBeDisabled();
  await page.locator('.regression-paths input[type=checkbox]').nth(0).check(); await page.locator('.regression-paths input[type=checkbox]').nth(1).check();
  await page.getByRole('button', { name: '選んだ二経路を再生して比較', exact: true }).click();
  await expect(page.locator('.regression-paths')).toContainText('同じ合流点の状態');
  await expect(page.locator('.regression-paths')).toContainText(`variableValues.${x.id}`);
  await page.getByRole('button', { name: '選んだ経路を回帰集合へ保存', exact: true }).click(); await expect(page.locator('.regression-paths')).toContainText('宣言経路 2件');
  await page.reload(); await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await expect(page.locator('.regression-paths')).toContainText('宣言経路 2件');
  await page.getByRole('button', { name: /試読経路.*再実行して状態を比較/ }).first().click();
  await expect(page.locator('.reader-sheet h2')).toHaveText('共通の合流点');
});
