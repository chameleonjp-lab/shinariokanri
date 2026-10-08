import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId, validateProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (page.viewportSize()!.width < 1200) { await expect(menu).toBeVisible(); await menu.click(); await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/); }
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}

async function seed(page: Page) {
  const project = createProject('本文と条件の回帰検査');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const scene = createEntity(project.projectId, 'scene', '注記付き本文', { body: [{ id: newId(), kind: 'paragraph', text: 'アオが歩く。', ruby: [{ start: 0, end: 2, text: 'あお' }], links: [{ start: 0, end: 2, target: { entityId: character.id } }] }] });
  const foreshadow = createEntity(project.projectId, 'foreshadow', '歩く理由');
  const disclosure = createEntity(project.projectId, 'disclosure', '本文の提示位置', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 2 } });
  const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry' });
  const end = createEntity(project.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '完了' });
  const variables = [
    createEntity(project.projectId, 'variable', '真偽状態', { key: 'boolean', valueType: 'boolean', initial: { type: 'boolean', value: true }, allowed: { values: [false, true] } }),
    createEntity(project.projectId, 'variable', '整数状態', { key: 'integer', valueType: 'integer', initial: { type: 'integer', value: 7 }, allowed: { min: 0, max: 10 } }),
    createEntity(project.projectId, 'variable', '列挙状態', { key: 'enum', valueType: 'enum', initial: { type: 'enum', value: 'open' }, allowed: { values: ['open', 'closed'] } }),
  ];
  const edges = variables.map((variable, index) => createEntity(project.projectId, 'flow_edge', `${variable.data.valueType}比較条件`, { fromId: entry.id, toId: end.id, label: `${variable.name}の道`, priority: index, condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: variable.data.initial } }));
  const graph = createEntity(project.projectId, 'flow_graph', '条件付き進行', { nodeIds: [entry.id, end.id], edgeIds: edges.map(edge => edge.id), entryIds: [entry.id], exitIds: [] });
  project.entities = [character, scene, foreshadow, disclosure, entry, end, ...variables, ...edges, graph];
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  const valid = validateProject(project); if (!valid.ok) throw new Error(JSON.stringify(valid.issues));
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'regressions.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await expect(page.getByRole('heading', { name: '検査済みの作品' })).toBeVisible();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.getByRole('button', { name: '作品・保存' })).toBeAttached();
}

async function openByName(page: Page, name: string) {
  await navigate(page, /^検索/);
  await page.getByLabel('作品内を検索').fill(name);
  await page.locator('.entity-card').filter({ hasText: name }).first().click();
  return page.locator('.detail-panel');
}

test('RG-R01 本文の注記と提示位置が絵文字を含む前方挿入に追従し、再読込後も人物を開ける', async ({ page }) => {
  await seed(page);
  let editor = await openByName(page, '注記付き本文');
  await editor.getByRole('tab', { name: '本文', exact: true }).click();
  const body = editor.getByLabel('本文', { exact: true });
  await body.focus(); await body.press('Control+Home'); await page.keyboard.insertText('昨日、😀');
  await expect(body).toHaveValue('昨日、😀アオが歩く。');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload();
  editor = await openByName(page, '注記付き本文');
  await editor.getByRole('tab', { name: '確認表示', exact: true }).click();
  const link = editor.getByRole('button', { name: /^アオ\s*あお$/ });
  await expect(link.locator('ruby')).toContainText('アオ');
  await expect(link.locator('rt')).toHaveText('あお');
  await link.click();
  await expect(page.getByRole('complementary', { name: '人物の詳細' }).getByLabel('名前', { exact: true })).toHaveValue('アオ');
  editor = await openByName(page, '本文の提示位置');
  await expect(editor.getByLabel('開始位置（任意）')).toHaveValue('4');
  await expect(editor.getByLabel('終了位置（任意）')).toHaveValue('6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

for (const type of ['boolean', 'integer', 'enum'] as const) test(`RG-R05 ${type}の複数値をフォームで追加し、演算切替を取り消して保存・再読込・試読する`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seed(page);
  let editor = await openByName(page, `${type}比較条件`);
  const condition = () => editor.locator('[data-field="condition"]');
  await condition().getByLabel('比較演算').selectOption('in');
  await condition().getByRole('button', { name: '比較値を追加', exact: true }).click();
  const second = condition().getByRole('group', { name: '比較値2', exact: true });
  if (type === 'boolean') await second.getByLabel('真偽値').selectOption('false');
  else await second.getByLabel('値', { exact: true }).fill(type === 'integer' ? '3' : 'closed');
  await expect(condition().locator('.condition-description')).toContainText(type === 'boolean' ? '（真、偽）' : type === 'integer' ? '（7、3）' : '（open、closed）');
  await expect(condition().locator('.condition-expression')).toContainText(' in [');
  await condition().getByLabel('比較演算').selectOption('eq');
  await expect(condition().getByRole('group', { name: '演算切替の確認' })).toBeVisible();
  await condition().getByRole('button', { name: '演算切替を取消', exact: true }).click();
  await expect(condition().getByRole('group', { name: '比較値2', exact: true })).toBeVisible();
  await expect(condition().getByLabel('比較演算')).toHaveValue('in');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload();
  editor = await openByName(page, `${type}比較条件`);
  await expect(condition().getByRole('group', { name: '比較値2', exact: true })).toBeVisible();
  await expect(condition().getByLabel('比較演算')).toHaveValue('in');
  if (type === 'integer' || type === 'enum') {
    const field = condition().getByRole('group', { name: '比較値2', exact: true }).getByLabel('値', { exact: true });
    await field.fill('');
    await expect(condition().getByRole('alert')).toBeVisible();
    await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
    await field.fill(type === 'integer' ? '3' : 'closed');
    await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  }
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`${type === 'boolean' ? '真偽' : type === 'integer' ? '整数' : '列挙'}状態の道`) })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
