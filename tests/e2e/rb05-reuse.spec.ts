import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';
import { prepareReuse } from '../../src/domain/reuse';
import { createWorldSnapshot } from '../../src/domain/world';
async function navigate(page: Page, name: RegExp) { const menu = page.getByRole('button', { name: 'メニューを開く' }); if (await menu.isVisible()) await menu.click(); await page.locator('.sidebar').getByRole('button', { name }).first().click(); }
async function open(page: Page, name: string) { await navigate(page, /^検索/); await page.getByLabel('作品内を検索').fill(name); await page.locator('.entity-card').filter({ hasText: name }).first().click(); return page.locator('.detail-panel'); }
async function seed(page: Page, p: ProjectData) { await page.goto('./'); await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click(); await page.locator('input[type=file]').setInputFiles({ name: 'reuse.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(p)) }); await page.getByLabel('復元方法と対象への影響を確認しました').check(); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await expect(page.locator('.sidebar')).toBeVisible(); }
test('RB05 共通元を固定参照・独立複製・部分上書きで原子保存し、共通元改稿後の本文と再読込を確認する', async ({ page }) => {
  const p = createProject('再利用の通常操作'), source = createEntity(p.projectId, 'scene', '共通元C', { body: [{ id: newId(), kind: 'paragraph', text: '旧版😀の共通本文' }] }), s = createEntity(p.projectId, 'scene', '固定参照S'), t = createEntity(p.projectId, 'scene', '独立複製T'), u = createEntity(p.projectId, 'scene', '部分上書きU', { body: [{ id: newId(), kind: 'paragraph', text: '使用先Uの本文' }] }); const entry = createEntity(p.projectId, 'flow_node', '再利用試読の入口', { nodeType: 'entry', sceneId: s.id }), end = createEntity(p.projectId, 'flow_node', '再利用試読の終端', { nodeType: 'terminal', terminalReason: '本文を確認した' }), edge = createEntity(p.projectId, 'flow_edge', '共通本文から終わる', { fromId: entry.id, toId: end.id, label: '共通本文から終わる' }); p.entities.push(source, s, t, u, entry, end, edge); await seed(page, p);
  let fixed = '';
  for (const [owner, mode] of [[s, 'reference'], [t, 'clone'], [u, 'override']] as const) {
    const editor = await open(page, owner.name); await editor.locator('summary').filter({ hasText: '共通元の固定参照・複製・部分上書き' }).click();
    if (fixed) await editor.getByLabel('共通元の版', { exact: true }).selectOption(fixed);
    await editor.getByRole('radio', { name: source.name, exact: true }).check(); await editor.getByLabel('再利用方式', { exact: true }).selectOption(mode);
    if (mode === 'override') await editor.getByRole('group', { name: '使用先の入力で上書きする項目' }).getByRole('checkbox', { name: '本文', exact: true }).check();
    await editor.getByRole('button', { name: '共通元の更新差分と影響を確認', exact: true }).click(); await editor.getByRole('button', { name: '確認した再利用を保存', exact: true }).click(); await expect(editor).toContainText('固定版と再利用を端末内に保存しました。');
    if (!fixed) fixed = await editor.getByLabel('共通元の版', { exact: true }).inputValue();
    await editor.getByRole('tab', { name: '本文', exact: true }).click(); await expect(editor.getByRole('textbox', { name: '本文', exact: true })).toHaveValue(mode === 'override' ? '使用先Uの本文' : '旧版😀の共通本文');
    if (mode === 'reference') await expect(editor.getByRole('textbox', { name: '本文', exact: true })).toBeDisabled(); else await expect(editor.getByRole('textbox', { name: '本文', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  }
  let editor = await open(page, source.name); await editor.getByRole('tab', { name: '本文', exact: true }).click(); await editor.getByRole('textbox', { name: '本文', exact: true }).fill('改稿したCの本文'); await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み'); await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click(); await page.reload();
  for (const [owner, expected] of [[s, '旧版😀の共通本文'], [t, '旧版😀の共通本文'], [u, '使用先Uの本文']] as const) { editor = await open(page, owner.name); await editor.getByRole('tab', { name: '本文', exact: true }).click(); await expect(editor.getByRole('textbox', { name: '本文', exact: true })).toHaveValue(expected); await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click(); }
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click(); await page.getByRole('button', { name: '試読を始める', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('旧版😀の共通本文'); await page.getByRole('button', { name: '共通本文から終わる', exact: true }).click(); await expect(page.locator('.reader-sheet h2')).toHaveText('再利用試読の終端'); await page.getByRole('button', { name: '一手戻る', exact: true }).click(); await expect(page.locator('.reader-sheet')).toContainText('旧版😀の共通本文');
  editor = await open(page, s.name); await editor.locator('summary').filter({ hasText: '共通元の固定参照・複製・部分上書き' }).click(); await editor.getByLabel('共通元の版', { exact: true }).selectOption(''); await editor.getByRole('button', { name: '共通元の更新差分と影響を確認', exact: true }).click(); await expect(editor).toContainText('共通元の変更項目: 本文'); await expect(editor).toContainText('再利用先 3件'); await editor.getByRole('button', { name: '確認した再利用を保存', exact: true }).click(); await expect(editor).toContainText('固定版と再利用を端末内に保存しました。'); await expect(editor.getByRole('textbox', { name: '本文', exact: true })).toHaveValue('改稿したCの本文');
});

test('多重固定参照を完全保存から再読込し、旧本文の固定リンクと元のUnicode位置へ戻る', async ({ page }) => {
  let project = createProject('多重固定参照の表示');
  const note = createEntity(project.projectId, 'note', '旧版の参照先', { body: [{ id: newId(), kind: 'paragraph', text: '旧版に固定した別位置' }] });
  const prefix = '内側固定本文🌸 · ', label = '旧版の参照先へ';
  const inner = createEntity(project.projectId, 'scene', '内側本文', { body: [{ id: newId(), kind: 'paragraph', text: prefix + label, links: [{ start: Array.from(prefix).length, end: Array.from(prefix + label).length, target: { entityId: note.id } }] }] });
  const outer = createEntity(project.projectId, 'scene', '外側共通元');
  project.entities.push(note, inner, outer);
  project = (await prepareReuse(project, { ownerId: outer.id, sourceId: inner.id, mode: 'reference' })).candidate;
  project = await createWorldSnapshot(project, '外側共通元の固定版');
  const version = project.snapshots.at(-1)!.id;
  project.entities = project.entities.map(entity => entity.id === note.id ? { ...note, data: { ...note.data, body: [{ id: newId(), kind: 'paragraph', text: '現在稿の別位置' }] } } : entity);
  const entrance = createEntity(project.projectId, 'scene', '固定リンク入口', { body: [{ id: newId(), kind: 'paragraph', text: '外側固定版へ', links: [{ start: 0, end: 6, target: { entityId: outer.id, sourceVersionId: version } }] }] });
  project.entities.push(entrance);
  await seed(page, project); await page.reload();
  const editor = await open(page, entrance.name); await editor.getByRole('tab', { name: '確認表示', exact: true }).click();
  await editor.getByRole('button', { name: '外側固定版へ', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '固定版の参照先', exact: true });
  await expect(dialog).toContainText(prefix); await expect(dialog).toContainText('外側共通元の固定版');
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toContainText('旧版に固定した別位置'); await expect(dialog).not.toContainText('現在稿の別位置');
  await dialog.getByRole('button', { name: '前の固定参照位置へ戻る', exact: true }).click();
  await expect(dialog).toContainText(prefix); await expect(dialog).toContainText('外側共通元の固定版');
});
