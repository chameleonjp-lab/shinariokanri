import { expect, test } from '@playwright/test';
import { createEntity, createProject, newId } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

test('CP02 cold復元のID検査が終わるまで影響確認を待ち、検査後に同じ入力で確認できる', async ({ page }) => {
  const destination = createProject('ID検査を待つ統合先');
  await seed(page, await exportScenario(destination));
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const source = createProject('ID検査を待つ復元元');
  source.entities.push(createEntity(source.projectId, 'note', '対応を保持するメモ'));
  await page.locator('input[type=file]').setInputFiles({ name: 'source.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(source)) });
  await page.getByLabel('復元方法', { exact: true }).selectOption('mapped_merge');
  await page.getByLabel('復元する対象作品', { exact: true }).selectOption(destination.projectId);
  await page.getByRole('button', { name: '全IDへ新しい対応先を用意', exact: true }).click();
  await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
  await page.locator('.import-preview details summary').first().click();
  await page.locator('select[aria-label$="の統合方法"]').first().selectOption('existing');
  await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled();
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    const held: (() => void)[] = [];
    Worker.prototype.postMessage = function (message: any, options?: Transferable[] | StructuredSerializeOptions) {
      if (message?.type === 'import-work' && message.work?.step === 'ids') {
        held.push(() => Reflect.apply(post, this, [message, options]));
      } else Reflect.apply(post, this, [message, options]);
    };
    Reflect.set(window, '__heldImportIds', () => held.length);
    Reflect.set(window, '__releaseImportIds', () => { for (const release of held.splice(0)) release(); });
  });
  await page.reload();
  await expect(page.getByText('元ファイルとID対応の入力を再開しました。対象版の影響を再確認してください。')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__heldImportIds')())).toBe(1);
  const before = await authorFingerprint(page);
  const preview = page.getByRole('button', { name: '復元の影響を確認', exact: true });
  await expect(preview).toBeDisabled();
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeDisabled();
  await page.evaluate(() => Reflect.get(window, '__releaseImportIds')());
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled();
  expect(await authorFingerprint(page)).toBe(before);
});

test('CP03 遅い保存失敗の焦点移動がJSON訂正を奪わず、保存済み内容への復帰は履歴を増やさない', async ({ page }) => {
  const project = createProject('保存失敗後の訂正を保持');
  const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry' });
  const end = createEntity(project.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '終了' });
  const edge = createEntity(project.projectId, 'flow_edge', '訂正する線', { fromId: entry.id, toId: end.id });
  project.entities.push(entry, end, edge);
  await seed(page, await exportScenario(project));
  await openEntity(page, 'flow_edge', edge.name);
  const details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
  await details.locator('summary').click();
  const raw = details.getByRole('textbox', { name: '詳細データ', exact: true });
  const original = JSON.parse(await raw.inputValue());
  const before = await authorFingerprint(page);
  await raw.fill(JSON.stringify({ ...original, toId: newId() }, null, 2));
  // Delay rendering callbacks, as in the existing saved-cursor race case.
  // This retains the real invalid reference and the ordinary manual save.
  await page.evaluate(() => {
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    const held = new Map<number, FrameRequestCallback>(); let next = -1;
    window.requestAnimationFrame = callback => { const id = next--; held.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { if (!held.delete(id)) cancel(id); };
    Reflect.set(window, '__heldFailureFrames', () => held.size);
    Reflect.set(window, '__releaseFailureFrames', () => {
      window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel;
      for (const callback of held.values()) callback(performance.now()); held.clear();
    });
  });
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel').getByRole('alert')).toContainText(/参照|存在/);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__heldFailureFrames')())).toBeGreaterThan(0);
  expect(await authorFingerprint(page)).toBe(before);
  await raw.focus();
  await raw.press('ControlOrMeta+A');
  await page.evaluate(() => Reflect.get(window, '__releaseFailureFrames')());
  await expect(raw).toBeFocused();
  await page.keyboard.insertText(JSON.stringify(original, null, 2));
  await expect(raw).toHaveValue(JSON.stringify(original, null, 2));
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  expect(await authorFingerprint(page)).toBe(before);
  await page.reload();
  const restored = await backup(page);
  expect(restored.project.entities.find(entity => entity.id === edge.id)?.data).toEqual(edge.data);
  expect(restored.project.history).toEqual(project.history);
});
