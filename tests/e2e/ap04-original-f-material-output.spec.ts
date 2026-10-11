import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { prepareAsset } from '../../src/domain/attachments';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario, inspectScenario } from '../../src/storage/archive';
import type { Entity, ProjectData } from '../../src/domain/types';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';
import { onePixelPng } from './ap04-original-f-assets';

// Budget for multi-step UI/cold/file checks; original acceptance limits stay unchanged.
test.setTimeout(180_000);

const pngBytes = () => onePixelPng();

async function lightBackup(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '素材bytesを除いて保存', exact: true }).click();
  const bytes = new Uint8Array(await readFile((await (await pending).path())!));
  return { bytes, ...(await inspectScenario(bytes, { worker: false })) };
}

async function output(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
}

async function outputBytes(page: Page, profile: 'reader' | 'playable_preview' | 'runtime_json' | 'production') {
  await output(page);
  await page.getByLabel('出力目的', { exact: true }).selectOption(profile);
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-result .export-artifact')).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await page.locator('.export-artifact').getByRole('button', { name: 'この内容を保存', exact: true }).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}

test('AT-F22 本文だけ/演出込みを切り替え、仮背景と欠落音楽を別表示し、素材差替えでも台詞IDを維持する', async ({ page }, info) => {
  const p = createProject('AT-F22 仮背景と欠落音楽');
  const speaker = createEntity(p.projectId, 'character', '演出の話者');
  const line = createEntity(p.projectId, 'dialogue_line', '素材がなくても読む台詞', { text: textToRichText('背景と音楽がなくてもこの本文を読める。'), speakerId: speaker.id });
  const scene = createEntity(p.projectId, 'scene', '演出を切り替える場面', { body: textToRichText('門の前で話す。'), dialogueLineIds: [line.id] });
  const chapter = createEntity(p.projectId, 'chapter', '演出の章', { sceneIds: [scene.id] }); scene.data.chapterId = chapter.id;
  const image = await prepareAsset(pngBytes(), '仮背景.png');
  const music = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '未取得の音楽.wav');
  const { bytes: _imageBytes, preview: _imagePreview, ...imageMetadata } = image;
  const { bytes: _musicBytes, preview: _musicPreview, ...musicMetadata } = music;
  const background = createEntity(p.projectId, 'attachment', '仮背景', { ...imageMetadata, stage: 'temporary' });
  const missingMusic = createEntity(p.projectId, 'attachment', '欠落している音楽', { ...musicMetadata, stage: 'final' });
  const backgroundCue = createEntity(p.projectId, 'cue', '背景と話者の演出', { anchor: { entityId: scene.id, lineId: line.id }, cueType: 'background', speakerId: speaker.id, attachmentId: background.id, waitMs: 500 });
  const musicCue = createEntity(p.projectId, 'cue', '取得前の音楽演出', { anchor: { entityId: scene.id, lineId: line.id }, cueType: 'music', attachmentId: missingMusic.id, waitMs: 250 });
  line.data.cueIds = [backgroundCue.id, musicCue.id];
  p.entities.push(speaker, line, scene, chapter, background, missingMusic, backgroundCue, musicCue);
  p.entities.forEach(e => { e.status = 'confirmed'; });
  // Missing bytes are an explicit original input condition. The normal import
  // warns that this metadata-only file cannot serve as a complete backup.
  const bytes = await exportScenario(p, { assetMode: 'metadata_only' });
  await attachGiven(info, 'AT-F22', bytes, { lineId: line.id, speakerId: speaker.id, backgroundId: background.id, backgroundStage: 'temporary', musicId: missingMusic.id, missingMusicHash: music.contentHash, waitMs: [500, 250], assetMode: 'metadata_only' });
  await seed(page, bytes);

  // Acquire only the background through the author's ordinary replacement
  // form. The music remains genuinely absent from the local asset store.
  await openEntity(page, 'attachment', background.name);
  const tools = page.locator('.production-tools');
  await tools.locator('summary').click();
  await tools.getByLabel('素材ファイルを選ぶ', { exact: true }).setInputFiles({ name: '仮背景.png', mimeType: 'image/png', buffer: Buffer.from(image.bytes) });
  await tools.getByRole('checkbox', { name: backgroundCue.name, exact: true }).check();
  await tools.getByRole('button', { name: '変更の影響を確認', exact: true }).click();
  await tools.getByRole('button', { name: '確認した変更を保存', exact: true }).click();
  await expect(tools.getByRole('status').filter({ hasText: '表示版を確認' })).toBeVisible();
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '章の試読', exact: true }).click();
  const reading = page.getByRole('region', { name: '章順・選択経路の通読', exact: true });
  await reading.getByRole('button', { name: '記録付き読書を始める', exact: true }).click();
  await reading.getByRole('button', { name: '次の場面を提示', exact: true }).click();
  await expect(reading.getByRole('region', { name: '場面の台詞', exact: true })).toContainText('背景と音楽がなくてもこの本文を読める。');
  const cues = reading.locator('.presentation-cues');
  await cues.getByLabel('演出・絵コンテを表示', { exact: true }).uncheck();
  await expect(cues.locator('article')).toHaveCount(0);
  await cues.getByLabel('演出・絵コンテを表示', { exact: true }).check();
  await expect(cues).toContainText('演出 2件');
  await expect(cues).toContainText('演出の話者'); await expect(cues).toContainText('間 500 ms');
  await expect(cues).toContainText('仮素材');
  await expect(cues).toContainText('完成素材');
  await expect(cues).toContainText('この端末には素材bytesがありません。');
  await expect(cues.locator('img')).toBeVisible();
  await expect.poll(() => cues.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await cues.getByLabel('演出・絵コンテを表示', { exact: true }).uncheck();
  await expect(reading.getByRole('region', { name: '場面の台詞', exact: true })).toContainText('背景と音楽がなくてもこの本文を読める。');
  await page.getByRole('tab', { name: '制作', exact: true }).click();
  const materials = page.locator('.production-review');
  await expect(materials).toContainText('bytes不足 1件');
  await expect(materials.locator('p').filter({ has: page.getByRole('button', { name: missingMusic.name, exact: true }) })).toContainText('完成素材 · bytes不足');
  await expect(materials.locator('p').filter({ has: page.getByRole('button', { name: background.name, exact: true }) })).toContainText('仮素材 · bytesあり');
  await page.reload();
  const saved = await lightBackup(page);
  expect(saved.manifest.assetMode).toBe('metadata_only');
  expect(saved.project.entities.find(e => e.id === line.id)?.data).toEqual(line.data);
  const replacement = saved.project.entities.find(e => e.kind === 'attachment' && e.data.revisionHistory?.includes(background.id));
  expect(replacement?.id).not.toBe(background.id);
  expect(saved.project.entities.find(e => e.id === backgroundCue.id)).toMatchObject({ data: { attachmentId: replacement!.id, speakerId: speaker.id, waitMs: 500 } });
  expect(saved.project.entities.find(e => e.id === musicCue.id)?.data).toEqual(musicCue.data);
  const nativeBefore = await authorFingerprint(page);
  let unexpectedDownloads = 0;
  const onDownload = () => { unexpectedDownloads++; };
  page.on('download', onDownload);
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText(/素材|添付/);
  page.off('download', onDownload);
  expect(unexpectedDownloads).toBe(0); expect(await authorFingerprint(page)).toBe(nativeBefore);
  await attachObservation(info, 'AT-F22-observed', { lineId: line.id, oldBackgroundId: background.id, replacementBackgroundId: replacement!.id, missingMusicId: missingMusic.id, musicBytesStillAbsent: true, metadataOnlyNotClaimedComplete: true, fullExportRefusedWithoutDownload: true, revision: saved.project.revision });
});

