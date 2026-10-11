import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareAsset } from '../../src/domain/attachments';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { dialogueContentHash } from '../../src/domain/production';
import type { Entity } from '../../src/domain/types';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

function lineText(records: Entity[], id: string) {
  const line = records.find(entity => entity.id === id);
  return line?.kind === 'dialogue_line' ? line.data.text[0]?.text : undefined;
}

test('AT-E08 確認済み原文・翻訳・実音声を人物改名・並替え・編集・分割・取消・単体復元まで同じ作品で追う', async ({ page }, info) => {
  let p = createProject('AT-E08 内容hashと台詞対応履歴');
  const person = createEntity(p.projectId, 'character', '改名前の話者');
  const line = createEntity(p.projectId, 'dialogue_line', '確認済み原台詞', { speakerId: person.id, text: textToRichText('必ず生きて戻る。') });
  const other = createEntity(p.projectId, 'dialogue_line', '別の台詞', { speakerId: person.id, text: textToRichText('ここで待っている。') });
  const scene = createEntity(p.projectId, 'scene', '同じ音声を取り違えない場面', { dialogueLineIds: [line.id, other.id] });
  p.entities.push(person, line, other, scene);
  const originalHash = await dialogueContentHash(p, line), reviewer = newId();
  const prepared = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '確認済み原台詞.wav');
  const { bytes: audioBytes, preview: _preview, ...metadata } = prepared;
  const audio = createEntity(p.projectId, 'attachment', '確認済み原台詞の音声bytes', metadata);
  const translation = createEntity(p.projectId, 'localization', '確認済み英訳', { sourceLineId: line.id, language: 'en', sourceHash: originalHash, text: textToRichText('I will return alive.'), stage: 'reviewed', reviewedBy: reviewer });
  const recording = createEntity(p.projectId, 'recording', '確認済み収録', { sourceLineId: line.id, language: 'en', translationId: translation.id, sourceHash: originalHash, attachmentId: audio.id, stage: 'reviewed', reviewedBy: reviewer });
  translation.data.recordingIds = [recording.id];
  p.entities.push(audio, translation, recording); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  p = await createWorldSnapshot(p, '確認済み原文・音声の固定版');
  const bytes = await exportScenario(p, { loadAsset: async hash => hash === audio.data.contentHash ? audioBytes : undefined });
  await test.step('AT-E08 given: 原文と翻訳と音声が確認済みの台詞', async () => {
    await attachGiven(info, 'AT-E08', bytes, { personId: person.id, lineId: line.id, sourceHash: originalHash, translationId: translation.id, recordingId: recording.id, reviewedBy: reviewer, audioId: audio.id, audioHash: audio.data.contentHash, audioBytes: audioBytes.length, physicalAudioListening: 'not_run: Linux decoder observation only' });
    await seed(page, bytes); await openEntity(page, 'attachment', audio.name);
    await expect(page.locator('.asset-preview audio')).toBeVisible();
    await expect.poll(() => page.locator('.asset-preview audio').evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  });
  let editedOperation = '', splitOperation = '', editedRevision = '0', splitRevision = '0', undoRevision = '0';
  let splitIds: string[] = [];
  await test.step('AT-E08 when: 改名/並替え、原文編集、分割、差戻しを行う', async () => {
    await openEntity(page, 'character', person.name);
    await page.locator('#entity-name').fill('改名した同じ話者');
    await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
    await expect(page.locator('.detail-panel')).toContainText('端末内保存済み');
    await openEntity(page, 'scene', scene.name); await editData(page, { ...scene.data, dialogueLineIds: [other.id, line.id] });
    const reordered = await backup(page);
    const reorderedLine = reordered.project.entities.find(entity => entity.id === line.id)!;
    if (reorderedLine.kind !== 'dialogue_line') throw Error('原台詞がありません');
    expect(await dialogueContentHash(reordered.project, reorderedLine)).toBe(originalHash);
    expect(reordered.project.entities.find(entity => entity.id === translation.id)?.data).toEqual(translation.data);
    expect(reordered.project.entities.find(entity => entity.id === recording.id)?.data).toEqual(recording.data);
    await openEntity(page, 'dialogue_line', line.name);
    await expect(page.locator('.detail-panel')).toContainText('改名した同じ話者');
    const changedText = line.data.text.map(block => ({ ...block, text: '必ず戻るという約束を撤回する。' }));
    await editData(page, { ...line.data, text: changedText });
    const edited = await backup(page); editedRevision = edited.project.revision;
    editedOperation = edited.project.history.find(command => lineText(command.before.entities, line.id) === line.data.text[0].text && lineText(command.after.entities, line.id) === changedText[0].text)!.operationId;
    for (const id of [translation.id, recording.id]) expect(edited.project.entities.find(entity => entity.id === id)).toMatchObject({ data: { stage: 'needs_review', sourceLineId: line.id, sourceHash: originalHash } });
    await openEntity(page, 'dialogue_line', line.name);
    const tools = page.locator('.production-tools'); await tools.locator('summary').click();
    await tools.getByLabel('分割する文字位置', { exact: true }).fill('3');
    await tools.getByLabel('台詞変更の理由', { exact: true }).fill('原台詞を二つの収録候補へ分ける');
    await tools.getByRole('button', { name: '変更の影響を確認', exact: true }).click();
    await expect(tools).toContainText('新台詞 2件');
    await tools.getByRole('button', { name: '確認した変更を保存', exact: true }).click();
    await expect(tools.getByRole('status').filter({ hasText: '表示版を確認' })).toBeVisible();
    await expect(tools).toContainText('元台詞と新台詞の対応');
    const split = await backup(page); splitRevision = split.project.revision;
    const retired = split.project.entities.find(entity => entity.id === line.id)!;
    if (retired.kind !== 'dialogue_line') throw Error('元台詞がありません');
    splitIds = retired.data.replacedByLineIds!; expect(splitIds).toHaveLength(2); expect(retired.status).toBe('rejected');
    for (const id of splitIds) {
      const child = split.project.entities.find(entity => entity.id === id)!;
      expect(child.kind).toBe('dialogue_line');
      if (child.kind !== 'dialogue_line') throw Error('分割台詞がありません');
      expect(child.data.originLineIds).toContain(line.id);
      expect(child.data.lineage?.segments.some(segment => segment.source.entityId === line.id && segment.target.entityId === id)).toBe(true);
    }
    splitOperation = split.project.history.at(-1)!.operationId;
    await page.getByRole('tab', { name: '変更履歴', exact: true }).click();
    await page.getByRole('button', { name: 'この変更を取り消す', exact: true }).click();
    await expect(page.locator('.history-page').getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
    const undone = await backup(page); undoRevision = undone.project.revision;
    expect(BigInt(undoRevision)).toBeGreaterThan(BigInt(splitRevision));
    expect(undone.project.history.at(-1)?.compensatesOperationId).toBe(splitOperation);
    expect(undone.project.entities.find(entity => entity.id === line.id)).toMatchObject({ status: 'confirmed', data: { text: changedText } });
    for (const id of [translation.id, recording.id]) expect(undone.project.entities.find(entity => entity.id === id)).toMatchObject({ data: { stage: 'needs_review' } });
  });
  await test.step('AT-E08 then: 音声取り違えがなく内容変更時だけ見直し対象となり分割対応履歴を追える', async () => {
    const saved = await backup(page);
    expect(saved.project.entities.find(entity => entity.id === recording.id)).toMatchObject({ data: { sourceLineId: line.id, translationId: translation.id, attachmentId: audio.id, sourceHash: originalHash, stage: 'needs_review' } });
    expect(saved.assets.find(asset => asset.contentHash === audio.data.contentHash)?.bytes).toEqual(audioBytes);
    const splitCommand = saved.project.history.find(command => command.operationId === splitOperation)!;
    expect(splitCommand.after.entities.find(entity => entity.id === line.id)).toMatchObject({ data: { replacedByLineIds: splitIds } });
    expect(saved.project.snapshots).toEqual(p.snapshots);
  });
  await test.step('AT-E08 negative_or_edge: 取消や単体復元も新revisionとなり古い成果物を自動確認済みにしない', async () => {
    await page.getByRole('tab', { name: '変更履歴', exact: true }).click();
    await page.locator('.history-list .reference-link').filter({ hasText: editedOperation }).click();
    await page.getByLabel('復元する時点', { exact: true }).selectOption('before');
    await page.getByLabel('単体復元する対象', { exact: true }).selectOption(line.id);
    await page.getByRole('button', { name: 'この情報だけの復元を確認', exact: true }).click();
    await page.getByRole('button', { name: 'この内容へ復元する', exact: true }).click();
    await expect(page.locator('.history-page').getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
    await page.reload(); const restored = await backup(page);
    const source = restored.project.entities.find(entity => entity.id === line.id)!;
    if (source.kind !== 'dialogue_line') throw Error('復元した原台詞がありません');
    expect(source.data.text).toEqual(line.data.text); expect(await dialogueContentHash(restored.project, source)).toBe(originalHash);
    expect(BigInt(restored.project.revision)).toBeGreaterThan(BigInt(undoRevision));
    for (const id of [translation.id, recording.id]) expect(restored.project.entities.find(entity => entity.id === id)).toMatchObject({ data: { stage: 'needs_review', sourceHash: originalHash, sourceLineId: line.id } });
    expect(restored.project.entities.find(entity => entity.id === recording.id)).toMatchObject({ data: { attachmentId: audio.id } });
    expect(restored.assets.find(asset => asset.contentHash === audio.data.contentHash)?.bytes).toEqual(audioBytes);
    expect(restored.project.history.some(command => command.operationId === splitOperation)).toBe(true);
    await attachObservation(info, 'AT-E08-observed', { personId: person.id, lineId: line.id, originalHash, splitIds, editedOperation, splitOperation, editedRevision, splitRevision, undoRevision, restoredRevision: restored.project.revision, audioId: audio.id, audioHash: audio.data.contentHash, sourceIdsRetained: true, approvalAfterUndoAndUnitRestore: 'needs_review', physicalAudioListening: 'not_run: Linux decoder observation only' });
  });
});
