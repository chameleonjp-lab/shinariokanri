import { expect, test, type Page } from '@playwright/test';

const HARNESS = '/tests/rb04/harness.html';

async function fixtureState(page: Page) {
  return JSON.parse((await page.getByTestId('fixture-state').textContent()) || '{}') as {
    ids: { characterId: string; factionId: string; placeId: string; threadIds: string[]; chapterIds: string[]; sceneIds: string[]; eventIds: string[]; snapshotId: string };
    revision: string;
    chapterOrder: string[];
    eventTicks: string[];
    canonicalBody: string;
    publishedBody: string;
    snapshotContent: unknown;
    canonicalSceneNames: string[];
    alternativeCount: number;
    alternativeVersions: number;
    branchChapterSceneIds: string[];
    branchSceneNames: string[];
    branchSceneBodies: string[];
    commits: number;
    rollbacks: number;
    openedId: string;
    readingSnapshots: string[];
    readingTraces: Array<{ mode: string; stepCount: number; sceneIds: string[]; occurrences: Array<{ entityId: string; occurrenceId: string }> }>;
  };
}

async function openHarness(page: Page) {
  await page.goto(HARNESS);
  await expect(page.getByRole('heading', { name: /RB04 writing components/ })).toBeVisible();
  await expect(page.getByTestId('fixture-state')).not.toBeEmpty();
}

function chapterNames(page: Page) {
  return page.getByRole('region', { name: '物語の構成' }).locator('.story-lane h3').allTextContents();
}

test('章・筋・人物の見せ方が共有scene IDを保ち、回想順を世界時点と分離する', async ({ page }) => {
  await openHarness(page);
  const writer = page.getByRole('region', { name: '物語の構成' });
  let state = await fixtureState(page);
  const { sceneIds, threadIds } = state.ids;

  await writer.getByLabel('人物の変化を見る順', { exact: true }).selectOption('presentation');
  const characterLane = writer.locator('.story-lane').filter({ hasText: 'アオ' });
  const idsInArc = () => characterLane.locator('.story-lane-scenes > li').evaluateAll(rows => rows.map(row => row.getAttribute('data-scene-id')));
  await expect.poll(idsInArc).toEqual(sceneIds);
  await writer.getByLabel('人物の変化を見る順', { exact: true }).selectOption('world');
  await expect.poll(idsInArc).toEqual([sceneIds[1], sceneIds[0], sceneIds[2]]);
  await expect(characterLane).toContainText('世界時点');
  await expect(characterLane).toContainText('目的');
  await expect(characterLane).toContainText('未入力');
  await expect(characterLane).toContainText('場面に入る前');
  await expect(characterLane).toContainText('場面を終えた後');
  await expect(characterLane).toContainText('鍵の所在を突き止める');
  await expect(characterLane).toContainText('父の残した記録を確かめる。');
  await characterLane.getByRole('button', { name: '鍵の所在を突き止めるの根拠場面 回想：鍵を預けるを開く', exact: true }).click();
  await expect(page.getByTestId('opened-id')).toHaveText(sceneIds[1]!);

  await writer.getByLabel('物語の並べ方', { exact: true }).selectOption('thread');
  const promiseLane = writer.locator('.story-lane').filter({ hasText: '約束の筋' });
  const conflictLane = writer.locator('.story-lane').filter({ hasText: '門の争い' });
  const promiseOccurrence = promiseLane.locator(`li[data-scene-id="${sceneIds[0]}"]`);
  const conflictOccurrence = conflictLane.locator(`li[data-scene-id="${sceneIds[0]}"]`);
  await expect(promiseOccurrence).toHaveCount(1);
  await expect(conflictOccurrence).toHaveCount(1);
  await promiseLane.getByRole('button', { name: 'この筋から外す', exact: true }).first().click();
  await expect(promiseLane.locator(`li[data-scene-id="${sceneIds[0]}"]`)).toHaveCount(0);
  await expect(conflictLane.locator(`li[data-scene-id="${sceneIds[0]}"]`)).toHaveCount(1);
  state = await fixtureState(page);
  expect(state.canonicalSceneNames).toContain('現在：門の前');
  expect(state.eventTicks).toEqual(['-10', '10', '20']);
  expect(threadIds).toHaveLength(2);

  await writer.getByLabel('物語の並べ方', { exact: true }).selectOption('chapter');
  await expect.poll(() => chapterNames(page)).toEqual(['第一章・門の前', '第二章・帰還']);
  await writer.getByRole('button', { name: '第二章・帰還を上へ', exact: true }).click();
  await expect.poll(() => chapterNames(page)).toEqual(['第二章・帰還', '第一章・門の前']);
  state = await fixtureState(page);
  expect(state.eventTicks).toEqual(['-10', '10', '20']);
});

