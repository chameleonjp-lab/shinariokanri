import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { preparePartialCheckpoint } from '../../src/domain/checkpoints';
import { dialogueContentHash } from '../../src/domain/production';
import { prepareAsset } from '../../src/domain/attachments';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}

test('AT-F15 鍵あり好感度5・欠落・旧版の元checkpointを通常画面で開始し、戻りと部分証跡と移行確認を比較する', async ({ page }, info) => {
  const p = createProject('AT-F15 途中開始と不足値');
  const key = createEntity(p.projectId, 'item', '鍵', { itemMode: 'type' });
  const affection = createEntity(p.projectId, 'variable', '好感度', { key: 'affection', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 }, scope: 'run' });
  const scene = createEntity(p.projectId, 'scene', '鍵のある入口', { body: textToRichText('旧版の入口本文。') });
  const entry = createEntity(p.projectId, 'flow_node', '途中開始の入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '好感度5で開く終端', { nodeType: 'terminal', terminalReason: '鍵と好感度を確認した' });
  const edge = createEntity(p.projectId, 'flow_edge', '鍵と好感度5で進む', { fromId: entry.id, toId: end.id, label: '鍵と好感度5で進む', condition: { op: 'all', children: [{ op: 'item', itemId: key.id, quantity: 1 }, { op: 'compare', variableId: affection.id, comparator: 'ge', value: { type: 'integer', value: 5 } }] } });
  p.entities.push(key, affection, scene, entry, end, edge);
  p.entities.forEach(e => { e.status = 'confirmed'; });
  const old = await preparePartialCheckpoint(p, { entryId: entry.id });
  old.checkpoint.name = '別版の鍵あり好感度5';
  old.checkpoint.data.runtimeState.variableValues[affection.id] = { type: 'integer', value: 5 };
  old.checkpoint.data.runtimeState.itemInstances = [{ instanceId: key.id, typeId: key.id, quantity: 1, ownerId: null, locationId: null, consumed: false }];
  p.entities.push(old.checkpoint); p.snapshots.push(...old.snapshots);
  scene.data.body[0].text = '現行版の入口本文。';
  const complete = await preparePartialCheckpoint(p, { entryId: entry.id });
  complete.checkpoint.name = '鍵あり好感度5';
  complete.checkpoint.data.runtimeState.variableValues[affection.id] = { type: 'integer', value: 5 };
  complete.checkpoint.data.runtimeState.itemInstances = structuredClone(old.checkpoint.data.runtimeState.itemInstances);
  const missing = structuredClone(complete.checkpoint);
  missing.id = newId(); missing.name = '好感度の初期値欠落';
  delete missing.data.runtimeState.variableValues[affection.id];
  p.entities.push(complete.checkpoint, missing); p.snapshots.push(...complete.snapshots);
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F15', bytes, { completeCheckpointId: complete.checkpoint.id, missingCheckpointId: missing.id, oldCheckpointId: old.checkpoint.id, keyId: key.id, affectionId: affection.id, completeState: complete.checkpoint.data.runtimeState, missingState: missing.data.runtimeState, oldVersionId: old.checkpoint.data.contentVersionId, currentVersionId: complete.checkpoint.data.contentVersionId });
  await seed(page, bytes); await reader(page);
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(complete.checkpoint.data.contentVersionId);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByLabel('保存した開始状態', { exact: true }).selectOption(complete.checkpoint.id);
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('途中開始の経路');
  await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('5');
  await expect(page.locator('.reader-state-counts')).toContainText('1個');
  await page.getByRole('button', { name: '鍵と好感度5で進む', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('意図した終端');
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.locator('.reader-page')).toContainText('保存');
  await page.getByRole('button', { name: '一手戻る', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('現行版の入口本文。');
  await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('5');
  await expect(page.locator('.reader-state-counts')).toContainText('1個');

  // Recording reopens the saved trace in its own immutable edition. Return to
  // the fixture edition before selecting the other original checkpoint.
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(complete.checkpoint.data.contentVersionId);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByLabel('保存した開始状態', { exact: true }).selectOption(missing.id);
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('途中開始の経路');
  await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('未設定');
  const unknownChoice = page.locator('.reader-choice').filter({ hasText: '鍵と好感度5で進む' });
  await expect(unknownChoice).toContainText('未確認');
  await expect(unknownChoice).toBeDisabled();
  await page.getByLabel('保存した開始状態', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('初期状態からの経路');
  await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('0');
  await expect(unknownChoice).toContainText('条件を満たしていません');

  await page.getByLabel('試読する作品版', { exact: true }).selectOption(old.checkpoint.data.contentVersionId);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByLabel('保存した開始状態', { exact: true }).selectOption(old.checkpoint.id);
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('旧版の入口本文。');
  await expect(page.locator('.runtime-variable').filter({ hasText: '好感度' })).toContainText('5');
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(complete.checkpoint.data.contentVersionId);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('現行版の入口本文。');

  // A foreign edition is not offered as a compatible checkpoint. The ordinary
  // migration UI is the only way to request its state in this target edition.
  await expect(page.getByLabel('保存した開始状態', { exact: true }).locator(`option[value="${old.checkpoint.id}"]`)).toHaveCount(0);
  const beforeMigration = await authorFingerprint(page);
  const tool = page.getByRole('region', { name: '開始版の移行と経路の再確認' });
  await tool.locator('summary').filter({ hasText: '別版の開始状態を移行する' }).click();
  await tool.getByRole('radio', { name: /別版の鍵あり好感度5/ }).check();
  await tool.getByRole('button', { name: '開始状態の移行差分を確認', exact: true }).click();
  await expect(tool).toContainText('宣言が同じ状態値を移行します。');
  expect(await authorFingerprint(page)).toBe(beforeMigration);
  await tool.getByRole('button', { name: '確認した状態を新しい途中開始へ移行', exact: true }).click();
  await expect(tool).toContainText('旧版の証跡も保持しています。');
  await page.reload();
  const saved = await backup(page);
  expect(saved.project.entities.find(e => e.id === old.checkpoint.id)).toEqual(p.entities.find(e => e.id === old.checkpoint.id));
  expect(saved.project.entities.find(e => e.id === missing.id)?.data).toEqual(missing.data);
  const trace = saved.project.entities.find(e => e.kind === 'trace');
  expect(trace?.kind).toBe('trace');
  if (!trace || trace.kind !== 'trace') throw new Error('途中開始からの経路記録がありません');
  const start = saved.project.entities.find(e => e.id === trace.data.startCheckpointId);
  expect(start?.kind === 'checkpoint' && start.data.runtimeState.provenance).toBe('partial');
  expect(trace.data.steps.every(step => step.before.provenance === 'partial' && step.after.provenance === 'partial')).toBe(true);
  expect(trace.data.coverage?.declaredTests.checked).toBe(0);
  const migrated = saved.project.entities.find(e => e.kind === 'checkpoint' && e.data.migration?.sourceCheckpointId === old.checkpoint.id);
  expect(migrated?.kind === 'checkpoint' && migrated.data.runtimeState.variableValues[affection.id]).toEqual({ type: 'integer', value: 5 });
  expect(migrated?.kind === 'checkpoint' && migrated.data.runtimeState.provenance).toBe('partial');
  await attachObservation(info, 'AT-F15-observed', { traceId: trace.id, traceProvenance: start?.kind === 'checkpoint' ? start.data.runtimeState.provenance : null, declaredTests: trace.data.coverage?.declaredTests, migrationCheckpointId: migrated?.id, missingValueRenderedUnknown: true, migrationPreviewWasReadOnly: true });
});

async function assignedOutput(page: Page, profileId: string, assigneeId: string) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profileId);
  await page.getByLabel('出力目的', { exact: true }).selectOption('localization');
  await page.getByLabel('制作の担当範囲', { exact: true }).selectOption(assigneeId);
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  const artifact = page.locator('.export-artifact').filter({ has: page.getByRole('heading', { name: 'localization.json', exact: true }) });
  await expect(artifact).toBeVisible();
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', { name: 'この内容を保存', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('AT-F23 確認済み翻訳と実音声を持つ原givenから、並替えのみと本文変更の担当別出力を比較する', async ({ page }, info) => {
  let p = createProject('AT-F23 原文と成果物の内容hash');
  const line = createEntity(p.projectId, 'dialogue_line', '担当の台詞', { text: textToRichText('必ず生きて戻る。') });
  const other = createEntity(p.projectId, 'dialogue_line', '担当外の台詞', { text: textToRichText('ここで待っている。') });
  const scene = createEntity(p.projectId, 'scene', '台詞の順序', { dialogueLineIds: [line.id, other.id] });
  p.entities.push(line, other, scene);
  const originalHash = await dialogueContentHash(p, line), reviewer = newId();
  const prepared = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '確認済みの台詞音声.wav');
  const { bytes: audioBytes, preview: _preview, ...metadata } = prepared;
  const audio = createEntity(p.projectId, 'attachment', '確認済みの台詞音声', metadata);
  const translation = createEntity(p.projectId, 'localization', '確認済みの英訳', { sourceLineId: line.id, language: 'en', sourceHash: originalHash, text: textToRichText('I will return alive.'), stage: 'reviewed', reviewedBy: reviewer });
  const recording = createEntity(p.projectId, 'recording', '確認済みの音声', { sourceLineId: line.id, language: 'en', sourceHash: originalHash, translationId: translation.id, attachmentId: audio.id, stage: 'reviewed', reviewedBy: reviewer });
  translation.data.recordingIds = [recording.id];
  const task = createEntity(p.projectId, 'production_task', '担当台詞の確認', { targetIds: [line.id], assigneeId: reviewer, stage: 'review', progress: 'done' });
  p.entities.push(audio, translation, recording, task);
  const included = [line, other, audio, translation, recording];
  const profile = createEntity(p.projectId, 'projection_profile', '担当別の公開範囲', { audience: '制作担当', publicTitle: '担当台詞', includedIds: included.map(e => e.id), allowedKinds: [...new Set(included.map(e => e.kind))], namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' } }, idPolicy: 'preserve', approvedAttachmentIds: [audio.id], publicTexts: { [line.id]: { text: line.data.text }, [other.id]: { text: other.data.text }, [translation.id]: { text: translation.data.text, language: 'en' }, [recording.id]: { language: 'en' }, [audio.id]: { displayName: '確認済み音声.wav' } } });
  p.entities.push(profile); p.entities.forEach(e => { e.status = 'confirmed'; });
  p = await createWorldSnapshot(p, '元翻訳と元音声を保持する固定版');
  const archive = await exportScenario(p, { loadAsset: async hash => hash === audio.data.contentHash ? audioBytes : undefined });
  await attachGiven(info, 'AT-F23', archive, { lineId: line.id, originalHash, translationId: translation.id, recordingId: recording.id, reviewerIdentityId: reviewer, audioHash: audio.data.contentHash, audioBytes: audioBytes.length, originalOrder: scene.data.dialogueLineIds, fixedHashes: p.snapshots.map(s => s.contentHash) });
  await seed(page, archive);
  const originalOutput = await assignedOutput(page, profile.id, reviewer);
  expect(originalOutput.lines.map((row: { lineId: string }) => row.lineId)).toEqual([line.id]);
  expect(originalOutput.lines[0].translations[0].stage).toBe('reviewed');
  expect(originalOutput.lines[0].recordings[0].stage).toBe('reviewed');

  await openEntity(page, 'scene', scene.name);
  await editData(page, { ...scene.data, dialogueLineIds: [other.id, line.id] });
  const reordered = await backup(page);
  const reorderedLine = reordered.project.entities.find(e => e.id === line.id)!;
  if (reorderedLine.kind !== 'dialogue_line') throw new Error('台詞がありません');
  expect(await dialogueContentHash(reordered.project, reorderedLine)).toBe(originalHash);
  expect(reordered.project.entities.find(e => e.id === translation.id)?.data).toEqual(translation.data);
  expect(reordered.project.entities.find(e => e.id === recording.id)?.data).toEqual(recording.data);
  const reorderOutput = await assignedOutput(page, profile.id, reviewer);
  expect(reorderOutput.lines).toEqual(originalOutput.lines);

  const changedText = line.data.text.map(block => ({ ...block, text: '必ず戻るという約束は撤回する。' }));
  await openEntity(page, 'dialogue_line', line.name);
  await editData(page, { ...line.data, text: changedText });
  // Public text is explicitly author approved. Update it through the normal
  // profile editor before requesting the changed source's deliverable.
  await openEntity(page, 'projection_profile', profile.name);
  await editData(page, { ...profile.data, publicTexts: { ...profile.data.publicTexts, [line.id]: { text: changedText } } });
  const changedOutput = await assignedOutput(page, profile.id, reviewer);
  expect(changedOutput.lines.map((row: { lineId: string }) => row.lineId)).toEqual([line.id]);
  expect(changedOutput.lines[0].sourceHash).not.toBe(originalOutput.lines[0].sourceHash);
  expect(changedOutput.lines[0].text.map((block: { text: string }) => block.text).join('\n')).toBe('必ず戻るという約束は撤回する。');
  expect(changedOutput.lines[0].translations[0].stage).toBe('needs_review');
  expect(changedOutput.lines[0].recordings[0].stage).toBe('needs_review');
  expect(JSON.stringify(changedOutput)).not.toContain(reviewer);
  await page.reload();
  const changed = await backup(page);
  const source = changed.project.entities.find(e => e.id === line.id)!;
  if (source.kind !== 'dialogue_line') throw new Error('変更後の台詞がありません');
  const changedHash = await dialogueContentHash(changed.project, source);
  expect(changedHash).not.toBe(originalHash);
  expect(changed.project.entities.find(e => e.id === translation.id)).toMatchObject({ data: { ...translation.data, stage: 'needs_review', sourceHash: originalHash, reviewedBy: reviewer } });
  expect(changed.project.entities.find(e => e.id === recording.id)).toMatchObject({ data: { ...recording.data, stage: 'needs_review', sourceHash: originalHash, reviewedBy: reviewer, attachmentId: audio.id, translationId: translation.id } });
  expect(changed.project.snapshots).toEqual(p.snapshots);
  expect(changed.assets.find(asset => asset.contentHash === audio.data.contentHash)?.bytes).toEqual(audioBytes);
  await attachObservation(info, 'AT-F23-observed', { originalHash, reorderHash: originalHash, changedHash, originalOutput, reorderOutput, changedOutput, preservedReviewer: reviewer, preservedAudioHash: audio.data.contentHash, preservedSnapshotHashes: changed.project.snapshots.map(s => s.contentHash) });
});
