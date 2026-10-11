import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// Repeated UI/cold/actual-file steps need an execution budget. This changes no
// acceptance performance threshold, search limit, or expected product result.
test.setTimeout(180_000);

async function catalog(page: Page, tab = '複合検索・一覧') {
  await navigate(page, /^検索/); await page.getByRole('tab', { name: tab, exact: true }).click(); return page.locator('.search-page');
}
async function undo(page: Page) {
  await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '変更履歴', exact: true }).click();
  await page.getByRole('button', { name: 'この変更を取り消す', exact: true }).click();
  await expect(page.locator('.history-page').getByRole('status').filter({ hasText: /取り消|保存|復元/ })).toBeVisible();
}
async function saveEditor(page: Page) {
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel .editor-save-state')).toContainText('端末内保存済み');
}
async function editorId(page: Page): Promise<string> {
  const identity = page.locator('.detail-panel details').filter({ has: page.locator('summary').filter({ hasText: 'IDと履歴情報' }) });
  if ((await identity.getAttribute('open')) === null) await identity.locator('summary').click();
  return (await identity.locator('.record-meta dd').first().innerText()).trim();
}

test('AT-F58 未実装かつ人物Aが出る動的一覧と固定ID一覧を場面追加後に再表示し、同じIDで三表示と一括取消/部分失敗を確認する', async ({ page }, info) => {
  const p = createProject('AT-F58 動的条件と固定ID');
  const person = createEntity(p.projectId, 'character', '一覧の参加人物A');
  const event = createEntity(p.projectId, 'event', '人物Aが出る出来事', { participants: [{ characterId: person.id, role: 'actor' }] });
  const first = createEntity(p.projectId, 'scene', '最初の未実装場面', { eventIds: [event.id], body: textToRichText('最初の未実装本文。') });
  const task = createEntity(p.projectId, 'production_task', '二場面の実装作業', { targetIds: [first.id], stage: 'implementation', progress: 'todo' });
  const query = { op: 'all' as const, children: [{ op: 'kind' as const, value: 'scene' as const }, { op: 'participant' as const, characterId: person.id }, { op: 'production' as const, value: 'todo' as const }] };
  const dynamic = createEntity(p.projectId, 'collection', '人物A・未実装の動的一覧', { mode: 'dynamic', query, memberIds: [] }), fixed = createEntity(p.projectId, 'collection', '追加前の固定ID一覧', { mode: 'fixed', query: null, memberIds: [first.id] });
  p.entities.push(person, event, first, task, dynamic, fixed); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p); await attachGiven(info, 'AT-F58', bytes, { dynamicId: dynamic.id, query, fixedId: fixed.id, fixedIds: [first.id], personId: person.id, eventId: event.id, taskId: task.id });
  await seed(page, bytes); const panel = await catalog(page);
  for (const id of [dynamic.id, fixed.id]) { await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(id); await expect(panel.locator('.entity-card')).toHaveCount(1); }
  await navigate(page, /^資料/); await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  await page.getByRole('button', { name: '場面を追加', exact: true }).click();
  await page.getByRole('dialog').getByLabel('名前', { exact: true }).fill('追加した未実装場面');
  await page.getByRole('button', { name: '編集を始める', exact: true }).click();
  const editor = page.locator('.detail-panel'); await editor.getByRole('tab', { name: '本文', exact: true }).click();
  await editor.getByRole('textbox', { name: '本文', exact: true }).fill('追加場面でも人物Aが同じ出来事に参加する。');
  await editor.getByRole('tab', { name: '詳細', exact: true }).click();
  await editor.locator('[data-field="eventIds"]').getByLabel('追加する対象', { exact: true }).selectOption(event.id); await saveEditor(page);
  const addedId = await editorId(page); expect(addedId).toBeTruthy();
  await openEntity(page, 'production_task', task.name);
  await editor.locator('[data-field="targetIds"]').getByLabel('追加する対象', { exact: true }).selectOption(addedId!); await saveEditor(page);
  await catalog(page); await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(dynamic.id);
  await expect(panel.locator('.entity-card')).toHaveCount(2);
  await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(fixed.id);
  await expect(panel.locator('.entity-card')).toHaveCount(1); await expect(panel.locator('.entity-card')).not.toContainText('追加した未実装場面');
  await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(dynamic.id);
  const beforeViews = await authorFingerprint(page), views = panel.locator('[aria-label="検索結果の表示"]');
  await views.getByRole('button', { name: 'カード', exact: true }).click();
  const cardIds: string[] = [];
  for (const name of [first.name, '追加した未実装場面']) {
    await panel.locator('.entity-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
    cardIds.push(await editorId(page));
    await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  }
  cardIds.sort();
  await views.getByRole('button', { name: '表', exact: true }).click(); await expect(panel.getByRole('table').locator('tbody tr')).toHaveCount(2);
  const tableIds: string[] = [];
  for (const name of [first.name, '追加した未実装場面']) {
    await panel.getByRole('table').locator('tbody tr').filter({ has: page.getByRole('cell', { name, exact: true }) }).getByRole('button', { name: '詳細を開く', exact: true }).click();
    tableIds.push(await editorId(page));
    await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  }
  tableIds.sort();
  await views.getByRole('button', { name: '図', exact: true }).click();
  const diagramIds = await panel.getByRole('region', { name: '同じ検索結果の図', exact: true }).locator('g[data-entity-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-entity-id')).sort());
  expect(diagramIds).toEqual([first.id, addedId].sort()); expect(cardIds).toEqual(diagramIds); expect(tableIds).toEqual(diagramIds); expect(await authorFingerprint(page)).toBe(beforeViews);
  const bulk = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: '結果をまとめて編集' }) });
  await bulk.locator('summary').click(); await bulk.getByRole('button', { name: '結果をすべて選択', exact: true }).click();
  await bulk.getByLabel('まとめて設定する状態', { exact: true }).selectOption('needs_review');
  await bulk.getByRole('button', { name: '変更差分を確認', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '変更差分の確認', exact: true });
  await expect(preview).toContainText(`${first.name}: 確定 → 確認待ち`); await expect(preview).toContainText('追加した未実装場面');
  await preview.getByRole('button', { name: '中止', exact: true }).click(); expect(await authorFingerprint(page)).toBe(beforeViews);
  await bulk.getByRole('button', { name: '変更差分を確認', exact: true }).click();
  // Fail the second selected entity write inside the real transaction, after
  // the first entity put has been submitted. No replacement native data is used.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put; let writes = 0;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'entities' && ++writes === 2) { IDBObjectStore.prototype.put = original; throw new DOMException('AT-F58 second entity write rejected', 'QuotaExceededError'); }
      return original.apply(this, args);
    };
  });
  await preview.getByRole('button', { name: '差分を確定して保存', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('容量'); await expect(preview).toBeVisible(); expect(await authorFingerprint(page)).toBe(beforeViews);
  await preview.getByRole('button', { name: '差分を確定して保存', exact: true }).click(); await expect(preview).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('一括変更を保存'); await undo(page);
  await page.reload(); const saved = await backup(page);
  expect(saved.project.entities.find(entity => entity.id === dynamic.id)?.data).toEqual(dynamic.data);
  expect(saved.project.entities.find(entity => entity.id === fixed.id)?.data).toEqual(fixed.data);
  expect(saved.project.entities.find(entity => entity.id === first.id)?.status).toBe('confirmed');
  expect(saved.project.entities.find(entity => entity.id === addedId)?.status).toBe('provisional');
  expect(saved.project.entities.find(entity => entity.id === task.id)).toMatchObject({ data: { targetIds: [first.id, addedId], progress: 'todo' } });
  await catalog(page); await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(dynamic.id); await expect(panel.locator('.entity-card')).toHaveCount(2);
  await panel.getByLabel('保存した一覧を再表示', { exact: true }).selectOption(fixed.id); await expect(panel.locator('.entity-card')).toHaveCount(1);
  await attachObservation(info, 'AT-F58-observed', { dynamicId: dynamic.id, fixedId: fixed.id, initialIds: [first.id], addedId, dynamicIds: [first.id, addedId], fixedIds: [first.id], cardIds, tableIds, diagramIds, cardTableAndDiagramIdsEqual: true, authorDataUnchangedByViews: true, canceledPreviewUnchanged: true, secondWriteFailureAtomic: true, retryAndCompensationRetainedAllIds: true, revision: saved.project.revision });
});

