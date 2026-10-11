import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { dialogueContentHash } from '../../src/domain/production';
import { prepareAsset } from '../../src/domain/attachments';
import { exportScenario } from '../../src/storage/archive';
import { sha256 } from '../../src/storage/json';
import type { ProjectData } from '../../src/domain/types';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// Budget for multi-step UI/cold/file checks; original acceptance limits stay unchanged.
test.setTimeout(180_000);

async function saveEditor(page: Page) {
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.detail-panel .editor-save-state')).toContainText('端末内保存済み');
}

async function lineChange(page: Page, mode: 'copy' | 'split', reason: string, offset?: string) {
  const tools = page.locator('.production-tools');
  if (await tools.getAttribute('open') === null) await tools.locator('summary').click();
  await tools.getByLabel('台詞の変更方法', { exact: true }).selectOption(mode);
  if (offset !== undefined) await tools.getByLabel('分割する文字位置', { exact: true }).fill(offset);
  await tools.getByLabel('台詞変更の理由', { exact: true }).fill(reason);
  await tools.getByRole('button', { name: '変更の影響を確認', exact: true }).click();
  await expect(tools).toContainText(mode === 'split' ? '新台詞 2件' : '新台詞 1件');
  await tools.getByRole('button', { name: '確認した変更を保存', exact: true }).click();
  await expect(tools.getByRole('status').filter({ hasText: '表示版を確認' })).toBeVisible();
}

// The manifest hash is recomputed so rejection is about reused stable IDs,
// rather than a corrupt ZIP or stale hash. This file is offered to the normal
// import dialog; it never mutates the application's native author records.
async function duplicateLineIdArchive(bytes: Uint8Array, retainedId: string, duplicateId: string) {
  const files = unzipSync(bytes);
  const p = JSON.parse(strFromU8(files['data/project.json'])) as ProjectData;
  const reused = p.entities.find(e => e.id === duplicateId)!;
  reused.id = retainedId;
  files['data/project.json'] = strToU8(JSON.stringify(p));
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { files: { path: string; byteSize: number; sha256: string }[] };
  const entry = manifest.files.find(file => file.path === 'data/project.json')!;
  entry.byteSize = files['data/project.json'].byteLength;
  entry.sha256 = await sha256(files['data/project.json']);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files);
}

