import { expect, test } from '@playwright/test';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

test('AT-B23 原givenの確定リンクと履歴を保って改名・単体復元・再起動し、容量失敗は保存済みにならない', async ({ page }, info) => {
  let p = createProject('AT-B23 確定人物の改名と復元');
  const person = createEntity(p.projectId, 'character', '復元前の人物', { summary: textToRichText('確定人物の登録時要約') });
  const block = { id: newId(), kind: 'paragraph' as const, text: '復元前の人物を待つ。', links: [{ start: 0, end: 6, target: { entityId: person.id } }] };
  const scene = createEntity(p.projectId, 'scene', '人物を確定参照する場面', { body: [block], povId: person.id });
  person.status = scene.status = 'confirmed';
  p.entities.push(person, scene);
  p = await createWorldSnapshot(p, '改名前の固定版');
  await seed(page, await exportScenario(p));

  // Create the given's history through the same ordinary save used by authors.
  await openEntity(page, 'character', person.name);
  const registered = { ...person.data, summary: textToRichText('確定リンクを持つ人物の保存済み要約') };
  await editData(page, registered);
  const given = await backup(page);
  expect(given.project.history.length).toBeGreaterThan(0);
  expect(given.project.entities.find(e => e.id === person.id)?.status).toBe('confirmed');
  expect(given.project.entities.find(e => e.id === scene.id)).toMatchObject({ data: { povId: person.id, body: [block] } });
  await attachGiven(info, 'AT-B23', given.bytes, { personId: person.id, sceneId: scene.id, history: given.project.history.map(c => c.operationId), fixedHashes: given.project.snapshots.map(s => s.contentHash) });

  await openEntity(page, 'character', person.name);
  const beforeFailed = await authorFingerprint(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __ap04Quota: boolean }).__ap04Quota = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if ((window as unknown as { __ap04Quota: boolean }).__ap04Quota && this.name === 'projects') throw new DOMException('AT-B23 容量不足', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.locator('#entity-name').fill('改名した同じ人物');
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText('容量');
  await expect(page.locator('.detail-panel')).not.toContainText('端末内保存済み');
  await expect(page.locator('#entity-name')).toHaveValue('改名した同じ人物');
  expect(await authorFingerprint(page)).toBe(beforeFailed);
  await page.evaluate(() => { (window as unknown as { __ap04Quota: boolean }).__ap04Quota = false; });
  await page.locator('.editor-footer').getByRole('button', { name: '保存を再試行', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText('端末内保存済み');
  const renamed = await backup(page);
  expect(renamed.project.entities.find(e => e.id === person.id)?.name).toBe('改名した同じ人物');
  expect(renamed.project.entities.find(e => e.id === scene.id)?.data).toEqual(given.project.entities.find(e => e.id === scene.id)?.data);
  const rename = renamed.project.history.find(c => c.after.entities.find(e => e.id === person.id)?.name === '改名した同じ人物' && c.before.entities.find(e => e.id === person.id)?.name === person.name)!;
  expect(rename).toBeTruthy();

  await page.getByRole('tab', { name: '変更履歴', exact: true }).click();
  await page.locator('.history-list .reference-link').filter({ hasText: rename.operationId }).click();
  await page.getByLabel('復元する時点', { exact: true }).selectOption('before');
  await page.getByLabel('単体復元する対象', { exact: true }).selectOption(person.id);
  await page.getByRole('button', { name: 'この情報だけの復元を確認', exact: true }).click();
  await expect(page.getByRole('region', { name: '確認した復元差分' })).toContainText(person.id);
  await page.getByRole('button', { name: 'この内容へ復元する', exact: true }).click();
  await expect(page.locator('.history-page').getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
  await page.reload();
  const restored = await backup(page);
  expect(restored.project.entities.find(e => e.id === person.id)).toMatchObject({ name: person.name, data: registered });
  expect(restored.project.entities.find(e => e.id === scene.id)?.data).toEqual(given.project.entities.find(e => e.id === scene.id)?.data);
  expect(restored.project.history.length).toBeGreaterThan(renamed.project.history.length);
  expect(BigInt(restored.project.revision)).toBeGreaterThan(BigInt(renamed.project.revision));
  expect(restored.project.history.some(c => c.operationId === rename.operationId)).toBe(true);
  expect(restored.project.snapshots).toEqual(given.project.snapshots);
  await attachObservation(info, 'AT-B23-observed', { personId: person.id, renamedRevision: renamed.project.revision, restoredRevision: restored.project.revision, originalOperation: rename.operationId, restoredOperation: restored.project.history.at(-1)?.operationId, snapshotHashes: restored.project.snapshots.map(s => s.contentHash), quotaPreservedAuthorRecords: true });
});

test('AT-F26 原givenの台詞・伏線・翻訳と意味関連場面について、改名表示と死亡設定の見直しを区別する', async ({ page }, info) => {
  const p = createProject('AT-F26 人物Aの表示と意味変更');
  const person = createEntity(p.projectId, 'character', '人物A', { body: textToRichText('人物Aは生存している。') });
  const line = createEntity(p.projectId, 'dialogue_line', 'Aを参照する台詞', { speakerId: person.id, text: textToRichText('生きて戻ると約束した。') });
  const foreshadow = createEntity(p.projectId, 'foreshadow', 'Aを参照する伏線', { question: textToRichText('Aは帰ってくるか？') });
  const translation = createEntity(p.projectId, 'localization', 'Aを参照する翻訳', { sourceLineId: line.id, language: 'en', sourceHash: '0'.repeat(64), text: textToRichText('I promised to return alive.'), stage: 'draft' });
  foreshadow.customValues.characterSource = { type: 'ref', value: person.id };
  translation.customValues.characterSource = { type: 'ref', value: person.id };
  const related = createEntity(p.projectId, 'scene', '意味だけ関連する再会場面', { body: textToRichText('帰還する友人を待つ。') });
  p.entities.push(person, line, foreshadow, translation, related);
  p.entities.forEach(e => { e.status = 'confirmed'; });
  p.relations.push({ id: newId(), projectId: p.projectId, revision: '0', fromId: person.id, toId: related.id, relationType: 'related', direction: 'symmetric', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F26', bytes, { personId: person.id, directTargets: [line.id, foreshadow.id, translation.id], explicitMeaningRelationTarget: related.id });
  await seed(page, bytes);
  await openEntity(page, 'character', person.name);
  await page.locator('#entity-name').fill('改名後の人物A');
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText('端末内保存済み');
  await openEntity(page, 'dialogue_line', line.name);
  await expect(page.locator('.detail-panel')).toContainText('改名後の人物A');
  const renamed = await backup(page);
  expect(renamed.project.entities.filter(e => e.kind === 'review')).toHaveLength(0);
  for (const original of [line, foreshadow, translation, related]) expect(renamed.project.entities.find(e => e.id === original.id)?.data).toEqual(original.data);

  await openEntity(page, 'character', '改名後の人物A');
  await editData(page, { ...person.data, body: textToRichText('人物Aは死亡している。帰還しない。') });
  await page.reload();
  const changed = await backup(page);
  const reviews = changed.project.entities.filter(e => e.kind === 'review' && e.customValues['changeReview.generatedBy'] === 'semantic-change-review/v1');
  for (const target of [line, foreshadow, translation, related]) {
    const review = reviews.find(e => e.kind === 'review' && e.data.target === target.id);
    expect(review).toMatchObject({ kind: 'review', status: 'needs_review', data: { stage: 'open' } });
    expect(review?.customValues['changeReview.sourceIds']).toBe(JSON.stringify([person.id]));
    expect(changed.project.entities.find(e => e.id === target.id)?.data).toEqual(target.data);
  }
  const relationReview = reviews.find(e => e.kind === 'review' && e.data.target === related.id)!;
  if (relationReview.kind !== 'review') throw new Error('意味関連場面の見直しがありません');
  expect(relationReview.data.body.map(b => b.text).join('\n')).toContain('作者が設定した関係');
  await openEntity(page, 'review', relationReview.name);
  await expect(page.locator('.detail-panel')).toContainText('作者が設定した関係');
  await attachObservation(info, 'AT-F26-observed', { renamedRevision: renamed.project.revision, semanticRevision: changed.project.revision, sourceId: person.id, reviewIds: reviews.map(e => e.id), reviewTargets: reviews.map(e => e.kind === 'review' ? e.data.target : null), unchangedTargetBodies: true });
});