test('通読は章を絞り、選んだ経路を編集して再訪し実際の提示だけ記録する', async ({ page }) => {
  await openHarness(page);
  const view = page.getByRole('region', { name: '章順・選択経路の通読' });
  const state = await fixtureState(page);
  const { sceneIds } = state.ids;
  await view.getByRole('checkbox', { name: '第一章・門の前' }).uncheck();
  await expect(view.locator('.chapter-reading-sequence > li')).toHaveCount(1);
  await expect(view.locator('.chapter-reading-sequence')).toContainText('帰還：記録庫');

  await view.getByRole('button', { name: '自分で経路を作る', exact: true }).click();
  const routePicker = view.getByLabel('経路に加える場面', { exact: true });
  for (const sceneId of [sceneIds[1]!, sceneIds[2]!, sceneIds[1]!]) {
    await routePicker.selectOption(sceneId);
    await view.getByRole('button', { name: '経路の末尾に加える', exact: true }).click();
  }
  const routeIds = () => view.locator('.chapter-reading-sequence > li').evaluateAll(rows => rows.map(row => row.getAttribute('data-scene-id')));
  await expect.poll(routeIds).toEqual([sceneIds[1], sceneIds[2], sceneIds[1]]);
  await view.getByRole('button', { name: '1番目の場面を下へ', exact: true }).click();
  await expect.poll(routeIds).toEqual([sceneIds[2], sceneIds[1], sceneIds[1]]);
  await view.getByRole('button', { name: '2番目の場面を上へ', exact: true }).click();
  await expect.poll(routeIds).toEqual([sceneIds[1], sceneIds[2], sceneIds[1]]);
  await expect(view).not.toContainText('回想の読者効果。');
  await view.getByRole('button', { name: '回想：鍵を預けるを編集', exact: true }).first().click();
  await expect(page.getByTestId('opened-id')).toHaveText(sceneIds[1]!);
  await expect(view).toContainText('「忘れないで」父は告げた。');

  const publishedContent = state.snapshotContent;
  await view.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await expect(view).toContainText('0 / 3場面を実際に提示');
  await expect(view.locator('.chapter-reading-sequence')).toHaveCount(0);
  await expect(view).not.toContainText('「忘れないで」父は告げた。');
  const next = view.getByRole('button', { name: '次の場面を提示', exact: true });
  await next.click();
  await expect(view.locator('.chapter-reading-presented')).toHaveAttribute('data-presented-scene-id', sceneIds[1]!);
  await next.click();
  await expect(view.locator('.chapter-reading-presented')).toHaveAttribute('data-presented-scene-id', sceneIds[2]!);
  await next.click();
  await expect(view.locator('.chapter-reading-presented')).toHaveAttribute('data-presented-scene-id', sceneIds[1]!);
  await view.getByRole('button', { name: '一場面戻る', exact: true }).click();
  await expect(view).toContainText('2 / 3場面を実際に提示');
  await expect(view.locator('.chapter-reading-presented')).toHaveAttribute('data-presented-scene-id', sceneIds[2]!);
  await next.click();
  await expect(view).toContainText('3 / 3場面を実際に提示');

  await view.getByRole('button', { name: '開始状態と経路を保存', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).readingTraces.length).toBe(1);
  const savedRecord = (await fixtureState(page)).readingTraces[0]!;
  expect(savedRecord.mode).toBe('chapters');
  expect(savedRecord.stepCount).toBe(0);
  expect(savedRecord.sceneIds).toEqual([sceneIds[1], sceneIds[2], sceneIds[1]]);
  expect(savedRecord.occurrences.map(item => item.entityId)).toEqual([sceneIds[1], sceneIds[2], sceneIds[1]]);
  expect(new Set(savedRecord.occurrences.map(item => item.occurrenceId)).size).toBe(3);
  const afterRecord = await fixtureState(page);
  expect(afterRecord.readingSnapshots).toHaveLength(2);
  expect(afterRecord.readingSnapshots).toContain(state.ids.snapshotId);
  expect(afterRecord.snapshotContent).toEqual(publishedContent);
});