test('AT-F21 L1/L2と実音声・翻訳・外部参照を保ち、話者改名/並替え/編集/複製/分割後の旧新IDを通常保存する', async ({ page }, info) => {
  const p = createProject('AT-F21 台詞IDと制作対応');
  const speaker = createEntity(p.projectId, 'character', '元の話者');
  const l1 = createEntity(p.projectId, 'dialogue_line', 'L1', { speakerId: speaker.id, text: textToRichText('第一台詞。前半と後半。') });
  const l2 = createEntity(p.projectId, 'dialogue_line', 'L2', { speakerId: speaker.id, text: textToRichText('第二台詞はそのまま。') });
  const scene = createEntity(p.projectId, 'scene', 'L1とL2の場面', { dialogueLineIds: [l1.id, l2.id] });
  const wav = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '台詞の実音声.wav');
  const { bytes: wavBytes, preview: _preview, ...metadata } = wav;
  const audio1 = createEntity(p.projectId, 'attachment', 'L1の音声', { ...metadata, stage: 'final' });
  const audio2 = createEntity(p.projectId, 'attachment', 'L2の音声', { ...metadata, stage: 'final' });
  p.entities.push(speaker, l1, l2, scene, audio1, audio2);
  const sourceHash1 = await dialogueContentHash(p, l1), sourceHash2 = await dialogueContentHash(p, l2);
  const translation1 = createEntity(p.projectId, 'localization', 'L1の翻訳', { sourceLineId: l1.id, language: 'en', sourceHash: sourceHash1, text: textToRichText('First line, both halves.'), stage: 'reviewed' });
  const translation2 = createEntity(p.projectId, 'localization', 'L2の翻訳', { sourceLineId: l2.id, language: 'en', sourceHash: sourceHash2, text: textToRichText('Second line remains.'), stage: 'reviewed' });
  const recording1 = createEntity(p.projectId, 'recording', 'L1の収録', { sourceLineId: l1.id, language: 'ja', sourceHash: sourceHash1, translationId: translation1.id, attachmentId: audio1.id, stage: 'reviewed' });
  const recording2 = createEntity(p.projectId, 'recording', 'L2の収録', { sourceLineId: l2.id, language: 'ja', sourceHash: sourceHash2, translationId: translation2.id, attachmentId: audio2.id, stage: 'reviewed' });
  const external1 = createEntity(p.projectId, 'note', 'ゲーム側L1対応', { body: textToRichText('ゲームの会話表 row-L1 に対応する。') });
  const external2 = createEntity(p.projectId, 'note', 'ゲーム側L2対応', { body: textToRichText('ゲームの会話表 row-L2 に対応する。') });
  external1.customValues.gameLineReference = { type: 'ref', value: l1.id };
  external2.customValues.gameLineReference = { type: 'ref', value: l2.id };
  p.entities.push(translation1, translation2, recording1, recording2, external1, external2);
  p.entities.forEach(e => { e.status = 'confirmed'; });
  const bytes = await exportScenario(p, { loadAsset: hash => hash === wav.contentHash ? wavBytes : undefined });
  await attachGiven(info, 'AT-F21', bytes, { speakerId: speaker.id, lineIds: [l1.id, l2.id], translationIds: [translation1.id, translation2.id], recordingIds: [recording1.id, recording2.id], audioIds: [audio1.id, audio2.id], sourceHashes: [sourceHash1, sourceHash2], externalReferenceIds: [external1.id, external2.id], wavSha256: wav.contentHash });
  await seed(page, bytes);
  await openEntity(page, 'character', speaker.name);
  await page.locator('#entity-name').fill('改名した同じ話者'); await saveEditor(page);
  await openEntity(page, 'scene', scene.name);
  const editor = page.locator('.detail-panel');
  await editor.getByRole('tab', { name: '詳細', exact: true }).click();
  await editor.locator('[data-field="dialogueLineIds"]').getByRole('button', { name: '2番を前へ移動', exact: true }).click();
  await saveEditor(page);
  const reordered = await backup(page);
  expect(reordered.project.entities.find(e => e.id === scene.id)).toMatchObject({ data: { dialogueLineIds: [l2.id, l1.id] } });
  for (const given of [translation1, translation2, recording1, recording2, external1, external2]) {
    const actual = reordered.project.entities.find(e => e.id === given.id)!;
    expect(actual.data).toEqual(given.data); expect(actual.customValues).toEqual(given.customValues);
  }
  for (const [line, hash] of [[l1, sourceHash1], [l2, sourceHash2]] as const) {
    const actual = reordered.project.entities.find(e => e.id === line.id)!;
    if (actual.kind !== 'dialogue_line') throw new Error('元台詞がありません');
    expect(await dialogueContentHash(reordered.project, actual)).toBe(hash);
    await openEntity(page, 'dialogue_line', line.name);
    await expect(editor).toContainText('改名した同じ話者');
  }
  await openEntity(page, 'dialogue_line', l1.name);
  await editor.getByRole('textbox', { name: '台詞', exact: true }).fill('第一台詞を編集した。後半も保持する。');
  await saveEditor(page);
  const edited = await backup(page);
  expect(edited.project.entities.find(e => e.id === l1.id)).toMatchObject({ data: { text: [{ id: l1.data.text[0].id, text: '第一台詞を編集した。後半も保持する。' }] } });
  expect(edited.project.entities.find(e => e.id === l2.id)?.data).toEqual(l2.data);
  for (const deliverable of [translation1, recording1]) expect(edited.project.entities.find(e => e.id === deliverable.id)).toMatchObject({ data: { sourceLineId: l1.id, sourceHash: sourceHash1, stage: 'needs_review' } });
  for (const deliverable of [translation2, recording2]) expect(edited.project.entities.find(e => e.id === deliverable.id)?.data).toEqual(deliverable.data);

  await openEntity(page, 'dialogue_line', l1.name);
  await lineChange(page, 'copy', '独立した読み上げ案を比較する');
  const copied = await backup(page);
  const copy = copied.project.entities.find(e => e.kind === 'dialogue_line' && e.data.lineage?.mode === 'copy' && e.data.originLineIds?.includes(l1.id));
  expect(copy?.kind).toBe('dialogue_line');
  if (!copy || copy.kind !== 'dialogue_line') throw new Error('新IDの独立複製がありません');
  expect(copy.id).not.toBe(l1.id); expect(copy.id).not.toBe(l2.id);
  expect(copy.data.text[0].id).not.toBe(l1.data.text[0].id);
  expect(copy.data.lineage?.segments[0].source.entityId).toBe(l1.id);
  expect(copy.data.lineage?.segments[0].target.entityId).toBe(copy.id);
  expect(copied.project.entities.find(e => e.id === scene.id)).toMatchObject({ data: { dialogueLineIds: [l2.id, l1.id] } });
  await openEntity(page, 'dialogue_line', l1.name);
  await lineChange(page, 'split', '収録単位を前半と後半へ分ける', '6');
  await page.reload();
  const saved = await backup(page);
  const old = saved.project.entities.find(e => e.id === l1.id);
  expect(old?.kind).toBe('dialogue_line');
  if (!old || old.kind !== 'dialogue_line') throw new Error('分割元の台詞がありません');
  const splitIds = old.data.replacedByLineIds!;
  expect(old.status).toBe('rejected'); expect(splitIds).toHaveLength(2);
  expect(new Set([l1.id, l2.id, copy.id, ...splitIds]).size).toBe(5);
  const parts = splitIds.map(id => saved.project.entities.find(e => e.id === id)!);
  const originalText = '第一台詞を編集した。後半も保持する。';
  expect(parts.map(line => line.kind === 'dialogue_line' ? line.data.text.map(b => b.text).join('\n') : '').join('')).toBe(originalText);
  for (const line of parts) {
    if (line.kind !== 'dialogue_line') throw new Error('分割先の台詞がありません');
    expect(line.data.originLineIds).toContain(l1.id);
    expect(line.data.lineage).toMatchObject({ mode: 'split', reason: '収録単位を前半と後半へ分ける' });
    expect(line.data.lineage!.segments.every(segment => segment.source.entityId === l1.id && segment.target.entityId === line.id)).toBe(true);
  }
  expect(saved.project.entities.find(e => e.id === scene.id)).toMatchObject({ data: { dialogueLineIds: [l2.id, ...splitIds] } });
  for (const given of [external1, external2]) expect(saved.project.entities.find(e => e.id === given.id)?.customValues).toEqual(given.customValues);
  expect(saved.project.entities.find(e => e.id === recording1.id)).toMatchObject({ data: { sourceLineId: l1.id, attachmentId: audio1.id, stage: 'needs_review' } });
  expect(saved.project.entities.find(e => e.id === recording2.id)?.data).toEqual(recording2.data);
  expect(saved.assets).toHaveLength(1); expect(saved.assets[0].bytes).toEqual(wavBytes);

  const invalid = await duplicateLineIdArchive(saved.bytes, l2.id, copy.id);
  const nativeBefore = await authorFingerprint(page);
  await page.locator('.project-switch').click();
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: '作品ファイルを読み込む', exact: true });
  await importDialog.locator('input[type=file]').setInputFiles({ name: '台詞ID再利用.scenario', mimeType: 'application/zip', buffer: Buffer.from(invalid) });
  await expect(importDialog.getByRole('alert')).toContainText(/重複|一意/);
  await expect(importDialog.getByRole('button', { name: 'この内容で復元する', exact: true })).toHaveCount(0);
  expect(await authorFingerprint(page)).toBe(nativeBefore);
  await importDialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: p.name }).click();
  await page.reload();
  const afterReject = await backup(page);
  expect(afterReject.project).toEqual(saved.project);
  await attachObservation(info, 'AT-F21-observed', { originalLineIds: [l1.id, l2.id], editedBlockId: l1.data.text[0].id, copiedLineId: copy.id, splitLineIds: splitIds, finalSceneOrder: [l2.id, ...splitIds], audioIds: [audio1.id, audio2.id], wavSha256: wav.contentHash, duplicateArchiveHadValidManifestHash: true, duplicateImportPreservedNativeRecords: true, revision: saved.project.revision });
});
