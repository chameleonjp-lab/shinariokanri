import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, validateProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (page.viewportSize()!.width < 1200) { await expect(menu).toBeVisible(); await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/); }
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function add(page: Page, kind: string, label: string, name: string) {
  await page.locator('.materials-filter').getByLabel('情報の種類').selectOption(kind);
  await page.getByRole('button', { name: `${label}を追加`, exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名前', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: '編集を始める', exact: true }).click();
  return page.getByRole('complementary', { name: `${label}の詳細` });
}
async function open(page: Page, kind: string, name: string) {
  await navigate(page, /^資料/);
  await page.locator('.materials-filter').getByLabel('情報の種類').selectOption(kind);
  await page.locator('.entity-card').filter({ hasText: name }).first().click();
  return page.locator('.detail-panel');
}

test('AT-F02/F56 雛形の通常フォームを差分確認して適用し、非表示・型変更の取消・明示置換を再読込まで保持する', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('./');
  await page.getByLabel('作品名', { exact: true }).fill('作品別の入力フォーム');
  await page.getByRole('button', { name: '作品を作成', exact: true }).click();
  await navigate(page, /^資料/);
  let editor = await add(page, 'character', '人物', '名前だけの人物A');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByRole('button', { name: '一覧に戻る', exact: true }).click();
  editor = await add(page, 'template', '雛形', '人物の入力項目');
  await editor.getByRole('button', { name: '追加項目を作る', exact: true }).click();
  await editor.getByLabel('項目1の保存キー').fill('affiliation');
  await editor.getByLabel('項目1の表示名').fill('所属');
  await editor.getByLabel('項目1の型', { exact: true }).selectOption('enum');
  await editor.getByLabel('項目1の選択候補').fill('独立\n町');
  await editor.getByLabel('項目1の説明').fill('人物の所属を選択してください。');
  await editor.getByLabel('項目1の初期値').selectOption('option:0');
  await expect(editor.locator('.editor-save-state')).toContainText('差分の確認待ち');
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  let preview = page.getByRole('dialog', { name: '雛形の変更・適用差分' });
  await preview.getByRole('checkbox', { name: /^名前だけの人物Aに適用/ }).check();
  await expect(preview.locator('.template-impact')).toContainText('未設定');
  await expect(preview.locator('.template-impact')).toContainText('独立');
  await preview.getByRole('button', { name: 'この差分を一括保存', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');

  editor = await open(page, 'character', '名前だけの人物A');
  await expect(editor.getByLabel('所属', { exact: true })).toHaveValue('option:0');
  await expect(editor).toContainText('人物の所属を選択してください。');
  await editor.getByLabel('所属', { exact: true }).selectOption('option:1');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByText('この端末での項目と画面の表示', { exact: true }).click();
  await editor.getByLabel('追加項目 · 所属を表示').uncheck();
  await editor.getByLabel('作者メモの編集画面を表示').uncheck();
  await expect(editor.getByLabel('所属', { exact: true })).toHaveCount(0);
  await expect(editor.getByRole('tab', { name: '作者メモ', exact: true })).toHaveCount(0);
  await page.reload();
  editor = await open(page, 'character', '名前だけの人物A');
  await expect(editor.getByLabel('所属', { exact: true })).toHaveCount(0);
  await editor.getByText('この端末での項目と画面の表示', { exact: true }).click();
  await editor.getByLabel('追加項目 · 所属を表示').check();
  await expect(editor.getByLabel('所属', { exact: true })).toHaveValue('option:1');

  editor = await open(page, 'template', '人物の入力項目');
  await editor.getByLabel('項目1の型', { exact: true }).selectOption('number');
  await editor.getByLabel('項目1を必須にする').check();
  await editor.getByLabel('項目1で空欄を許可').uncheck();
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  preview = page.getByRole('dialog', { name: '雛形の変更・適用差分' });
  await expect(preview).toContainText('現在の値を保持します');
  await expect(preview).toContainText('町');
  await expect(preview.getByRole('button', { name: 'この差分を一括保存', exact: true })).toBeDisabled();
  const cancelledReplacement = preview.getByLabel('名前だけの人物Aの所属の置換値');
  await cancelledReplacement.press('ControlOrMeta+A'); await cancelledReplacement.press('Backspace');
  await cancelledReplacement.pressSequentially('-', { delay: 60 });
  await expect(cancelledReplacement).toHaveValue('-');
  await expect(preview.getByRole('button', { name: 'この差分を一括保存', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '中止', exact: true }).click();
  await expect(editor.getByLabel('項目1の型', { exact: true })).toHaveValue('number');
  await page.reload();
  editor = await open(page, 'template', '人物の入力項目');
  await expect(editor.getByLabel('項目1の型', { exact: true })).toHaveValue('number');
  await expect(editor.locator('.editor-save-state')).toContainText('差分の確認待ち');
  await editor.getByRole('button', { name: '保存済みの内容へ戻す', exact: true }).click();
  await expect(editor.getByLabel('項目1の型', { exact: true })).toHaveValue('enum');
  await editor.getByLabel('項目1の型', { exact: true }).selectOption('number');
  await editor.getByLabel('項目1を必須にする').check();
  await editor.getByLabel('項目1で空欄を許可').uncheck();
  const defaultNumber = editor.getByLabel('項目1の初期値');
  await defaultNumber.press('ControlOrMeta+A'); await defaultNumber.press('Backspace');
  await defaultNumber.pressSequentially('-0.', { delay: 60 });
  await expect(defaultNumber).toHaveValue('-0.');
  await expect(editor.getByRole('button', { name: '保存前の差分を確認', exact: true })).toBeDisabled();
  await defaultNumber.pressSequentially('5', { delay: 60 }); await defaultNumber.press('Tab');
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  preview = page.getByRole('dialog', { name: '雛形の変更・適用差分' });
  const replacement = preview.getByLabel('名前だけの人物Aの所属の置換値');
  await replacement.press('ControlOrMeta+A'); await replacement.press('Backspace');
  await replacement.pressSequentially('1e-', { delay: 60 }); await expect(replacement).toHaveValue('1e-');
  await expect(preview.getByRole('button', { name: 'この差分を一括保存', exact: true })).toBeDisabled();
  await replacement.pressSequentially('3', { delay: 60 });
  await expect(preview).toContainText('指定した置換値を適用します');
  await preview.getByRole('button', { name: 'この差分を一括保存', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.reload();
  editor = await open(page, 'character', '名前だけの人物A');
  await expect(editor.getByLabel('所属', { exact: true })).toHaveValue('0.001');
  await expect(editor).toContainText('必須');
  for (const entered of ['1.5', '-0.5', '1e-3']) {
    const field = editor.getByLabel('所属', { exact: true });
    await field.press('ControlOrMeta+A'); await field.press('Backspace');
    if (entered === '1.5') {
      await field.pressSequentially('1.', { delay: 60 });
      await expect(field).toHaveValue('1.');
      await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
      await field.pressSequentially('5', { delay: 60 });
    } else await field.pressSequentially(entered, { delay: 60 });
    await field.press('Tab');
    await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
    await page.reload(); editor = await open(page, 'character', '名前だけの人物A');
    await expect(editor.getByLabel('所属', { exact: true })).toHaveValue(String(Number(entered)));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/templates-normal-forms-390.png', fullPage: true });
});

test('雛形の保存キーが一時的に重複しても各項目の初期値を保ち、再表示・改名・差分適用後も両方の値を保持する', async ({ page }) => {
  const project = createProject('初期値を保つ保存キー編集');
  const character = createEntity(project.projectId, 'character', '初期値を受け取る人物');
  const template = createEntity(project.projectId, 'template', '保存キーの雛形', { targetKind: 'character', fields: [
    { key: 'a', label: '先頭項目', type: 'text', required: true, nullable: false, default: '内部A' },
    { key: 'b', label: '次の項目', type: 'text', required: true, nullable: false, default: '内部B' },
  ], defaults: { a: '上書きA', b: '上書きB' } });
  project.entities = [character, template];
  const validation = validateProject(project); if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
  await page.goto('./'); await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'defaults.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await expect(page.getByRole('heading', { name: '検査済みの作品' })).toBeVisible();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  let editor = await open(page, 'template', template.name);
  await expect(editor.getByLabel('項目1の初期値')).toHaveValue('上書きA');
  await expect(editor.getByLabel('項目2の初期値')).toHaveValue('上書きB');
  await editor.getByLabel('項目1の保存キー').fill('b');
  await expect(editor.getByRole('button', { name: '保存前の差分を確認', exact: true })).toBeDisabled();
  await expect(editor.getByLabel('項目1の初期値')).toHaveValue('上書きA');
  await expect(editor.getByLabel('項目2の初期値')).toHaveValue('上書きB');
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  editor = await open(page, 'template', template.name);
  await expect(editor.getByLabel('項目1の保存キー')).toHaveValue('b');
  await expect(editor.getByLabel('項目1の初期値')).toHaveValue('上書きA');
  await expect(editor.getByLabel('項目2の初期値')).toHaveValue('上書きB');
  await editor.getByLabel('項目1の保存キー').fill('c');
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '雛形の変更・適用差分' });
  await preview.getByRole('checkbox', { name: new RegExp(`^${character.name}に適用`) }).check();
  await expect(preview.locator('.template-impact')).toContainText('上書きA');
  await expect(preview.locator('.template-impact')).toContainText('上書きB');
  await preview.getByRole('button', { name: 'この差分を一括保存', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.reload(); editor = await open(page, 'character', character.name);
  await expect(editor.getByLabel('先頭項目', { exact: true })).toHaveValue('上書きA');
  await expect(editor.getByLabel('次の項目', { exact: true })).toHaveValue('上書きB');
  editor = await open(page, 'template', template.name);
  await expect(editor.getByLabel('項目1の保存キー')).toHaveValue('c');
  await expect(editor.getByLabel('項目2の保存キー')).toHaveValue('b');
  await expect(editor.getByLabel('項目1の初期値')).toHaveValue('上書きA');
  await expect(editor.getByLabel('項目2の初期値')).toHaveValue('上書きB');
});