function fixturePublicPolicy(p: ProjectData, selected: Entity[]) {
  const publicTexts: Record<string, Record<string, unknown>> = {};
  const blockSources: Record<string, string> = {};
  for (const entity of selected) {
    const output: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(entity.data)) {
      if (value == null || !['summary', 'body', 'text', 'key', 'label', 'terminalReason', 'description', 'displayName', 'locator', 'excerptLocation', 'interpretation'].includes(field)) continue;
      const copy = structuredClone(value);
      if (Array.isArray(copy)) for (const block of copy) if (block && typeof block.id === 'string' && typeof block.text === 'string') { const origin = block.id; block.id = newId(); blockSources[block.id] = origin; }
      output[field] = copy;
    }
    publicTexts[entity.id] = output;
  }
  const profile = createEntity(p.projectId, 'projection_profile', '公開名で読む資料', { audience: 'reader', publicTitle: '公開名の物語', includedIds: selected.map(e => e.id), allowedKinds: [...new Set(selected.map(e => e.kind))], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '確認済みの公開名' } }, publicTexts, blockSources, approvedAttachmentIds: selected.filter(e => e.kind === 'attachment').map(e => e.id) });
  profile.status = 'confirmed'; p.entities.push(profile); return profile;
}

test('AT-F24 完全保存は作者メモ・没案・実添付を保ち、reader/playable/runtimeを選び秘密除外と未対応外部型の拒否を観測する', async ({ page, browser }, info) => {
  let p = createProject('AT-F24 保存と公開の各プロファイル');
  const scene = createEntity(p.projectId, 'scene', '正本の公開名', { body: textToRichText('公開する正本本文。'), authorNotes: textToRichText('作者だけの秘密メモ: 隠れた黒幕') });
  const rejected = createEntity(p.projectId, 'scene', '消さない没案', { body: textToRichText('没案にだけある別結末。') }); rejected.status = 'rejected';
  const entry = createEntity(p.projectId, 'flow_node', '公開の選択入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '公開の終わり', { nodeType: 'terminal', terminalReason: '正本を読み終えた' });
  const edge = createEntity(p.projectId, 'flow_edge', '選択して終わる', { fromId: entry.id, toId: end.id, edgeType: 'choice', label: '選択して終わる' });
  const graph = createEntity(p.projectId, 'flow_graph', '公開の分岐', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  const contract = createEntity(p.projectId, 'external_contract', '未対応のゲーム外部値', { key: 'external_text_result', owner: 'game', inputType: 'text', outputType: 'text', missingPolicy: 'unknown', version: '1.0.0', stubValues: [{ type: 'text', value: '未知の結果' }], description: textToRichText('制作側ではこの文字列外部応答へ対応していない。') });
  const png = await prepareAsset(pngBytes(), '公開画像.png');
  const wav = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '公開音声.wav');
  const { bytes: imageBytes, preview: _imagePreview, ...imageMetadata } = png;
  const { bytes: soundBytes, preview: _soundPreview, ...soundMetadata } = wav;
  const image = createEntity(p.projectId, 'attachment', '公開画像', { ...imageMetadata, stage: 'final' });
  const sound = createEntity(p.projectId, 'attachment', '公開音声', { ...soundMetadata, stage: 'final' });
  p.entities.push(scene, rejected, entry, end, edge, graph, contract, image, sound);
  p.entities.filter(e => e.id !== rejected.id).forEach(e => { e.status = 'confirmed'; });
  const normalPolicy = fixturePublicPolicy(p, [scene, entry, end, edge, graph, image, sound]);
  const unsupportedPolicy = fixturePublicPolicy(p, [scene, entry, end, edge, graph, contract, image, sound]);
  unsupportedPolicy.name = '未対応外部型も含む制作範囲';
  p = await createWorldSnapshot(p, '保存と公開を比べる固定版');
  const assets: Record<string, Uint8Array> = { [png.contentHash]: imageBytes, [wav.contentHash]: soundBytes };
  const bytes = await exportScenario(p, { loadAsset: hash => assets[hash] });
  await attachGiven(info, 'AT-F24', bytes, { sceneId: scene.id, rejectedSceneId: rejected.id, branchIds: [entry.id, edge.id, end.id, graph.id], unsupportedContractId: contract.id, unsupportedType: 'text', profileIds: [normalPolicy.id, unsupportedPolicy.id], assetIds: [image.id, sound.id], assetHashes: [png.contentHash, wav.contentHash] });
  await seed(page, bytes);
  const full = await backup(page);
  expect(full.project).toEqual(p);
  expect(full.assets.map(a => a.contentHash).sort()).toEqual([png.contentHash, wav.contentHash].sort());
  for (const asset of full.assets) expect(asset.bytes).toEqual(assets[asset.contentHash]);
  const emptyContext = await browser.newContext({ baseURL: page.url() });
  try {
    const empty = await emptyContext.newPage();
    await seed(empty, full.bytes); await empty.reload();
    const restored = await backup(empty);
    expect(restored.project).toEqual(full.project);
    expect(restored.assets.map(a => ({ hash: a.contentHash, bytes: a.bytes }))).toEqual(full.assets.map(a => ({ hash: a.contentHash, bytes: a.bytes })));
  } finally { await emptyContext.close(); }
  const beforeOutputs = await authorFingerprint(page);
  await output(page);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(normalPolicy.id);
  const reader = strFromU8(await outputBytes(page, 'reader'));
  const playableFiles = unzipSync(await outputBytes(page, 'playable_preview'));
  const runtime = JSON.parse(strFromU8(await outputBytes(page, 'runtime_json')));
  for (const outputText of [reader, ...Object.values(playableFiles).filter((_value, index) => !Object.keys(playableFiles)[index].startsWith('assets/')).map(bytes => strFromU8(bytes)), JSON.stringify(runtime)]) {
    expect(outputText).not.toContain('作者だけの秘密メモ: 隠れた黒幕');
    expect(outputText).not.toContain('没案にだけある別結末。');
    expect(outputText).not.toContain(rejected.id);
  }
  expect(reader).toContain('公開する正本本文。');
  expect(reader).toContain('確認済みの公開名');
  expect(strFromU8(playableFiles['index.html'])).toContain('公開する正本本文。');
  expect(runtime.runtimeProject.entities.some((e: { kind: string }) => e.kind === 'flow_graph')).toBe(true);
  expect(runtime.assets).toHaveLength(2);
  expect(runtime.assetBytesIncluded).toBe(true);
  expect(new Uint8Array(Buffer.from(runtime.assetData[image.id].base64, 'base64'))).toEqual(imageBytes);
  expect(new Uint8Array(Buffer.from(runtime.assetData[sound.id].base64, 'base64'))).toEqual(soundBytes);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(unsupportedPolicy.id);
  let unexpectedDownloads = 0;
  const onDownload = () => { unexpectedDownloads++; };
  page.on('download', onDownload);
  for (const purpose of ['playable_preview', 'runtime_json']) {
    await page.getByLabel('出力目的', { exact: true }).selectOption(purpose);
    await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
    await expect(page.locator('.export-result').getByRole('alert')).toContainText('外部値の型を対応先で表せません');
    await expect(page.locator('.export-artifact')).toHaveCount(0);
  }
  page.off('download', onDownload);
  expect(unexpectedDownloads).toBe(0); expect(await authorFingerprint(page)).toBe(beforeOutputs);
  await page.reload();
  const afterOutputs = await backup(page);
  expect(afterOutputs.project).toEqual(full.project);
  await attachObservation(info, 'AT-F24-observed', { fixedSnapshotId: p.snapshots.at(-1)!.id, normalProfileId: normalPolicy.id, unsupportedProfileId: unsupportedPolicy.id, originalAssetHashes: [png.contentHash, wav.contentHash], fullNewColdMatched: true, readerPlayableRuntimeActuallyDownloaded: true, unsupportedTypeRefusedWithoutPartialDownload: true, nativeRecordsUnchanged: true });
});

test('AT-F28 Web URL・実PDF・画像と作者の解釈を分け、取得日/ページを通常保存し、無許可素材の公開を拒否して書誌だけ渡す', async ({ page }, info) => {
  const p = createProject('AT-F28 参考資料の出所と再配布');
  const web = createEntity(p.projectId, 'source', '塔を調べたWeb資料', { sourceType: 'web', locator: 'https://example.invalid/tower-reference', interpretation: textToRichText('作者のWeb解釈: 鳥と塔の意味を独自に考える。'), redistributionAllowed: false });
  const pdf = createEntity(p.projectId, 'source', '参考PDFの書誌', { sourceType: 'file', locator: '塔の参考書 / 作者作成PDF / 2026年版', interpretation: textToRichText('作者のPDF解釈: 参考書の文章と設定本文を分ける。'), redistributionAllowed: false });
  const imageSource = createEntity(p.projectId, 'source', '参考画像の書誌', { sourceType: 'file', locator: '塔の参考画像 / 作者作成PNG', interpretation: textToRichText('作者の画像解釈: 配色だけを参考にする。'), redistributionAllowed: false });
  const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const pdfAsset = await prepareAsset(pdfBytes, '再配布を許可していない参考PDF.pdf');
  const imageAsset = await prepareAsset(pngBytes(), '再配布を許可していない参考画像.png');
  const { bytes: pdfFile, preview: _pdfPreview, ...pdfMetadata } = pdfAsset;
  const { bytes: imageFile, preview: _imagePreview, ...imageMetadata } = imageAsset;
  const attachedPdf = createEntity(p.projectId, 'attachment', '参考PDF添付', { ...pdfMetadata, provenanceId: pdf.id, stage: 'reference' });
  const attachedImage = createEntity(p.projectId, 'attachment', '参考画像添付', { ...imageMetadata, provenanceId: imageSource.id, stage: 'reference' });
  pdf.data.attachmentId = attachedPdf.id; imageSource.data.attachmentId = attachedImage.id;
  const lore = createEntity(p.projectId, 'lore', '作者が書いた塔の設定', { body: textToRichText('作者独自の設定説明: 塔の鍵は鳥が守る。'), sourceIds: [] });
  const entry = createEntity(p.projectId, 'flow_node', '書誌出力の入口', { nodeType: 'entry' });
  const end = createEntity(p.projectId, 'flow_node', '書誌出力の終端', { nodeType: 'terminal', terminalReason: '公開書誌の確認を完了' });
  const edge = createEntity(p.projectId, 'flow_edge', '書誌出力の進行', { fromId: entry.id, toId: end.id, label: '確認を終える' });
  const graph = createEntity(p.projectId, 'flow_graph', '書誌出力のgraph', { nodeIds: [entry.id, end.id], entryIds: [entry.id], exitIds: [end.id], edgeIds: [edge.id] });
  p.entities.push(web, pdf, imageSource, attachedPdf, attachedImage, lore, entry, end, edge, graph);
  p.entities.forEach(e => { e.status = 'confirmed'; });
  const assets: Record<string, Uint8Array> = { [pdfAsset.contentHash]: pdfFile, [imageAsset.contentHash]: imageFile };
  const bytes = await exportScenario(p, { loadAsset: hash => assets[hash] });
  await attachGiven(info, 'AT-F28', bytes, { loreId: lore.id, sourceIds: [web.id, pdf.id, imageSource.id], attachmentIds: [attachedPdf.id, attachedImage.id], originalUrl: web.data.locator, redistributionAllowed: false, interpretationBlocks: [web.data.interpretation, pdf.data.interpretation, imageSource.data.interpretation] });
  await seed(page, bytes);
  const editor = page.locator('.detail-panel');
  const accessedAt = '2026-10-11T08:00:00Z';
  for (const [source, location] of [[web, 'Web第2節: 塔の鍵'], [pdf, 'PDF 3〜4ページ'], [imageSource, '図1: 塔の外観']] as const) {
    await openEntity(page, 'source', source.name);
    await editor.getByLabel('資料を取得した日時', { exact: true }).fill(accessedAt);
    await editor.getByLabel('参照した箇所', { exact: true }).fill(location);
    await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
    await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
    await expect(editor.getByLabel('出力への再配布を許可する', { exact: true })).not.toBeChecked();
  }
  await openEntity(page, 'lore', lore.name);
  const sourcePicker = editor.locator('[data-field="sourceIds"]');
  for (const id of [web.id, pdf.id, imageSource.id]) await sourcePicker.getByLabel('追加する対象', { exact: true }).selectOption(id);
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload();
  const sourced = await backup(page);
  expect(sourced.project.entities.find(e => e.id === lore.id)).toMatchObject({ data: { body: lore.data.body, sourceIds: [web.id, pdf.id, imageSource.id] } });
  for (const source of [web, pdf, imageSource]) expect(sourced.project.entities.find(e => e.id === source.id)).toMatchObject({ data: { sourceType: source.data.sourceType, locator: source.data.locator, accessedAt, interpretation: source.data.interpretation, redistributionAllowed: false } });
  for (const asset of sourced.assets) expect(asset.bytes).toEqual(assets[asset.contentHash]);
  await openEntity(page, 'source', web.name);
  await expect(editor.getByRole('link', { name: '資料のURLを開く', exact: true })).toHaveAttribute('href', web.data.locator);
  await openEntity(page, 'source', pdf.name);
  await expect(editor.getByLabel('参照した箇所', { exact: true })).toHaveValue('PDF 3〜4ページ');
  await expect(editor.getByRole('textbox', { name: '作者の解釈', exact: true })).toHaveValue('作者のPDF解釈: 参考書の文章と設定本文を分ける。');

  // Public scope authoring is also a normal author operation. First include
  // the two files deliberately, which must fail their provenance permission.
  await output(page);
  await page.getByRole('button', { name: '公開範囲を作成', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '公開する範囲を作成', exact: true });
  await modal.getByLabel('公開用の作品名', { exact: true }).fill('参考資料の公開書誌');
  for (const id of [lore.id, web.id, pdf.id, imageSource.id, attachedPdf.id, attachedImage.id, entry.id, end.id, edge.id, graph.id]) await modal.getByLabel('追加する対象', { exact: true }).selectOption(id);
  await modal.getByLabel('選んだ対象の本文・表記を公開文へコピーする', { exact: true }).check();
  await modal.getByLabel('選択素材をこの公開範囲で再配布できることを確認した', { exact: true }).check();
  await modal.getByRole('button', { name: '範囲を作成して内容を確認', exact: true }).click();
  await expect(modal).toBeHidden();
  await editor.getByLabel('情報の状態', { exact: true }).selectOption('confirmed');
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  const policyId = await page.getByLabel('出力する公開範囲', { exact: true }).inputValue();
  const beforeRefusal = await authorFingerprint(page);
  await page.getByLabel('出力目的', { exact: true }).selectOption('runtime_json');
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-result').getByRole('alert')).toContainText('添付の再配布許可を確認してください');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  expect(await authorFingerprint(page)).toBe(beforeRefusal);

  // Keep the bibliography and permission declaration; exclude the two file
  // IDs and their references from the selected public scope, preserving native
  // attachment records and exact bytes in complete saves.
  const withPolicy = await backup(page);
  const policy = withPolicy.project.entities.find(e => e.id === policyId)!;
  if (policy.kind !== 'projection_profile') throw new Error('公開範囲がありません');
  const removed = new Set([attachedPdf.id, attachedImage.id]);
  const data = { ...policy.data, includedIds: policy.data.includedIds.filter(id => !removed.has(id)), excludedFields: [...(policy.data.excludedFields ?? []), 'source.attachmentId'] };
  await openEntity(page, 'projection_profile', policy.name);
  await editData(page, data);
  await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  const nativeBeforeOutput = await authorFingerprint(page);
  const runtime = JSON.parse(strFromU8(await outputBytes(page, 'runtime_json')));
  expect(runtime.publicProjection.entities.filter((e: { kind: string }) => e.kind === 'attachment')).toHaveLength(0);
  const sources = runtime.publicProjection.entities.filter((e: { kind: string }) => e.kind === 'source');
  expect(sources).toHaveLength(3);
  expect(sources.some((e: { data: { locator: string } }) => e.data.locator === web.data.locator)).toBe(true);
  expect(sources.some((e: { data: { locator: string; excerptLocation: string } }) => e.data.locator === pdf.data.locator && e.data.excerptLocation === 'PDF 3〜4ページ')).toBe(true);
  for (const source of sources) { expect(source.data.accessedAt).toBe(accessedAt); expect(source.data.attachmentId).toBeUndefined(); expect(source.data.redistributionAllowed).toBe(false); }
  expect(runtime.assets).toHaveLength(0); expect(runtime.assetData).toEqual({});
  expect(JSON.stringify(runtime)).not.toContain(pdfAsset.contentHash);
  expect(JSON.stringify(runtime)).not.toContain(imageAsset.contentHash);
  expect(await authorFingerprint(page)).toBe(nativeBeforeOutput);
  await page.reload();
  const final = await backup(page);
  expect(final.assets.map(a => ({ hash: a.contentHash, bytes: a.bytes }))).toEqual(sourced.assets.map(a => ({ hash: a.contentHash, bytes: a.bytes })));
  expect(final.project.entities.find(e => e.id === attachedPdf.id)?.data).toEqual(attachedPdf.data);
  expect(final.project.entities.find(e => e.id === attachedImage.id)?.data).toEqual(attachedImage.data);
  await attachObservation(info, 'AT-F28-observed', { sourceIds: [web.id, pdf.id, imageSource.id], publicPolicyId: policyId, accessedAt, excludedAttachmentIds: [...removed], actualFileHashes: [pdfAsset.contentHash, imageAsset.contentHash], permissionRefusalPreservedNative: true, bibliographyAndUrlActuallyExported: true, attachmentsRetainedInFullFile: true });
});

test('AT-F25 公開版1から作者別案の新場面を作って没にし、別IDのゲーム選択分岐だけを正本の制作出力へ含める', async ({ page }, info) => {
  let p = createProject('AT-F25 作者別案とゲーム分岐');
  const scene = createEntity(p.projectId, 'scene', '正本の場面', { body: textToRichText('正本だけの制作本文。') });
  const provisional = createEntity(p.projectId, 'scene', '正本に残す仮の場面', { body: textToRichText('仮の場面だけにある未採用本文。') }); provisional.status = 'provisional';
  const chapter = createEntity(p.projectId, 'chapter', '公開版の章', { sceneIds: [scene.id] }); scene.data.chapterId = chapter.id;
  const entry = createEntity(p.projectId, 'flow_node', '正本の選択入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '正本の終わり', { nodeType: 'terminal', terminalReason: '正本を終える' });
  const graph = createEntity(p.projectId, 'flow_graph', '正本のゲーム分岐', { nodeIds: [entry.id, end.id], entryIds: [entry.id], exitIds: [end.id], edgeIds: [] });
  p.entities.push(scene, provisional, chapter, entry, end, graph);
  p.entities.filter(e => e.id !== provisional.id).forEach(e => { e.status = 'confirmed'; });
  const policy = fixturePublicPolicy(p, [scene, provisional, chapter, entry, end, graph]);
  p = await createWorldSnapshot(p, '公開版1');
  const published = p.snapshots.at(-1)!;
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F25', bytes, { canonicalSceneId: scene.id, provisionalSceneId: provisional.id, publishedSnapshotId: published.id, publishedContentHash: published.contentHash, gameGraphId: graph.id, profileId: policy.id });
  await seed(page, bytes); await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '作者別案', exact: true }).click();
  await page.getByLabel('新しい別案の名前', { exact: true }).fill('別の結末を比較して没にする');
  await page.getByLabel('別案の分岐元', { exact: true }).selectOption(published.id);
  await page.getByRole('button', { name: '分岐して別案を作る', exact: true }).click();
  const alternativeId = await page.getByLabel('編集する作者別案', { exact: true }).inputValue();
  await page.getByRole('button', { name: '別案の場面を作る', exact: true }).click();
  const alternativeSceneId = await page.getByLabel('別案内の編集対象', { exact: true }).inputValue();
  await page.getByLabel('別案内の情報名', { exact: true }).fill('没にする作者別案場面');
  await page.getByLabel('別案内の場面本文', { exact: true }).fill('作者別案だけの没結末本文。');
  await page.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect(page.getByText('保存済み 2版', { exact: true })).toBeVisible();
  await page.getByLabel('別案の状態', { exact: true }).selectOption('rejected');
  await expect(page.getByLabel('別案の状態', { exact: true })).toHaveValue('rejected');

  // Add a real game edge through the ordinary typed entity form. The author's
  // branch has its own ID, which is never used as a flow/route ID.
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('flow_edge');
  await page.getByRole('button', { name: '進行線を追加', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: '情報を追加', exact: true });
  await add.getByLabel('名前', { exact: true }).fill('正本へ追加したゲーム内選択');
  await add.getByRole('button', { name: '編集を始める', exact: true }).click();
  const editor = page.locator('.detail-panel');
  await editor.getByLabel('始点ノード', { exact: true }).selectOption(entry.id);
  await editor.getByLabel('行き先未定の下書き', { exact: true }).uncheck();
  await editor.getByLabel('行き先ノード', { exact: true }).selectOption(end.id);
  await editor.getByLabel('選択肢の文言', { exact: true }).fill('正本のゲーム選択で進む');
  await editor.getByLabel('情報の状態', { exact: true }).selectOption('confirmed');
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  const withEdge = await backup(page);
  const edge = withEdge.project.entities.find(e => e.kind === 'flow_edge' && e.name === '正本へ追加したゲーム内選択')!;
  expect(new Set([alternativeId, alternativeSceneId, edge.id, graph.id]).size).toBe(4);
  await openEntity(page, 'flow_graph', graph.name);
  await editData(page, { ...graph.data, edgeIds: [edge.id] });
  const withGraph = await backup(page);
  const currentPolicy = withGraph.project.entities.find(e => e.id === policy.id)!;
  if (currentPolicy.kind !== 'projection_profile' || edge.kind !== 'flow_edge') throw new Error('制作範囲または新選択がありません');
  await openEntity(page, 'projection_profile', policy.name);
  await editData(page, { ...currentPolicy.data, includedIds: [...currentPolicy.data.includedIds, edge.id], publicTexts: { ...currentPolicy.data.publicTexts, [edge.id]: { label: edge.data.label } } });
  await page.reload();
  const saved = await backup(page);
  const alternative = saved.project.authorAlternatives!.find(a => a.id === alternativeId)!;
  expect(alternative.status).toBe('rejected');
  expect(alternative.sourceSnapshotId).toBe(published.id);
  expect(alternative.versions.at(-1)!.content.entities.find(e => e.id === alternativeSceneId)).toMatchObject({ status: 'alternate', data: { body: [{ text: '作者別案だけの没結末本文。' }] } });
  expect(saved.project.entities.some(e => e.id === alternativeSceneId)).toBe(false);
  expect(saved.project.snapshots.find(s => s.id === published.id)).toEqual(published);
  expect(saved.project.entities.find(e => e.id === scene.id)?.data).toEqual(scene.data);
  const nativeBeforeOutputs = await authorFingerprint(page);
  const production = JSON.parse(strFromU8(await outputBytes(page, 'production')));
  const runtime = JSON.parse(strFromU8(await outputBytes(page, 'runtime_json')));
  expect(production.format).toBe('scenario-production');
  expect(JSON.stringify(production)).toContain('正本だけの制作本文。');
  expect(runtime.flow.edges.some((e: { id: string }) => e.id === edge.id)).toBe(true);
  for (const text of [JSON.stringify(production), JSON.stringify(runtime)]) {
    expect(text).not.toContain('作者別案だけの没結末本文。');
    expect(text).not.toContain('仮の場面だけにある未採用本文。');
    expect(text).not.toContain(alternativeId); expect(text).not.toContain(alternativeSceneId);
  }
  expect(await authorFingerprint(page)).toBe(nativeBeforeOutputs);
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '作者別案', exact: true }).click();
  await page.getByLabel('編集する作者別案', { exact: true }).selectOption(alternativeId);
  await page.getByLabel('別案内の編集対象', { exact: true }).selectOption(alternativeSceneId);
  await expect(page.getByLabel('別案内の場面本文', { exact: true })).toHaveValue('作者別案だけの没結末本文。');
  await expect(page.locator('.alternative-diff-list')).toContainText('没にする作者別案場面');
  await attachObservation(info, 'AT-F25-observed', { alternativeId, alternativeSceneId, branchStatus: alternative.status, publishedSnapshotId: published.id, gameEdgeId: edge.id, gameGraphId: graph.id, productionAndRuntimeActuallyDownloaded: true, rejectedAndProvisionalBodiesAbsent: true, nativeCanonicalAndPublishedPreserved: true, revision: saved.project.revision });
});