test('別案の作成・編集・版戻し・採用・取消は正本と公開snapshotを分けて保つ', async ({ page }) => {
  await openHarness(page);
  const studio = page.getByRole('region', { name: '作者別案と正本の管理' });
  const initial = await fixtureState(page);
  const originalSnapshot = initial.snapshotContent;
  const originalBody = initial.publishedBody;
  const originalSceneNames = [...initial.canonicalSceneNames];
  const { snapshotId, chapterIds, sceneIds } = initial.ids;

  await studio.getByLabel('新しい別案の名前', { exact: true }).fill('公開版からの別展開');
  await studio.getByLabel('別案の分岐元', { exact: true }).selectOption(snapshotId);
  await studio.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  await expect(studio.getByLabel('編集する作者別案')).toContainText('公開版からの別展開');
  await studio.getByLabel('別案内の編集対象', { exact: true }).selectOption(sceneIds[0]!);
  const branchBody = studio.getByLabel('別案内の場面本文', { exact: true });
  await expect(branchBody).toBeVisible();
  await branchBody.fill('作業中の試作本文。');
  await studio.getByLabel('別案の版名', { exact: true }).fill('試作本文を保存');
  await studio.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect(studio).toContainText('保存済み 2版');
  await studio.getByRole('button', { name: 'この版を現在に戻す', exact: true }).click();
  await studio.getByLabel('別案内の編集対象', { exact: true }).selectOption(sceneIds[0]!);
  await expect(studio.getByLabel('別案内の場面本文', { exact: true })).toHaveValue(originalBody);
  await expect.poll(async () => (await fixtureState(page)).alternativeVersions).toBe(3);

  await studio.getByLabel('新しい場面を加える章', { exact: true }).selectOption(chapterIds[0]!);
  await studio.getByRole('button', { name: '別案の場面を作る', exact: true }).click();
  await studio.getByLabel('別案内の情報名', { exact: true }).fill('鍵を渡さない別案');
  await studio.getByLabel('別案内の場面要約', { exact: true }).fill('門番は鍵を預けない。');
  await studio.getByLabel('別案内の場面本文', { exact: true }).fill('門は閉じたまま、二人は川を渡る。');
  await studio.getByLabel('別案の版名', { exact: true }).fill('別の場面を追加');
  await studio.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).alternativeVersions).toBe(4);

  const sceneAddition = studio.locator('.alternative-diff-row').filter({ hasText: '鍵を渡さない別案 · 情報全体' });
  const presentationChange = studio.locator('.alternative-diff-row').filter({ hasText: '章と場面の提示順' });
  await sceneAddition.locator('input[type=checkbox]').check();
  await presentationChange.locator('input[type=checkbox]').check();
  await studio.getByRole('button', { name: '選択した変更を正本へ採用', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commits).toBe(1);
  let afterApply = await fixtureState(page);
  expect(afterApply.canonicalSceneNames).toContain('鍵を渡さない別案');
  expect(afterApply.snapshotContent).toEqual(originalSnapshot);
  expect(afterApply.publishedBody).toBe(originalBody);
  expect(afterApply.eventTicks).toEqual(['-10', '10', '20']);
  expect(afterApply.alternativeCount).toBe(1);

  await page.getByRole('button', { name: 'テストホスト：採用を取り消す', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).rollbacks).toBe(1);
  const afterRollback = await fixtureState(page);
  expect(afterRollback.canonicalSceneNames).toEqual(originalSceneNames);
  expect(afterRollback.snapshotContent).toEqual(originalSnapshot);
  expect(afterRollback.publishedBody).toBe(originalBody);
  expect(afterRollback.eventTicks).toEqual(['-10', '10', '20']);
});

test('構成プレビューは取消では本文順を変えず、適用後の別案版だけに順序を保存する', async ({ page }) => {
  await openHarness(page);
  const studio = page.getByRole('region', { name: '作者別案と正本の管理' });
  const state = await fixtureState(page);
  const originalOrder = [state.ids.sceneIds[0]!, state.ids.sceneIds[1]!];
  await studio.getByLabel('新しい別案の名前', { exact: true }).fill('構成を試す案');
  await studio.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  await expect(studio.getByLabel('構成雛形', { exact: true })).toBeVisible();
  await studio.getByLabel('構成雛形', { exact: true }).selectOption({ label: '三部構成' });
  await studio.getByLabel('導入に置く場面', { exact: true }).selectOption(state.ids.sceneIds[1]!);
  await studio.getByLabel('展開に置く場面', { exact: true }).selectOption(state.ids.sceneIds[0]!);
  await studio.getByRole('button', { name: '順序の差分を確認', exact: true }).click();
  let preview = studio.getByRole('region', { name: '構成順の差分' });
  await expect(preview).toContainText('回想：鍵を預ける → 現在：門の前');
  await preview.getByRole('button', { name: '取消', exact: true }).click();
  await expect(studio.getByRole('region', { name: '構成順の差分' })).toHaveCount(0);
  await studio.getByLabel('別案の版名', { exact: true }).fill('取消後の確認');
  await studio.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).branchChapterSceneIds).toEqual(originalOrder);

  await studio.getByRole('button', { name: '順序の差分を確認', exact: true }).click();
  preview = studio.getByRole('region', { name: '構成順の差分' });
  await preview.getByRole('button', { name: '別案の下書きへ適用', exact: true }).click();
  await studio.getByLabel('別案の版名', { exact: true }).fill('適用した構成順');
  await studio.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).branchChapterSceneIds).toEqual([state.ids.sceneIds[1], state.ids.sceneIds[0]]);
  const saved = await fixtureState(page);
  expect(saved.snapshotContent).toEqual(state.snapshotContent);
  expect(saved.eventTicks).toEqual(['-10', '10', '20']);
});
