import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { ENTITY_KINDS, getEntitiesByKind } from '../../src/domain/model';
import { inspectScenario, type ScenarioManifest } from '../../src/storage/archive';
import { sha256 } from '../../src/storage/json';

async function openMenu(page: Page) {
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible() && !(await page.locator('.sidebar').evaluate(node => node.classList.contains('sidebar-open')))) await menu.click();
}

async function navigate(page: Page, name: RegExp) {
  await expect(page.locator('.app-shell')).toBeVisible();
  await openMenu(page);
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}

async function downloadCompleteBackup(page: Page) {
  await navigate(page, /^作品・保存$/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return new Uint8Array(await readFile((await download.path())!));
}

async function completeBackup(page: Page) {
  return inspectScenario(await downloadCompleteBackup(page), { worker: false });
}

async function expectBackupUnchanged(page: Page, expected: ScenarioManifest) {
  const files = unzipSync(await downloadCompleteBackup(page));
  const actual = JSON.parse(strFromU8(files['manifest.json'])) as ScenarioManifest;
  const stable = ({ snapshotId: _snapshot, exportedAt: _date, ...manifest }: ScenarioManifest) => ({
    ...manifest, files: [...manifest.files].sort((a, b) => a.path.localeCompare(b.path)),
  });
  expect(stable(actual)).toEqual(stable(expected));
  expect(Number.isFinite(Date.parse(actual.exportedAt))).toBe(true);
  expect(actual.snapshotId).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  expect(Object.keys(files).sort()).toEqual(['manifest.json', ...expected.files.map(file => file.path)].sort());
  // Identical payload bytes have the same validity as the fully inspected original.
  // Compare every project, recovery, world and asset file without retaining another decoded graph.
  for (const file of expected.files) {
    expect(files[file.path].byteLength, file.path).toBe(file.byteSize);
    expect(await sha256(files[file.path]), file.path).toBe(file.sha256);
  }
}

test('トップのマニュアルを検索・目次移動し、AIへ渡せる全文を保存できる', async ({ page, request }) => {
  await page.goto('./');
  await page.locator('.library-header').getByRole('button', { name: '人間向けマニュアル', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '使い方マニュアル', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: '人間向けマニュアル' })).toHaveAttribute('aria-selected', 'true');
  const allSections = await dialog.locator('.manual-sections > section').count();
  expect(allSections).toBeGreaterThan(10);
  await dialog.getByRole('searchbox', { name: 'マニュアルを検索', exact: true }).fill('伏線');
  const matches = dialog.locator('.manual-sections > section');
  expect(await matches.count()).toBeGreaterThan(0);
  expect(await matches.count()).toBeLessThan(allSections);
  for (const section of await matches.all()) await expect(section).toContainText('伏線');
  const firstEntry = dialog.getByRole('navigation', { name: 'マニュアルの目次' }).getByRole('button').first();
  const targetTitle = (await firstEntry.textContent())!;
  await firstEntry.click();
  await expect(dialog.getByRole('heading', { name: targetTitle, exact: true })).toBeFocused();

  await dialog.getByRole('searchbox', { name: 'マニュアルを検索', exact: true }).fill('この語はマニュアルに存在しないxyz');
  await expect(dialog.getByRole('heading', { name: '該当する項目がありません' })).toBeVisible();
  await dialog.getByRole('button', { name: '検索を解除', exact: true }).click();
  await expect(dialog.locator('.manual-sections > section')).toHaveCount(allSections);
  const humanTab = dialog.getByRole('tab', { name: '人間向けマニュアル' });
  await humanTab.focus();
  await humanTab.press('End');
  await expect(dialog.getByRole('tab', { name: 'AI向けマニュアル' })).toBeFocused();
  await expect(dialog.getByRole('tab', { name: 'AI向けマニュアル' })).toHaveAttribute('aria-selected', 'true');

  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '全文を保存', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('shinariokanri-ai-manual.md');
  expect(await download.failure()).toBeNull();
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('# shinariokanri AI向けマニュアル');
  expect(text).toContain('提案');
  expect(text).toContain('ID');
  const publicPath = (await dialog.getByRole('link', { name: 'テキスト版を開く' }).getAttribute('href'))!;
  const publicManual = await request.get(publicPath);
  expect(publicManual.ok()).toBe(true);
  expect(await publicManual.text()).toBe(text);
  const humanManual = await request.get(publicPath.replace('/ai.md', '/human.md'));
  expect(humanManual.ok()).toBe(true);
  expect(await humanManual.text()).toContain('# shinariokanri 人間向けマニュアル');

  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.library-header').getByRole('button', { name: '人間向けマニュアル', exact: true })).toBeFocused();
});