test('AT-F60 重複人物の残すID/参照書換えを事前確認し統合と取消を行い、背景/外部状態保持・一括取消・削除補償で元参照を残す', async ({ page }, info) => {
  let p = createProject('AT-F60 候補の統合と補償');
  const a = createEntity(p.projectId, 'character', '重複候補人物', { body: textToRichText('統合元の背景。') }), b = createEntity(p.projectId, 'character', '重複候補人物', { body: textToRichText('残す人物の背景。') });
  const event = createEntity(p.projectId, 'event', '元人物IDを参照する出来事', { participants: [{ characterId: a.id, role: 'actor' }] });
  const background = createEntity(p.projectId, 'lore', '未参照の背景設定', { body: textToRichText('参照がなくても残す背景設定。'), reading: '' });
  const external = createEntity(p.projectId, 'variable', '作品外で使う状態', { key: 'external_usage', valueType: 'boolean', initial: { type: 'boolean', value: false }, externalUseDeclared: true });
  const note = createEntity(p.projectId, 'note', '削除と補償を試す未参照情報', { body: textToRichText('削除を取り消す元段落。') });
  p.entities.push(a, b, event, background, external, note); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const row = { id: newId(), projectId: p.projectId, revision: '0', fromId: b.id, toId: a.id, relationType: 'reference', direction: 'forward' as const, validity: emptyValidity(), evidenceIds: [event.id], status: 'confirmed' as const, visibility: 'private' as const }; p.relations = [row];
  p = await createWorldSnapshot(p, '統合前の元参照固定版'); const oldPin = p.snapshots.at(-1)!;
  const bytes = await exportScenario(p); await attachGiven(info, 'AT-F60', bytes, { duplicateIds: [a.id, b.id], survivorId: b.id, eventId: event.id, relationId: row.id, backgroundId: background.id, externalVariableId: external.id, missingReadingIds: [a.id, b.id, background.id], noteId: note.id, snapshotId: oldPin.id });
  await seed(page, bytes); const panel = await catalog(page, '見直しと統合');
  await expect(panel).toContainText('名前だけで重複とは決めず'); await expect(panel).toContainText('読みが未登録です。');
  await expect(panel.locator('article').filter({ hasText: '作品外から使う状態として宣言' })).toContainText(external.name);
  const source = panel.getByLabel('統合する情報', { exact: true }), survivor = panel.getByLabel('統合後に残す情報', { exact: true });
  await source.selectOption(a.id); await survivor.selectOption(b.id);
  const before = await authorFingerprint(page);
  await panel.getByRole('button', { name: '統合差分を確認', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '変更差分の確認', exact: true });
  await expect(preview).toContainText(`残すID: ${b.id}`); await expect(preview).toContainText(event.name); await expect(preview).toContainText('data.participants[0].characterId'); await expect(preview).toContainText('参照を書換え'); await expect(preview).toContainText('保存版は変更しない');
  await preview.getByRole('button', { name: '中止', exact: true }).click(); expect(await authorFingerprint(page)).toBe(before);
  await panel.getByRole('button', { name: '統合差分を確認', exact: true }).click(); await preview.getByRole('button', { name: '差分を確定して保存', exact: true }).click(); await expect(preview).toHaveCount(0);
  const merged = await backup(page);
  expect(merged.project.entities.find(entity => entity.id === a.id)?.deletedAt).toBeTruthy();
  expect(merged.project.entities.find(entity => entity.id === event.id)).toMatchObject({ data: { participants: [{ characterId: b.id, role: 'actor' }] } });
  expect(merged.project.relations.find(relation => relation.id === row.id)).toMatchObject({ toId: b.id });
  expect(merged.project.snapshots.find(snapshot => snapshot.id === oldPin.id)).toEqual(oldPin);
  await undo(page); const restored = await backup(page);
  expect(restored.project.entities.find(entity => entity.id === a.id)?.deletedAt).toBeFalsy();
  expect(restored.project.entities.find(entity => entity.id === event.id)?.data).toEqual(event.data); expect(restored.project.relations.find(relation => relation.id === row.id)).toMatchObject({ fromId: b.id, toId: a.id });
  await catalog(page, '見直しと統合');
  const unreferenced = panel.locator('article').filter({ hasText: '有効な項目・関係・保存ビューから直接参照' }).filter({ has: page.getByRole('button', { name: background.name, exact: true }) });
  await unreferenced.getByRole('button', { name: '背景情報として保持', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('保持指定を保存');
  await openEntity(page, 'variable', external.name); await page.locator('.detail-panel').getByLabel('未参照でも保持する', { exact: true }).check(); await saveEditor(page);
  const held = await backup(page);
  expect(held.project.entities.find(entity => entity.id === background.id)?.retainIfUnreferenced).toBe(true); expect(held.project.entities.find(entity => entity.id === external.id)?.retainIfUnreferenced).toBe(true);
  expect(held.project.entities.find(entity => entity.id === external.id)?.data).toEqual(external.data);
  await catalog(page); await panel.getByLabel('情報の種類', { exact: true }).selectOption('character');
  const bulk = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: '結果をまとめて編集' }) });
  await bulk.locator('summary').click(); await bulk.getByRole('button', { name: '結果をすべて選択', exact: true }).click(); await bulk.getByLabel('まとめて設定する状態', { exact: true }).selectOption('needs_review');
  const beforeBulk = await authorFingerprint(page); await bulk.getByRole('button', { name: '変更差分を確認', exact: true }).click(); await expect(preview).toContainText('確定 → 確認待ち');
  await preview.getByRole('button', { name: '中止', exact: true }).click(); expect(await authorFingerprint(page)).toBe(beforeBulk);
  await bulk.getByRole('button', { name: '変更差分を確認', exact: true }).click(); await preview.getByRole('button', { name: '差分を確定して保存', exact: true }).click(); await expect(preview).toHaveCount(0); await undo(page);
  await openEntity(page, 'note', note.name); await page.locator('.editor-footer').getByRole('button', { name: 'アーカイブ', exact: true }).click();
  const archive = page.getByRole('dialog', { name: 'アーカイブの確認', exact: true }); await expect(archive).toContainText('固定版');
  await archive.getByRole('button', { name: 'アーカイブする', exact: true }).click(); await expect(archive).toHaveCount(0);
  const deleted = await backup(page); expect(deleted.project.entities.find(entity => entity.id === note.id)?.deletedAt).toBeTruthy(); await undo(page);
  await page.reload(); const saved = await backup(page);
  for (const original of [a, b, event, background, external, note]) { const retained = saved.project.entities.find(entity => entity.id === original.id); expect(retained?.data).toEqual(original.data); expect(retained?.deletedAt).toBeFalsy(); }
  expect(saved.project.entities.find(entity => entity.id === a.id)?.status).toBe('confirmed'); expect(saved.project.entities.find(entity => entity.id === b.id)?.status).toBe('confirmed');
  expect(saved.project.entities.find(entity => entity.id === background.id)?.retainIfUnreferenced).toBe(true); expect(saved.project.entities.find(entity => entity.id === external.id)?.retainIfUnreferenced).toBe(true);
  expect(saved.project.relations.find(relation => relation.id === row.id)).toMatchObject({ fromId: b.id, toId: a.id }); expect(saved.project.snapshots.find(snapshot => snapshot.id === oldPin.id)).toEqual(oldPin);
  expect(saved.project.history.filter(command => command.compensatesOperationId)).toHaveLength(3);
  await attachObservation(info, 'AT-F60-observed', { duplicateIds: [a.id, b.id], survivorId: b.id, referenceTargetId: a.id, eventId: event.id, relationId: row.id, originalSnapshotId: oldPin.id, retainedBackgroundId: background.id, retainedExternalId: external.id, canceledBulkNativeUnchanged: true, compensations: saved.project.history.filter(command => command.compensatesOperationId).map(command => ({ id: command.operationId, compensates: command.compensatesOperationId })), restoredNoteBlockId: note.data.body[0].id, revision: saved.project.revision });
});
