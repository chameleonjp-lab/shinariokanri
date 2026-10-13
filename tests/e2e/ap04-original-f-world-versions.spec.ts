import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot, previewWorldVersion } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// Budget for multi-step UI/cold/file checks; original acceptance limits stay unchanged.
test.setTimeout(180_000);

async function worlds(page: Page) {
  await navigate(page, /^年表/); await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click();
  await page.getByRole('tab', { name: '共通世界の固定版', exact: true }).click();
}
async function importAnother(page: Page, bytes: Uint8Array) {
  await page.locator('.project-switch').click(); await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'another-original-work.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click(); await expect(page.locator('.app-shell')).toBeVisible();
}
async function switchWork(page: Page, name: string) {
  const fixedSource = page.getByRole('dialog', { name: '固定版の参照先', exact: true });
  if (await fixedSource.count()) {
    await fixedSource.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(fixedSource).toHaveCount(0);
  }
  await page.locator('.project-switch').click(); await page.locator('.project-card').filter({ hasText: name }).click();
}
async function reviseWorld(page: Page, worldName: string, placeName: string) {
  await switchWork(page, worldName); await openEntity(page, 'place', placeName);
  const editor = page.locator('.detail-panel');
  await editor.getByRole('textbox', { name: '場所の説明', exact: true }).fill('版2では街の門が閉じている。');
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await worlds(page); await page.getByLabel('新しい共通世界版の名称', { exact: true }).fill('共通設定の改訂版2');
  await page.getByRole('button', { name: 'この内容を確定版として保存', exact: true }).click();
  await expect(page.getByLabel('新しい共通世界版の名称', { exact: true })).toHaveValue('');
  const saved = await backup(page), pin = saved.project.snapshots.find(item => item.versionLabel === '共通設定の改訂版2');
  if (!pin) throw new Error('共通設定の版2がありません');
  return pin;
}
async function updatePin(page: Page, worldId: string, newPinId: string) {
  await worlds(page); await page.getByLabel('参照する共通世界', { exact: true }).selectOption(worldId);
  await page.getByLabel('固定する共通世界版', { exact: true }).selectOption(newPinId);
  await page.getByRole('button', { name: '適用前の差分・影響を確認', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '共通世界版の変更前の影響', exact: true })).toContainText('変更');
  await page.getByRole('button', { name: '確認した固定版・採用設定を保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '共通世界版の変更前の影響', exact: true })).toHaveCount(0);
}

test('AT-F09 共通世界Wの公開版1を持つ旧作Pと続編Qで、W版2をQだけ採用しPの旧公開設定を保持する', async ({ page }, info) => {
  let w = createProject('AT-F09 共通世界W');
  const place = createEntity(w.projectId, 'place', '公開版1の街', { body: textToRichText('版1では街の門が開いている。') }); place.status = 'confirmed'; w.entities.push(place);
  w = await createWorldSnapshot(w, '共通世界Wの公開版1'); const oldWorld = w.snapshots.at(-1)!;
  let p = createProject('AT-F09 旧作P');
  p = (await previewWorldVersion(p, w, oldWorld.id, [place.id], [w])).candidate;
  p = await createWorldSnapshot(p, '旧作Pの公開版1'); const published = p.snapshots.at(-1)!;
  let q = createProject('AT-F09 続編Q'); q = (await previewWorldVersion(q, w, oldWorld.id, [place.id], [w])).candidate;
  const pBytes = await exportScenario(p, { worlds: { [oldWorld.id]: w } }), qBytes = await exportScenario(q, { worlds: { [oldWorld.id]: w } });
  await attachGiven(info, 'AT-F09', pBytes, { worldProjectId: w.projectId, worldVersionId: oldWorld.id, worldHash: oldWorld.contentHash, oldWorkId: p.projectId, sequelId: q.projectId, oldPublishedVersionId: published.id, placeId: place.id });
  await info.attach('AT-F09-sequel-given.scenario', { body: Buffer.from(qBytes), contentType: 'application/zip' });
  await seed(page, await exportScenario(w)); await importAnother(page, pBytes); await importAnother(page, qBytes);
  const newWorld = await reviseWorld(page, w.name, place.name);
  await switchWork(page, q.name); await updatePin(page, w.projectId, newWorld.id); await page.reload();
  const sequel = await backup(page);
  expect(sequel.project.worldReferences).toMatchObject([{ projectId: w.projectId, immutableSnapshotId: newWorld.id }]);
  await worlds(page); await page.getByRole('button', { name: 'この世界の版・採用設定を選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '共通世界の元情報を開く', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText('版2では街の門が閉じている。');
  await switchWork(page, p.name); const oldWork = await backup(page);
  expect(oldWork.project.worldReferences).toEqual(p.worldReferences);
  expect(oldWork.project.snapshots.find(item => item.id === published.id)).toEqual(published);
  await worlds(page); await page.getByRole('button', { name: 'この世界の版・採用設定を選ぶ', exact: true }).click();
  await page.getByRole('button', { name: '共通世界の元情報を開く', exact: true }).click();
  await expect(page.locator('.detail-panel')).toContainText('版1では街の門が開いている。');
  await expect(page.locator('.detail-panel')).not.toContainText('版2では街の門が閉じている。');
  await switchWork(page, w.name); const world = await backup(page);
  expect(world.project.snapshots.find(item => item.id === oldWorld.id)).toEqual(oldWorld);
  expect(world.project.snapshots.find(item => item.id === newWorld.id)?.contentHash).toBe(newWorld.contentHash);
  await attachObservation(info, 'AT-F09-observed', { oldWorldId: oldWorld.id, oldWorldHash: oldWorld.contentHash, newWorldId: newWorld.id, newWorldHash: newWorld.contentHash, oldWorkId: p.projectId, oldPublishedVersionId: published.id, oldWorkPin: oldWork.project.worldReferences, sequelPin: sequel.project.worldReferences, oldWorldImmutable: true });
});

test('AT-F54 共通設定版1の公開済み小説/動画と未公開ゲームへ版2の変更候補を示し、媒体本文と旧公開版を置換しない', async ({ page }, info) => {
  let w = createProject('AT-F54 三媒体の共通設定');
  const place = createEntity(w.projectId, 'place', '三媒体が参照する街', { body: textToRichText('版1では街の門が開いている。') }); place.status = 'confirmed'; w.entities.push(place);
  w = await createWorldSnapshot(w, '三媒体共通設定版1'); const oldWorld = w.snapshots.at(-1)!;
  let p = createProject('AT-F54 三媒体の異なる文章'); p = (await previewWorldVersion(p, w, oldWorld.id, [place.id], [w])).candidate;
  p = await createWorldSnapshot(p, '媒体が参照する元公開版1'); const oldEdition = p.snapshots.at(-1)!;
  const novelBody = textToRichText('小説では開いた門を静かに描く。'), videoBody = textToRichText('動画では開いた門を映す。'), gameBody = textToRichText('ゲームでは門を通る選択をする。');
  const novel = createEntity(p.projectId, 'media_variant', '公開済み小説', { medium: 'novel', body: novelBody, sourceIds: [place.id], baseSnapshotId: oldEdition.id, releaseAt: '2026-10-01T00:00:00Z', needsReview: false });
  const video = createEntity(p.projectId, 'media_variant', '公開済み動画', { medium: 'video', body: videoBody, sourceIds: [place.id], baseSnapshotId: oldEdition.id, releaseAt: '2026-10-02T00:00:00Z', needsReview: false });
  const game = createEntity(p.projectId, 'media_variant', '未公開ゲーム', { medium: 'game', body: gameBody, sourceIds: [place.id], baseSnapshotId: oldEdition.id, needsReview: false });
  const media = [{ original: novel, body: novelBody }, { original: video, body: videoBody }, { original: game, body: gameBody }];
  p.entities.push(novel, video, game); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p, { worlds: { [oldWorld.id]: w } });
  await attachGiven(info, 'AT-F54', bytes, { worldProjectId: w.projectId, oldWorldId: oldWorld.id, oldWorldHash: oldWorld.contentHash, oldEditionId: oldEdition.id, media: [novel, video, game].map(entity => ({ id: entity.id, medium: entity.data.medium, sourceIds: entity.data.sourceIds, baseSnapshotId: entity.data.baseSnapshotId, releaseAt: entity.data.releaseAt, body: entity.data.body })) });
  await seed(page, await exportScenario(w)); await importAnother(page, bytes);
  const newWorld = await reviseWorld(page, w.name, place.name);
  await switchWork(page, p.name); await updatePin(page, w.projectId, newWorld.id);
  const beforeCandidates = await backup(page);
  for (const { original, body } of media) {
    expect(beforeCandidates.project.entities.find(entity => entity.id === original.id)).toMatchObject({ data: { body: original.data.body, sourceIds: original.data.sourceIds, baseSnapshotId: oldEdition.id } });
    await openEntity(page, 'media_variant', original.name);
    const tools = page.locator('.detail-panel details').filter({ has: page.locator('summary').filter({ hasText: '媒体の旧公開版と改訂候補を比較' }) });
    await tools.locator('summary').click();
    await expect(tools.getByLabel('媒体の改訂候補本文', { exact: true })).toHaveValue(body.map(block => block.text).join('\n'));
    const before = await authorFingerprint(page);
    await tools.getByRole('button', { name: '媒体の改訂差分を確認', exact: true }).click();
    const difference = tools.locator('details').filter({ has: page.locator('summary').filter({ hasText: '元設定の改訂差' }) });
    await difference.locator('summary').click();
    await expect(difference).toContainText('版1では街の門が開いている。');
    await expect(difference).toContainText('版2では街の門が閉じている。');
    await expect(tools).toContainText('旧媒体本文');
    await expect(tools).toContainText(body[0].text);
    expect(await authorFingerprint(page)).toBe(before);
    await tools.getByRole('button', { name: '旧媒体を保持して改訂候補を保存', exact: true }).click();
    await expect(tools.getByRole('button', { name: '保存した媒体改訂候補を開く', exact: true })).toBeVisible();
  }
  await page.reload(); const saved = await backup(page);
  for (const { original, body } of media) {
    const retained = saved.project.entities.find(entity => entity.id === original.id);
    expect(retained).toMatchObject({ data: { body: original.data.body, baseSnapshotId: oldEdition.id, sourceIds: [place.id] } });
    if (original.data.releaseAt) expect(retained).toMatchObject({ data: { releaseAt: original.data.releaseAt } });
    else expect(retained?.kind === 'media_variant' ? retained.data.releaseAt : undefined).toBe(original.data.releaseAt);
    const candidates = saved.project.entities.filter(entity => entity.kind === 'media_variant' && entity.data.previousVariantId === original.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ status: 'provisional', data: { body: body.map(block => ({ ...block, id: expect.any(String) })), needsReview: true } });
    expect(candidates[0].id).not.toBe(original.id);
  }
  expect(saved.project.snapshots.find(item => item.id === oldEdition.id)).toEqual(oldEdition);
  expect(saved.project.worldReferences).toMatchObject([{ projectId: w.projectId, immutableSnapshotId: newWorld.id }]);
  await attachObservation(info, 'AT-F54-observed', { oldWorldId: oldWorld.id, newWorldId: newWorld.id, preservedPublishedEdition: oldEdition.id, mediaIds: [novel.id, video.id, game.id], candidateIds: saved.project.entities.filter(entity => entity.kind === 'media_variant' && entity.data.previousVariantId).map(entity => entity.id), threeDistinctBodiesPreserved: true, revision: saved.project.revision });
});
