import {expect, test} from '@playwright/test';
import {createEntity, createProject, textToRichText} from '../../src/domain/model';
import {exportScenario, inspectScenario} from '../../src/storage/archive';
import {editorStateKey, editorTextFingerprint} from '../../src/ui/editorState';
import {readFile} from 'node:fs/promises';

test('a delayed saved cursor yields to a new text selection; invalid replacement stays atomic and can be corrected and cold-read', async ({page}) => {
  const project = createProject('カーソル復元中の新しい入力');
  const summary = '😀要約だけの出来事𠮷野の門が開く';
  const event = createEntity(project.projectId, 'event', '', {summary: textToRichText(summary)});
  project.entities.push(event);
  await page.goto('./');
  await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await page.locator('input[type=file]').setInputFiles({name: 'cursor.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(project))});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.sidebar').getByRole('button', {name: /^資料/}).click();
  await page.getByLabel('情報の種類', {exact: true}).selectOption('event');
  const stateKey = editorStateKey(project.projectId, event.id);
  await page.evaluate(({stateKey, summary, textHash}) => {
    localStorage.setItem(stateKey, JSON.stringify({tab: 'main', scrollTop: 0, scrollY: 0, selection: {fieldKey: 'summary', start: summary.length, end: summary.length, textHash}}));
    const nativeRequest = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
    const held = new Map<number, FrameRequestCallback>(); let next = -1;
    const scope = window as unknown as {__releaseEditorFrames: () => void; __heldEditorFrames: () => number};
    window.requestAnimationFrame = callback => {const id = next--; held.set(id, callback); return id;};
    window.cancelAnimationFrame = id => {if (!held.delete(id)) nativeCancel(id);};
    scope.__heldEditorFrames = () => held.size;
    scope.__releaseEditorFrames = () => {
      for (let round = 0; round < 2; round++) {const batch = [...held.values()]; held.clear(); for (const callback of batch) callback(performance.now());}
      window.requestAnimationFrame = nativeRequest; window.cancelAnimationFrame = nativeCancel;
      for (const callback of held.values()) nativeRequest(callback); held.clear();
    };
  }, {stateKey, summary, textHash: editorTextFingerprint(summary)});
  await page.locator('.entity-card').filter({hasText: summary}).click();
  const input = page.locator('[data-field="summary"] textarea[data-rich-text-editor]');
  await expect(input).toHaveValue(summary);
  await page.waitForFunction(() => (window as any).__heldEditorFrames() > 0);
  const durable = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {const q = indexedDB.open('scenario-manager-local-v1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);});
    try {return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
      const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'restorePoints', 'worlds', 'recoveredPending', 'recordParts'];
      const tx = db.transaction(names, 'readonly'), rows: Record<string, unknown[]> = {};
      for (const name of names) {const q = tx.objectStore(name).getAll(); q.onsuccess = () => {rows[name] = q.result;};}
      tx.oncomplete = () => resolve(rows); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    });} finally {db.close();}
  });
  const before = await durable();
  await input.focus(); await input.press('ControlOrMeta+A');
  await page.evaluate(() => (window as any).__releaseEditorFrames());
  await page.keyboard.insertText('　 ');
  await expect(input).toHaveValue('　 ');
  await page.locator('.editor-footer').getByRole('button', {name: /^(保存する|保存を再試行)$/}).click();
  await expect(page.locator('.detail-panel').getByRole('alert')).toContainText('名称または要約');
  expect(await durable()).toEqual(before);
  await input.fill(summary + '・訂正');
  await page.locator('.editor-footer').getByRole('button', {name: /^(保存する|保存を再試行)$/}).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.sidebar').getByRole('button', {name: '作品・保存', exact: true}).click();
  await page.getByRole('tab', {name: '完全保存・復元', exact: true}).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name: '完全保存ファイルを作成', exact: true}).click();
  const file = await pending, restored = (await inspectScenario(new Uint8Array(await readFile((await file.path())!)), {worker: false})).project;
  const actual = restored.entities.find(entity => entity.id === event.id)!;
  expect(actual.kind).toBe('event'); expect(actual.name).toBe('');
  if (actual.kind === 'event') {expect(actual.data.summary[0].text).toBe(summary + '・訂正'); expect(actual.data.summary[0].id).toBe(event.data.summary[0].id);}
  await test.info().attach('delayed-cursor-contract', {body: Buffer.from(JSON.stringify({layer: 'Linux production browser, native IndexedDB; not physical device', originalInputPreserved: true, delayedCursorSuperseded: true, invalidNative12TablesUnchanged: true, correctionColdAndFullExport: true, unicodeAndBlockIdPreserved: true})), contentType: 'application/json'});
});
