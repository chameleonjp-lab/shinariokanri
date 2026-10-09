import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

async function navigate(page: Page, name: RegExp) {
  const button = page.getByRole('button', { name }).first();
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await button.click();
  if (await menu.isVisible()) await expect.poll(() => page.locator('.sidebar').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
}
async function create(page: Page) {
  await page.goto('./');
  await page.getByLabel('作品名', { exact: true }).fill('検証の物語 🌸');
  await page.getByRole('button', { name: '作品を作成', exact: true }).click();
  await expect(page.getByRole('button', { name: '作品・保存' })).toBeAttached();
}

test('人物の日本語入力を保存し再読み込みして完全保存・別端末領域へ復元できる', async ({ page, browser }) => {
  await create(page);
  await navigate(page, /^資料/);
  await page.getByRole('button', { name: '人物を追加', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前', { exact: true }).fill('桜井あかり 🌸');
  await dialog.getByRole('button', { name: '編集を始める' }).click();
  const editor = page.getByRole('complementary', { name: '人物の詳細' });
  await editor.getByLabel('名前', { exact: true }).fill('桜井あかり 🌸 改稿');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload();
  await navigate(page, /^資料/);
  await expect(page.getByText('桜井あかり 🌸 改稿', { exact: true }).first()).toBeVisible();
  await navigate(page, /^作品・保存$/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.scenario$/);
  expect(await download.failure()).toBeNull();
  const archive = await download.path();
  expect(archive).not.toBeNull();
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage();
    await restored.goto('http://127.0.0.1:4173/shinariokanri/');
    await restored.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await restored.locator('input[type=file]').setInputFiles(archive!);
    await expect(restored.getByRole('heading', { name: '検査済みの作品' })).toBeVisible();
    await restored.getByLabel('復元方法と対象への影響を確認しました').check();
    await restored.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
    await navigate(restored, /^資料/);
    await expect(restored.getByText('桜井あかり 🌸 改稿', { exact: true }).first()).toBeVisible();
  } finally { await fresh.close(); }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`幅${width}pxで作品作成と資料の操作が画面内に収まる`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await create(page);
    await navigate(page, /^資料/);
    await expect(page.getByRole('button', { name: '人物を追加', exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/layout-${width}.png`, fullPage: true });
  });
}

test('初期画面の自動アクセシビリティ検査', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByLabel('作品名', { exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

test('配信サーバー停止後にキャッシュ取得済みの作品を再開する', async ({ page }) => {
  const root = resolve('dist');
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (!url.pathname.startsWith('/shinariokanri/')) { response.writeHead(404).end(); return; }
      const relative = decodeURIComponent(url.pathname.slice('/shinariokanri/'.length)) || 'index.html';
      const file = resolve(root, relative);
      if (!file.startsWith(root + '/')) { response.writeHead(404).end(); return; }
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      response.setHeader('Vary', 'Origin');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server unavailable');
  const url = `http://127.0.0.1:${address.port}/shinariokanri/`;
  try {
  await page.goto(url);
  await page.getByLabel('作品名', { exact: true }).fill('配信停止後の作品');
  await page.getByRole('button', { name: '作品を作成', exact: true }).click();
  await expect(page.getByRole('button', { name: '作品・保存' })).toBeAttached();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return Promise.all(keys.map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(r => r.url) })));
  });
  expect(cached.some(cache => cache.urls.some(url => /\/assets\/index-.*\.js$/.test(url)))).toBe(true);
  server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
  await page.goto(url + '?offline=1');
  await navigate(page, /^資料/);
  await expect(page.getByRole('button', { name: '人物を追加', exact: true }).first()).toBeVisible();
  await navigate(page, /^作品・保存$/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  } finally {
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  }
});

test('サンプルの条件付き選択肢と巻き戻しを操作できる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'サンプルで試す', exact: true }).click();
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  const advance = page.getByRole('button', { name: '進行規則に従って次へ' });
  if (await advance.isVisible()) await advance.click();
  await page.getByRole('button', { name: /記録を飛ばす/ }).click();
  if (await advance.isVisible()) await advance.click();
  await expect(page.getByRole('button', { name: /鍵で門を開く/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: '一手戻る', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '一手戻る', exact: true }).click();
  await page.getByRole('button', { name: /鍵と記録を調べる/ }).click();
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByText('開始状態と経路を端末内に保存しました。', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '保存した経路の再実行' })).toBeVisible();
  await page.getByRole('button', { name: /試読経路.*再実行して状態を比較/ }).click();
  await expect(page.getByText('保存版で経路を再実行しました。状態の一致を検査しています。', { exact: true })).toBeVisible();
  await expect(page.locator('.reader-issue')).toHaveCount(0);
});

test('不正JSONの未保存入力を画面移動後も保持する', async ({ page }) => {
  await create(page);
  await navigate(page, /^資料/);
  await page.getByRole('button', { name: '人物を追加', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('名前', { exact: true }).fill('入力保持の人物');
  await page.getByRole('button', { name: '編集を始める', exact: true }).click();
  const editor = page.getByRole('complementary', { name: '人物の詳細' });
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByText('詳細データ・ルビ・本文リンクを編集', { exact: true }).click();
  await editor.getByLabel('詳細データ', { exact: true }).fill('{BAD_UNSAVED_JSON');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await navigate(page, /^構成/);
  await expect(page.locator('.topbar-status')).toContainText('未保存入力');
  await navigate(page, /^資料/);
  await page.locator('.entity-card').filter({ hasText: '入力保持の人物' }).click();
  await editor.getByText('詳細データ・ルビ・本文リンクを編集', { exact: true }).click();
  await expect(editor.getByLabel('詳細データ', { exact: true })).toHaveValue('{BAD_UNSAVED_JSON');
});

test('保存に失敗した名前を二回の画面移動後も未保存として保持する', async ({ page }) => {
  await create(page);
  await navigate(page, /^資料/);
  await page.getByRole('button', { name: '人物を追加', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('名前', { exact: true }).fill('元の人物名');
  await page.getByRole('button', { name: '編集を始める', exact: true }).click();
  const editor = page.getByRole('complementary', { name: '人物の詳細' });
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  const invalidName = 'あ'.repeat(129);
  await editor.getByLabel('名前', { exact: true }).fill(invalidName);
  await editor.getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.getByText('保存できませんでした', { exact: true })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await navigate(page, /^構成/);
    await navigate(page, /^資料/);
    await page.locator('.entity-card').filter({ hasText: '元の人物名' }).click();
    await expect(editor.getByLabel('名前', { exact: true })).toHaveValue(invalidName);
    await expect(page.locator('.topbar-status')).toContainText('未保存入力');
  }
});
