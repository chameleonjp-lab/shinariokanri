import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { jsonBytes, sha256 } from '../../src/storage/json';

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (page.viewportSize()!.width < 1200) { await expect(menu).toBeVisible(); await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/); }
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function open(page: Page, name: string) {
  await navigate(page, /^検索/);
  await page.getByLabel('作品内を検索').fill(name);
  await page.locator('.entity-card').filter({ hasText: name }).first().click();
  return page.locator('.detail-panel');
}
async function seed(page: Page) {
  const project = createProject('参照位置とアーカイブの操作');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const first = { id: newId(), kind: 'paragraph' as const, text: '😀アオが歩く。' };
  const second = { id: newId(), kind: 'paragraph' as const, text: '再び😀アオが歩く。', links: [{ start: 3, end: 5, target: { entityId: character.id } }] };
  const scene = createEntity(project.projectId, 'scene', '繰り返す言葉の場面', { body: [first, second] });
  const lore = createEntity(project.projectId, 'lore', '保持する背景設定'); lore.retainIfUnreferenced = true;
  project.entities = [character, scene, lore];
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  const { snapshots: _snapshots, history: _history, ...content } = project;
  project.snapshots = [{ id: newId(), versionLabel: '保存した固定版', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) }];
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'navigation.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await expect(page.getByRole('heading', { name: '検査済みの作品' })).toBeVisible();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  return { project, scene, character, lore, secondStart: first.text.length + 1 + '再び😀'.length };
}

test('B10/F27 本文リンクから戻り、逆参照でも同じ段落の絵文字後の語句を正確に開く', async ({ page }) => {
  const f = await seed(page);
  let editor = await open(page, f.scene.name);
  await editor.getByRole('tab', { name: '本文', exact: true }).click();
  await editor.getByRole('button', { name: '対象を開く', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '人物の詳細' }).getByLabel('名前', { exact: true })).toHaveValue(f.character.name);
  await page.locator('.detail-panel').getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  editor = page.locator('.detail-panel');
  await expect(editor.getByRole('tab', { name: '本文', exact: true })).toHaveAttribute('aria-selected', 'true');
  const body = editor.getByLabel('本文', { exact: true });
  await expect.poll(() => body.evaluate(node => ({ start: (node as HTMLTextAreaElement).selectionStart, text: (node as HTMLTextAreaElement).value.slice((node as HTMLTextAreaElement).selectionStart, (node as HTMLTextAreaElement).selectionEnd) }))).toEqual({ start: f.secondStart, text: 'アオ' });
  await editor.getByRole('button', { name: '対象を開く', exact: true }).click();
  await page.locator('.detail-panel').getByRole('button', { name: '本文からの参照位置を表示', exact: true }).click();
  const references = page.getByRole('dialog', { name: '本文からの参照' });
  await expect(references).toContainText('本文 1件');
  await expect(references).toContainText('引用「アオ」');
  await references.getByRole('button', { name: 'この本文の参照位置を開く', exact: true }).click();
  editor = page.locator('.detail-panel');
  await expect(editor.getByRole('tab', { name: '本文', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => editor.getByLabel('本文', { exact: true }).evaluate(node => (node as HTMLTextAreaElement).selectionStart)).toBe(f.secondStart);
  await page.reload();
  editor = await open(page, f.scene.name);
  await expect(editor.getByRole('tab', { name: '本文', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => editor.getByLabel('本文', { exact: true }).evaluate(node => (node as HTMLTextAreaElement).selectionStart)).toBe(f.secondStart);
});

test('B01 参照元と固定版の影響を示して参照中のアーカイブを止め、未参照の保持指定も個別に確認する', async ({ page }) => {
  const f = await seed(page);
  let editor = await open(page, f.character.name);
  await editor.getByRole('button', { name: 'アーカイブ', exact: true }).click();
  let preview = page.getByRole('dialog', { name: 'アーカイブの確認' });
  await expect(preview).toContainText(f.scene.name);
  await expect(preview).toContainText('参照元の項目: 本文');
  await expect(preview).toContainText('固定版は保持');
  await expect(preview.getByRole('button', { name: 'アーカイブする', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: '中止', exact: true }).click();
  await expect(editor.getByLabel('名前', { exact: true })).toHaveValue(f.character.name);
  editor = await open(page, f.lore.name);
  await expect(editor.getByLabel('未参照でも保持する', { exact: true })).toBeChecked();
  await editor.getByRole('button', { name: 'アーカイブ', exact: true }).click();
  preview = page.getByRole('dialog', { name: 'アーカイブの確認' });
  await expect(preview).toContainText('作者が「未参照でも保持する」と指定');
  await expect(preview).toContainText('固定版は保持');
  await expect(preview.getByRole('button', { name: 'アーカイブする', exact: true })).toBeEnabled();
  await preview.getByRole('button', { name: '中止', exact: true }).click();
  await expect(editor.getByLabel('名前', { exact: true })).toHaveValue(f.lore.name);
});
