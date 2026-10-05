import { test, expect, type Page } from '@playwright/test';

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name }).first().click();
}

async function closeEditor(page: Page) {
  const desktopClose = page.getByRole('button', { name: '詳細を閉じる' });
  if (await desktopClose.isVisible()) await desktopClose.click();
  else await page.getByRole('button', { name: '一覧に戻る' }).click();
}

test('幅390pxの手動試読で候補がない場合の代替進行を確認・巻戻・記録再生できる', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'サンプルで試す', exact: true }).click();
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '分岐', exact: true }).click();

  const merge = page.locator('.branch-node').filter({ hasText: '同じ門へ合流' });
  await merge.getByRole('button', { name: '選択 同じ門へ合流', exact: true }).click();
  const nodeEditor = page.locator('.detail-panel');
  const fallback = nodeEditor.getByLabel('進行できない場合の行き先', { exact: true });
  const fallbackId = await fallback.locator('option').filter({ hasText: '町へ戻る' }).getAttribute('value');
  expect(fallbackId).toBeTruthy();
  await fallback.selectOption(fallbackId!);
  await nodeEditor.getByLabel('トリガー', { exact: true }).selectOption('value');
  await nodeEditor.getByLabel('起動イベント', { exact: true }).selectOption({ label: '手動実行' });
  await nodeEditor.getByLabel('イベントキー', { exact: true }).fill('代替の確認');
  await nodeEditor.getByLabel('繰り返し', { exact: true }).selectOption({ label: '繰り返す' });
  await expect(nodeEditor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await closeEditor(page);

  for (const label of [/鍵で門を開く/, /町へ戻る/]) {
    await merge.getByRole('button', { name: label }).click();
    const edgeEditor = page.locator('.detail-panel');
    await edgeEditor.getByLabel('条件の種類').selectOption('constant');
    await edgeEditor.getByLabel('条件の真偽').selectOption('false');
    await expect(edgeEditor.locator('.editor-save-state')).toContainText('端末内保存済み');
    await closeEditor(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  const start = page.getByLabel('試読の開始点');
  const mergeId = await start.locator('option').filter({ hasText: '同じ門へ合流' }).getAttribute('value');
  expect(mergeId).toBeTruthy();
  await start.selectOption(mergeId!);
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();

  const fallbackButton = page.getByRole('button', { name: /代替の進行先へ：町へ戻る/ });
  await expect(fallbackButton).toBeVisible();
  await expect(fallbackButton).toBeDisabled();
  const triggerConfirmation = page.getByRole('checkbox', { name: '宣言したきっかけ「代替の確認」で進む' });
  await triggerConfirmation.check();
  await expect(fallbackButton).toBeEnabled();
  await fallbackButton.click();
  await expect(page.getByRole('heading', { name: '町へ戻る', exact: true })).toBeVisible();
  await expect(page.locator('.reader-ending')).toContainText('手掛かりを探し直す');

  await page.getByRole('button', { name: '一手戻る', exact: true }).click();
  await expect(fallbackButton).toBeVisible();
  await triggerConfirmation.check();
  await fallbackButton.click();
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByText('開始状態と経路を端末内に保存しました。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /試読経路.*再実行して状態を比較/ }).click();
  await expect(page.getByText('保存版で経路を再実行しました。状態の一致を検査しています。', { exact: true })).toBeVisible();
  await expect(page.locator('.reader-issue')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
