import { readFile } from 'node:fs/promises';
import { inspectScenario } from '../../src/storage/archive';
import { test, expect, type Page } from '@playwright/test';
async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name }).first().click();
}
async function create(page: Page) {
  await page.goto('./'); await page.getByLabel('作品名', { exact: true }).fill('共通操作の物語');
  await page.getByRole('button', { name: '作品を作成', exact: true }).click();
  await expect(page.getByRole('button', { name: '作品・保存' })).toBeAttached();
}
async function add(page: Page, kind: string, name: string, configure?: () => Promise<void>) {
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption(kind);
  await page.getByRole('button', { name: /を追加$/ }).first().click();
  await page.getByRole('dialog').getByLabel('名前', { exact: true }).fill(name);
  await page.getByRole('button', { name: '編集を始める' }).click();
  if (configure) await configure();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
}

test('保存した複合一覧の再適用、一括変更、索引分類を通常フォームで行う', async ({ page }) => {
  await create(page); await add(page, 'character', '桜井あかり');
  await navigate(page, /^検索/); await page.getByLabel('作品内を検索', { exact: true }).fill('あかり');
  await page.getByLabel('一覧の名前', { exact: true }).fill('人物候補');
  await page.getByRole('button', { name: '一覧を保存', exact: true }).click();
  await expect(page.locator('.search-page [role=status]').first()).toContainText('一覧を保存しました');
  await page.reload(); await expect(page.getByLabel('作品内を検索', { exact: true })).toHaveValue('あかり');
  await page.getByLabel('保存した一覧を再表示').selectOption({ label: '人物候補' });
  await page.getByText('結果をまとめて編集', { exact: true }).click();
  await page.getByRole('button', { name: '結果をすべて選択', exact: true }).click();
  await page.getByLabel('まとめて設定する状態').selectOption('needs_review');
  await page.getByRole('button', { name: '変更差分を確認', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('桜井あかり');
  await page.getByRole('button', { name: '差分を確定して保存' }).click();
  await expect(page.locator('.search-page [role=status]').first()).toContainText('一括変更を保存しました');
  await page.getByRole('tab', { name: '五十音・分類索引' }).click();
  await page.locator('.search-page .reference-link').filter({ hasText: '桜井あかり' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('索引の項目を編集');
  await page.getByLabel('新しい分類', { exact: true }).fill('主要人物');
  await page.getByRole('button', { name: '分類を追加', exact: true }).click();
  await page.getByRole('button', { name: '索引項目を保存', exact: true }).click();
  await expect(page.getByLabel('索引の分類')).toContainText('主要人物');
});

test('狭い画面で文章メモを場面へ変換し元メモと履歴を保持する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await create(page); await add(page, 'note', '駅の思いつき');
  await page.getByLabel('短い文章を追加', { exact: true }).fill('😀雨の駅で再会する。');
  await page.getByRole('button', { name: '文章メモを保存', exact: true }).click();
  await expect(page.getByLabel('短い文章を追加', { exact: true })).toHaveValue('');
  await page.getByLabel('変換先', { exact: true }).selectOption('scene');
  await page.getByLabel('変換先の名前', { exact: true }).fill('駅の再会');
  await page.getByRole('button', { name: '場面を作成して元メモを残す', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '場面の詳細' })).toBeVisible();
  await page.getByRole('tab', { name: '本文', exact: true }).click();
  await expect(page.getByLabel('本文', { exact: true })).toHaveValue('😀雨の駅で再会する。');
  await navigate(page, /^資料/); await page.getByLabel('情報の種類', { exact: true }).selectOption('note');
  await expect(page.locator('.workspace-list')).toContainText('駅の思いつき');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('短い文章メモの未保存入力を詳細パネルの閉じ直し後も保持する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await create(page); await add(page, 'note', 'あとで書く断片');
  const capture = page.getByLabel('短い文章を追加', { exact: true });
  const raw = '  門の向こうに雨が降る。\n次の一行も消さない。  ';
  await capture.fill(raw);
  await page.locator('.detail-panel').getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await expect(page.locator('.detail-panel')).toHaveCount(0);
  await page.locator('.entity-card').filter({ hasText: 'あとで書く断片' }).first().click();
  await expect(page.getByLabel('短い文章を追加', { exact: true })).toHaveValue(raw);
});

test('録音許可の拒否を説明し、文章と画像メモを保存ファイルまで保持する', async ({ page }) => {
  await page.addInitScript(() => {
    // Explicit denial fixture verifies the ordinary UI's failure path.
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
    if (typeof MediaRecorder === 'undefined') Object.defineProperty(window, 'MediaRecorder', { value: class { constructor() { throw new Error('denial fixture must not create a recorder'); } } });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('denied', 'NotAllowedError'); } });
  });
  await create(page); await add(page, 'note', '画像と文章の受け皿');
  await page.getByRole('button', { name: '録音を開始', exact: true }).click();
  await expect(page.locator('.notes-tools [role=alert]')).toContainText('マイクの使用が許可されませんでした');
  await page.getByLabel('短い文章を追加').fill('マイクがなくても文章を残す。');
  await page.getByRole('button', { name: '文章メモを保存', exact: true }).click();
  await expect(page.getByLabel('短い文章を追加')).toHaveValue('');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('画像・音声ファイル', { exact: true }).setInputFiles({ name: '思いつき.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'メモへ添付', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '添付素材の詳細' })).toBeVisible();
  await page.reload(); await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await pending; expect(await download.failure()).toBeNull();
  const saved = await inspectScenario(new Uint8Array(await readFile((await download.path())!)), { worker: false });
  const note = saved.project.entities.find(entity => entity.kind === 'note')!;
  expect(note.kind === 'note' && note.data.body.map(block => block.text).join('')).toBe('マイクがなくても文章を残す。');
  expect(saved.assets).toHaveLength(1); expect(Buffer.from(saved.assets[0].bytes)).toEqual(png);
  expect(note.kind === 'note' && note.data.attachmentIds).toEqual([saved.project.entities.find(entity => entity.kind === 'attachment')!.id]);
});

test('日本語索引の表記候補を連続入力して保存・再表示しても文字と焦点を保つ', async ({ page }) => {
  await create(page);
  await add(page, 'terminology', '魔法の呼称', async () => { await page.getByLabel('標準表記', { exact: true }).fill('魔法'); });
  await navigate(page, /^検索/); await page.getByLabel('作品内を検索').fill('魔法');
  await page.getByRole('tab', { name: '五十音・分類索引' }).click();
  await page.locator('.search-page .reference-link').filter({ hasText: '魔法の呼称' }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('追加する表記候補').fill('旧');
  await dialog.getByRole('button', { name: '候補を追加', exact: true }).click();
  const input = dialog.getByLabel('表記候補1', { exact: true }); await input.fill('');
  await input.pressSequentially('ABC', { delay: 60 });
  await expect(input).toHaveValue('ABC'); await expect(input).toBeFocused();
  await dialog.getByRole('button', { name: '索引項目を保存', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload(); await page.getByRole('tab', { name: '五十音・分類索引' }).click();
  await page.locator('.search-page .reference-link').filter({ hasText: '魔法の呼称' }).first().click();
  dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('表記候補1', { exact: true })).toHaveValue('ABC');
});