test('スマートフォンのメニューで両マニュアルを確認しても未保存の入力が残る', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByLabel('作品名', { exact: true }).fill('マニュアルと入力保持');
  await page.getByRole('button', { name: '作品を作成', exact: true }).click();
  await navigate(page, /^資料/);
  await page.getByRole('button', { name: '人物を追加', exact: true }).first().click();
  const addDialog = page.getByRole('dialog');
  await addDialog.getByLabel('名前', { exact: true }).fill('未保存入力を持つ人物');
  await addDialog.getByRole('button', { name: '編集を始める', exact: true }).click();
  const editor = page.locator('.detail-panel');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByText('詳細データ・ルビ・本文リンクを編集', { exact: true }).click();
  const rawInput = editor.getByLabel('詳細データ', { exact: true });
  await rawInput.fill('{MANUAL_KEEP_UNSAVED');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();

  for (const audience of ['人間向けマニュアル', 'AI向けマニュアル']) {
    await openMenu(page);
    const entry = page.locator('.sidebar').getByRole('button', { name: audience, exact: true });
    await entry.click();
    const dialog = page.getByRole('dialog', { name: '使い方マニュアル', exact: true });
    await expect(dialog.getByRole('tab', { name: audience, exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(entry).toBeFocused();
    await expect(rawInput).toHaveValue('{MANUAL_KEEP_UNSAVED');
  }
  await page.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
  await expect(rawInput).toHaveValue('{MANUAL_KEEP_UNSAVED');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('アカウントの再認証待ちでも常設入口から両マニュアルを開ける', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('scenario-last-account', 'manual-test-account'));
  await page.reload();
  await expect(page.getByRole('heading', { name: '再認証が必要です', exact: true })).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.getByRole('button', { name: 'マニュアル（人間・AI）', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '使い方マニュアル', exact: true });
  for (const audience of ['人間向けマニュアル', 'AI向けマニュアル']) {
    await dialog.getByRole('tab', { name: audience, exact: true }).click();
    await expect(dialog.getByRole('tab', { name: audience, exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(await dialog.locator('.manual-sections > section').count()).toBeGreaterThan(5);
  }
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('heading', { name: '再認証が必要です', exact: true })).toBeVisible();
});

test('全3章サンプルは全情報種別と素材を保存し、再読込と独立した再作成ができる', async ({ page }) => {
  // Read all 36 scenes and verify four complete backups of the expanded fixture.
  test.setTimeout(360_000);
  await page.goto('./');
  await page.getByRole('button', { name: '全3章のサンプルを開く', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60_000 });
  const original = await completeBackup(page);
  const content = original.project;
  const chapters = content.entities.filter(entity => entity.kind === 'chapter');
  expect(chapters).toHaveLength(3);
  expect(chapters.map(chapter => chapter.data.sceneIds.length)).toEqual([12, 12, 12]);
  expect(content.entities.filter(entity => entity.kind === 'scene')).toHaveLength(36);
  expect(content.entities.filter(entity => entity.kind === 'character').length).toBeGreaterThanOrEqual(24);
  expect(content.entities.filter(entity => entity.kind === 'place').length).toBeGreaterThanOrEqual(24);
  expect(content.entities.filter(entity => entity.kind === 'item').length).toBeGreaterThanOrEqual(30);
  expect(content.entities.filter(entity => entity.kind === 'event').length).toBeGreaterThanOrEqual(65);
  expect([...new Set(content.entities.map(entity => entity.kind))].sort()).toEqual([...ENTITY_KINDS].sort());
  expect(original.summary.missingAssets).toBe(0);
  expect(original.assets.length).toBeGreaterThan(0);
  expect(original.assets.every(asset => asset.bytes.byteLength > 0)).toBe(true);
  expect(original.manifest.assetMode).toBe('embedded');

  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '章・本文', exact: true }).click();
  for (const chapter of chapters) await expect(page.locator('.chapter-list').getByRole('heading', { name: chapter.name, exact: true })).toBeVisible();
  await expect(page.locator('.chapter-list .scene-row')).toHaveCount(36);
  await navigate(page, /^資料/);
  await expect(page.locator('.entity-card')).toHaveCount(content.entities.filter(entity => entity.kind === 'character').length);
  await navigate(page, /^年表/);
  await page.getByRole('button', { name: '出来事一覧', exact: true }).click();
  const events = getEntitiesByKind(content, 'event');
  await expect(page.locator('.timeline-list-search')).toContainText(`${events.length}件`);
  const eventSearch = page.getByRole('searchbox', { name: '出来事一覧を検索', exact: true });
  const historical = events.find(event => event.name === '300年前・星路の一斉閉鎖事故')!;
  const finalScene = getEntitiesByKind(content, 'scene').find(scene => scene.id === chapters.at(-1)!.data.sceneIds.at(-1))!;
  for (const eventId of [historical.id, finalScene.data.eventIds[0]]) {
    await eventSearch.fill(eventId);
    await expect(page.locator('.event-table-row')).toHaveCount(1);
    await expect(page.locator(`.event-table-row[data-event-id="${eventId}"]`)).toBeVisible();
  }
  await eventSearch.clear();
  await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click();
  await page.getByRole('tab', { name: '地図・場所・移動', exact: true }).click();
  const map = content.entities.find(entity => entity.kind === 'map')!;
  await page.getByLabel('表示する地図', { exact: true }).selectOption(map.id);
  const pins = map.data.pins ?? [];
  await expect(page.locator('.world-map-pin')).toHaveCount(pins.length);
  expect(pins.length).toBeGreaterThan(0);

  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  const mainGraph = getEntitiesByKind(content, 'flow_graph').find(entity => entity.name === '全3章・星還りの旅')!;
  await page.getByRole('combobox', { name: '試読の開始点', exact: true }).selectOption(mainGraph.data.entryIds[0]);
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toBeVisible();
  await expect(page.locator('.reader-issue')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '一手戻る', exact: true })).toBeDisabled();
  const choiceLabels = ['書庫で反転星図を調べる', '浅瀬で避難者を救助する', '住民の証言を添えて共同調査を申し出る'];
  const sceneOrder = chapters.flatMap(chapter => chapter.data.sceneIds).map(id => content.entities.find(entity => entity.id === id)!.name);
  let choicesTaken = 0;
  const automatic = page.getByRole('button', { name: '進行規則に従って次へ', exact: true });
  for (let step = 0; step < 60 && !(await page.locator('.reader-ending').isVisible()); step++) {
    if (await automatic.isVisible()) await automatic.click();
    else {
      expect(choicesTaken).toBeLessThan(choiceLabels.length);
      await page.locator('.reader-choices').getByRole('button', { name: new RegExp(`^${choiceLabels[choicesTaken++]}`) }).click();
    }
    await expect(page.locator('.reader-sheet-heading h2')).toHaveText(sceneOrder[step + 1]);
    await expect(page.locator('.reader-issue')).toHaveCount(0);
  }
  expect(choicesTaken).toBe(3);
  await expect(page.locator('.reader-ending')).toContainText('全3章の完結');
  await expect(page.getByRole('button', { name: '一手戻る', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '一手戻る', exact: true }).click();
  await expect(page.locator('.reader-ending')).toHaveCount(0);
  await automatic.click();
  await expect(page.locator('.reader-ending')).toContainText('全3章の完結');

  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60_000 });
  await expectBackupUnchanged(page, original.manifest);

  await page.locator('.project-switch').click();
  await page.getByRole('button', { name: '全3章のサンプルを開く', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60_000 });
  const second = await completeBackup(page);
  expect(second.project.projectId).not.toBe(content.projectId);
  expect(second.project.entities.filter(entity => entity.kind === 'chapter')).toHaveLength(3);
  const oldIds = new Set(content.entities.map(entity => entity.id));
  expect(second.project.entities.some(entity => oldIds.has(entity.id))).toBe(false);
  await page.locator('.project-switch').click();
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.locator(`.project-card[data-project-id="${content.projectId}"]`).click();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60_000 });
  await expectBackupUnchanged(page, original.manifest);
});
