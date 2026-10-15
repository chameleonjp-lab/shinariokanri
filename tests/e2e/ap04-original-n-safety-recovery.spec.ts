import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { prepareAsset } from '../../src/domain/attachments';
import { exportScenario } from '../../src/storage/archive';
import { createHttpContract } from './httpContract';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

// These are original-clause candidates. Authoring this file gives no acceptance
// credit: all four clauses of each case remain not_run until the fixed browser
// build actually executes them. The HTTP fixture is not real Auth/RLS evidence.
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function work(page: Page, tab: string) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: tab, exact: true }).click();
}

async function editBody(page: Page, value: string) {
  const tab = page.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true });
  if (await tab.isVisible()) await tab.click();
  await page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true }).fill(value);
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
}

async function dataInput(page: Page) {
  const details = page.locator('.detail-panel details.advanced-details').filter({
    has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }),
  });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  return details.getByRole('textbox', { name: '詳細データ', exact: true });
}

async function executableDom(page: Page, selector: string) {
  return page.locator(selector).evaluate(root => ({
    scripts: root.querySelectorAll('script, iframe, object, embed').length,
    handlers: [...root.querySelectorAll('*')].flatMap(element => [...element.attributes]
      .filter(attribute => /^on/i.test(attribute.name)).map(attribute => attribute.name)),
    unsafeUrls: [...root.querySelectorAll('[href], [src]')].flatMap(element => ['href', 'src']
      .map(name => element.getAttribute(name)).filter(value => value && /^\s*javascript:/i.test(value))),
  }));
}

test('AT-N10 script と javascript URL の同じ本文を編集・試読・公開 HTML で表示し、偽画像とコード条件を拒否する', async ({ page, browser }, info) => {
  // given: scriptやjavascript URLを含む文章。
  const hostile = '<script>globalThis.__ap04ManuscriptExecuted = true</script> <a href="javascript:globalThis.__ap04UrlExecuted=true">危険な URL</a>';
  const edited = `${hostile} 編集後も文字として保持😀`;
  const p = createProject('AT-N10 安全な本文');
  const scene = createEntity(p.projectId, 'scene', '安全表示する場面', { body: textToRichText(hostile) });
  const entry = createEntity(p.projectId, 'flow_node', '本文を読む入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '安全表示の終端', { nodeType: 'terminal', terminalReason: '表示終了' });
  const edge = createEntity(p.projectId, 'flow_edge', '安全な条件', { fromId: entry.id, toId: end.id, label: '安全な条件で進む', condition: { op: 'constant', value: true } });
  const graph = createEntity(p.projectId, 'flow_graph', '安全表示の分岐', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  p.entities.push(scene, entry, end, edge, graph);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-N10', bytes, { sceneId: scene.id, bodyBlockId: scene.data.body[0].id, edgeId: edge.id, originalCondition: edge.data.condition, hostile });
  await seed(page, bytes);

  // when/then: edit the literal text, then display the same saved text in trial.
  await openEntity(page, 'scene', scene.name);
  await editBody(page, edited);
  // Full replacement has an actual new paragraph identity. Keep that saved
  // identity across all displays and cold rereads; import identity is separate.
  const editedSceneData = JSON.parse(await (await dataInput(page)).inputValue());
  expect(editedSceneData.body).toHaveLength(1);
  const editedBodyId = editedSceneData.body[0].id;
  expect(editedBodyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(editedBodyId).not.toBe(scene.data.body[0].id);
  expect(editedSceneData).toEqual({ ...scene.data, body: [{ ...scene.data.body[0], id: editedBodyId, text: edited }] });
  await page.locator('.detail-panel').getByRole('tab', { name: '確認表示', exact: true }).click();
  await expect(page.locator('.detail-panel .rich-text')).toContainText(edited);
  expect(await executableDom(page, '.detail-panel .rich-text')).toEqual({ scripts: 0, handlers: [], unsafeUrls: [] });
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText(edited);
  expect(await executableDom(page, '.reader-sheet')).toEqual({ scripts: 0, handlers: [], unsafeUrls: [] });
  await page.getByRole('button', { name: '安全な条件で進む', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('意図した終端');

  // Create the public text through the ordinary range/copy UI, not a renderer call.
  await work(page, '目的別出力');
  await page.getByRole('button', { name: '公開範囲を作成', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('公開用の作品名', { exact: true }).fill('AT-N10 公開資料');
  await dialog.getByLabel('追加する対象', { exact: true }).selectOption(scene.id);
  await dialog.getByLabel('選んだ対象の本文・表記を公開文へコピーする', { exact: true }).check();
  await dialog.getByRole('button', { name: '範囲を作成して内容を確認', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#entity-name')).toHaveValue('AT-N10 公開資料 · 公開範囲');
  const confirmedProfileData = JSON.parse(await (await dataInput(page)).inputValue());
  expect(confirmedProfileData.includedIds).toEqual([scene.id]);
  expect(confirmedProfileData.includeAuthorNotes).toBe(false);
  expect(confirmedProfileData.publicTexts[scene.id].body.map((block: { text: string }) => block.text).join('\n')).toBe(edited);
  await page.getByLabel('情報の状態', { exact: true }).selectOption('confirmed');
  await page.locator('.editor-footer').getByRole('button', { name: /^(保存する|保存を再試行)$/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await expect(page.getByLabel('情報の状態', { exact: true })).toHaveValue('confirmed');
  await work(page, '目的別出力');
  await page.getByLabel('出力目的', { exact: true }).selectOption('reader');
  await page.getByLabel('本文の出力形式', { exact: true }).selectOption('html');
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  const artifact = page.locator('.export-artifact').filter({ has: page.getByRole('heading', { name: /\.html$/ }) });
  await expect(artifact).toBeVisible();
  await expect(artifact.locator('pre')).toContainText('&lt;script&gt;');
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', { name: 'この内容を保存', exact: true }).click();
  const htmlBytes = new Uint8Array(await readFile((await (await pending).path())!));
  await info.attach('AT-N10-public.html', { body: Buffer.from(htmlBytes), contentType: 'text/html' });
  const publicContext = await browser.newContext();
  try {
    const publicPage = await publicContext.newPage();
    // Open the actual downloaded document unchanged in an isolated origin.
    await publicPage.goto(`data:text/html;base64,${Buffer.from(htmlBytes).toString('base64')}`);
    await expect(publicPage.locator('body')).toContainText(edited);
    expect(await executableDom(publicPage, 'body')).toEqual({ scripts: 0, handlers: [], unsafeUrls: [] });
    expect(await publicPage.evaluate(() => Object.keys(globalThis).filter(key => /^__ap04.*Executed$/.test(key)))).toEqual([]);
  } finally { await publicContext.close(); }

  // negative_or_edge: a .png filename and declared image/png do not bless HTML.
  await work(page, '作品の設定');
  const beforeFile = await authorFingerprint(page);
  await page.getByLabel('素材ファイルを選ぶ', { exact: true }).setInputFiles({
    name: 'looks-like-image.png', mimeType: 'image/png', buffer: Buffer.from(`<html>${hostile}</html>`),
  });
  await expect(page.locator('.project-info').getByRole('alert')).toContainText('安全な表示の対象外');
  expect(await authorFingerprint(page)).toBe(beforeFile);

  // Arbitrary code is entered only through the actual JSON editor and rejected.
  await openEntity(page, 'flow_edge', edge.name);
  const raw = await dataInput(page), original = JSON.parse(await raw.inputValue());
  const beforeCondition = await authorFingerprint(page);
  const invalid = { ...original, condition: { op: 'javascript', source: 'globalThis.__ap04ConditionExecuted = true' } };
  await raw.fill(JSON.stringify(invalid, null, 2));
  await expect(page.locator('.detail-panel')).toContainText('未知の条件・式op');
  await expect(page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ })).toBeDisabled();
  await expect(raw).toHaveValue(JSON.stringify(invalid, null, 2));
  expect(await authorFingerprint(page)).toBe(beforeCondition);
  await raw.fill(JSON.stringify(original, null, 2));
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  expect(await page.evaluate(() => Object.keys(globalThis).filter(key => /^__ap04.*Executed$/.test(key)))).toEqual([]);
  await page.reload();
  const cold = await backup(page), coldScene = cold.project.entities.find(entity => entity.id === scene.id);
  expect(coldScene?.kind).toBe('scene');
  if (!coldScene || coldScene.kind !== 'scene') throw new Error('保存後の場面がありません');
  expect(coldScene.data).toEqual(editedSceneData);
  const editOperation = cold.project.history.find(command => command.before.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === scene.data.body[0].id)
    && command.after.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === editedBodyId && entity.data.body[0]?.text === edited));
  expect(editOperation).toBeDefined();
  const confirmedProfiles = cold.project.entities.filter(entity => entity.kind === 'projection_profile' && entity.name === 'AT-N10 公開資料 · 公開範囲');
  expect(confirmedProfiles).toHaveLength(1); expect(confirmedProfiles[0].status).toBe('confirmed'); expect(confirmedProfiles[0].data).toEqual(confirmedProfileData);
  expect(cold.project.entities.find(entity => entity.id === edge.id)?.data).toEqual(original);
  expect(cold.project.entities.some(entity => entity.kind === 'attachment')).toBe(false);
  await attachObservation(info, 'AT-N10-observation', { publicHtmlSha256: sha256(htmlBytes), publicHtmlBytes: htmlBytes.length, coldRevision: cold.project.revision, coldArchiveSha256: sha256(cold.bytes), originalBodyBlockId: scene.data.body[0].id, bodyBlockId: coldScene.data.body[0].id, editOperationId: editOperation?.operationId, confirmedProfile: confirmedProfiles[0], invalidConditionRetainedAndRejected: true, falseImageRejected: true });
});

test('AT-N14 実完全保存を端末内正本も履歴もない空 context に持ち込み、本文・ID・条件・素材を保って編集を再開する', async ({ page, browser, baseURL }, info) => {
  const p = createProject('AT-N14 外部完全保存から復帰');
  const scene = createEntity(p.projectId, 'scene', '復旧する本文', { body: textToRichText('失う前の本文😀') });
  const variable = createEntity(p.projectId, 'variable', '復旧する状態', { key: 'recovered', valueType: 'boolean', scope: 'run', initial: { type: 'boolean', value: true } });
  const entry = createEntity(p.projectId, 'flow_node', '復旧する入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '復旧する終端', { nodeType: 'terminal', terminalReason: '条件も復旧した' });
  const edge = createEntity(p.projectId, 'flow_edge', '復旧する条件', { fromId: entry.id, toId: end.id, label: '復旧条件で進む', condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  const prepared = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '復旧する実音声.wav');
  const { bytes: assetBytes, preview: _preview, ...metadata } = prepared;
  const asset = createEntity(p.projectId, 'attachment', '復旧する実音声', metadata);
  p.entities.push(scene, variable, entry, end, edge, asset);
  const fixture = await exportScenario(p, { loadAsset: hash => hash === prepared.contentHash ? assetBytes : undefined });
  await attachGiven(info, 'AT-N14', fixture, { projectId: p.projectId, entityIds: p.entities.map(entity => entity.id), blockId: scene.data.body[0].id, condition: edge.data.condition, assetHash: prepared.contentHash, realAssetFixture: 'tests/fixtures/media/fixture-tone.wav' });
  await seed(page, fixture);
  await openEntity(page, 'scene', scene.name);
  await editBody(page, '外部ファイルへ保存した本文😀');
  const external = await backup(page);
  const externalScene = external.project.entities.find(entity => entity.id === scene.id);
  if (!externalScene || externalScene.kind !== 'scene') throw new Error('外部ファイルへ保存した場面がありません');
  expect(externalScene.data.body).toHaveLength(1);
  const externalBodyId = externalScene.data.body[0].id;
  expect(externalBodyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(externalBodyId).not.toBe(scene.data.body[0].id);
  expect(externalScene.data).toEqual({ ...scene.data, body: [{ ...scene.data.body[0], id: externalBodyId, text: '外部ファイルへ保存した本文😀' }] });
  const externalEdit = external.project.history.find(command => command.before.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === scene.data.body[0].id)
    && command.after.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === externalBodyId && entity.data.body[0]?.text === '外部ファイルへ保存した本文😀'));
  expect(externalEdit).toBeDefined();
  const givenIds = new Set(p.entities.map(entity => entity.id));
  expect(external.project.entities.filter(entity => givenIds.has(entity.id))
    .map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual(p.entities.map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)));
  const firstReviews = external.project.entities.filter(entity => !givenIds.has(entity.id));
  expect(firstReviews).toHaveLength(1);
  const firstReview = firstReviews[0];
  if (!firstReview || firstReview.kind !== 'review') throw new Error('最初の本文保存が変更確認以外の情報を追加しました');
  expect(firstReview).toMatchObject({ status: 'needs_review', visibility: 'private',
    data: { target: entry.id, targetVersionId: p.projectId, stage: 'open' } });
  expect(JSON.parse(String(firstReview.customValues['changeReview.sourceRevisions']))).toEqual({ [scene.id]: '1' });
  expect(firstReview.data.body.map(block => block.text).join('\n')).toContain(`(${scene.id})。改訂 0 → 1。`);
  expect(external.project.history.length).toBeGreaterThan(0);
  expect(external.assets).toHaveLength(1);
  expect(external.assets[0].bytes).toEqual(assetBytes);
  await info.attach('AT-N14-external-backup.scenario', { body: Buffer.from(external.bytes), contentType: 'application/zip' });
  await expect(page.locator('.backup-page')).toContainText('端末のダウンロードを確認してください');

  // given: no source database, local history, cookie or localStorage is copied.
  // This is declared browser storage-loss isolation, not physical-device loss.
  const emptyContext = await browser.newContext({ baseURL });
  try {
    const restoredPage = await emptyContext.newPage();
    await restoredPage.goto('./');
    await expect(restoredPage.getByRole('button', { name: '保存ファイルを読み込む', exact: true })).toBeVisible();
    expect(JSON.parse(await authorFingerprint(restoredPage))).toEqual([[], [], [], [], [], []]);
    // when: only the actual downloaded .scenario is imported via normal UI.
    await seed(restoredPage, external.bytes);
    const imported = await backup(restoredPage);
    expect(imported.project.projectId).toBe(external.project.projectId);
    expect(imported.project.entities).toEqual(external.project.entities);
    expect(imported.project.history).toEqual(external.project.history);
    expect(imported.project.snapshots).toEqual(external.project.snapshots);
    expect(imported.assets).toEqual(external.assets);

    // then: capture a real file after resumed editing, then cold-reread it.
    await openEntity(restoredPage, 'scene', scene.name);
    const bodyTab = restoredPage.locator('.detail-panel').getByRole('tab', { name: '本文', exact: true });
    if (await bodyTab.isVisible()) await bodyTab.click();
    await expect(restoredPage.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true })).toHaveValue('外部ファイルへ保存した本文😀');
    await editBody(restoredPage, '空環境で編集を再開した本文😀');
    // The first scene save already created one dependency review. Resuming
    // author editing creates exactly one more, before the cold reread.
    const resumed = await backup(restoredPage);
    const externalIds = new Set(external.project.entities.map(entity => entity.id));
    expect(external.project.entities).toHaveLength(7);
    expect(resumed.project.entities.filter(entity => externalIds.has(entity.id))
      .map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(external.project.entities.map(({ id, kind }) => ({ id, kind })).sort((a, b) => a.id.localeCompare(b.id)));
    expect(resumed.project.entities.filter(entity => externalIds.has(entity.id) && entity.id !== scene.id))
      .toEqual(external.project.entities.filter(entity => entity.id !== scene.id));
    const resumedScene = resumed.project.entities.find(entity => entity.id === scene.id);
    if (!resumedScene || resumedScene.kind !== 'scene') throw new Error('再編集した本文がありません');
    expect(resumedScene.revision).toBe('2');
    expect(resumedScene.data.body).toHaveLength(1);
    const resumedBodyId = resumedScene.data.body[0].id;
    expect(resumedBodyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(resumedBodyId).not.toBe(externalBodyId);
    expect(resumedScene.data).toEqual({ ...externalScene.data, body: [{ ...externalScene.data.body[0], id: resumedBodyId, text: '空環境で編集を再開した本文😀' }] });
    const resumedReviews = resumed.project.entities.filter(entity => !externalIds.has(entity.id));
    expect(resumedReviews).toHaveLength(1);
    const review = resumedReviews[0];
    if (!review || review.kind !== 'review') throw new Error('本文の再編集が変更確認以外の情報を追加しました');
    expect(review).toMatchObject({ projectId: p.projectId, status: 'needs_review', visibility: 'private',
      data: { target: entry.id, targetVersionId: p.projectId, stage: 'open', quotedText: null, resolution: [] },
      customValues: { 'changeReview.generatedBy': 'semantic-change-review/v1', 'changeReview.projectRevision': '2' } });
    expect(JSON.parse(String(review.customValues['changeReview.sourceIds']))).toEqual([scene.id]);
    expect(JSON.parse(String(review.customValues['changeReview.sourceRevisions']))).toEqual({ [scene.id]: '2' });
    expect(JSON.parse(String(review.customValues['changeReview.paths'])))
      .toEqual({ [scene.id]: { directPaths: ['data.sceneId'], relationLabels: [] } });
    expect(JSON.parse(String(review.customValues['changeReview.key'])))
      .toEqual({ targetId: entry.id, sources: [{ id: scene.id, revision: '2', directPaths: ['data.sceneId'], relationLabels: [] }] });
    expect(review.data.body.map(block => block.text).join('\n')).toContain(`(${scene.id})。改訂 1 → 2。`);
    expect(resumed.project.entities).toHaveLength(8);
    expect(resumed.assets).toEqual(external.assets);
    expect(resumed.project.history.slice(0, imported.project.history.length)).toEqual(imported.project.history);
    expect(resumed.project.history).toHaveLength(imported.project.history.length + 1);
    const resumedEdit = resumed.project.history.at(-1)!;
    expect(resumedEdit.operationId).not.toBe(externalEdit?.operationId);
    expect(resumedEdit.before.entities.find(entity => entity.id === scene.id)).toEqual(externalScene);
    expect(resumedEdit.after.entities.find(entity => entity.id === scene.id)).toEqual(resumedScene);
    expect(resumed.project.snapshots).toEqual(imported.project.snapshots);
    const resumedFingerprint = await authorFingerprint(restoredPage);
    await restoredPage.reload();
    expect(await authorFingerprint(restoredPage)).toBe(resumedFingerprint);
    const cold = await backup(restoredPage), actual = cold.project.entities.find(entity => entity.id === scene.id);
    if (!actual || actual.kind !== 'scene') throw new Error('復旧後の本文がありません');
    expect(actual.data).toEqual(resumedScene.data);
    expect(cold.project.entities.map(entity => entity.id).sort()).toEqual(resumed.project.entities.map(entity => entity.id).sort());
    expect(cold.project.entities).toEqual(resumed.project.entities);
    expect(cold.project.history).toEqual(resumed.project.history);
    expect(cold.project.snapshots).toEqual(resumed.project.snapshots);
    expect(cold.project.entities.find(entity => entity.id === edge.id)?.data).toEqual(edge.data);
    expect(cold.project.entities.find(entity => entity.id === variable.id)?.data).toEqual(variable.data);
    expect(cold.project.entities.find(entity => entity.id === asset.id)?.data).toEqual(asset.data);
    expect(cold.assets).toEqual(resumed.assets);
    await info.attach('AT-N14-resumed-complete.scenario', { body: Buffer.from(resumed.bytes), contentType: 'application/zip' });
    await info.attach('AT-N14-cold-complete.scenario', { body: Buffer.from(cold.bytes), contentType: 'application/zip' });
    // negative_or_edge: the recovery source is a downloaded file, not history
    // in the lost context. Separate-device/off-device retention remains blocked.
    await attachObservation(info, 'AT-N14-observation', { initialDurableRows: [[], [], [], [], [], []], externalFileSha256: sha256(external.bytes), resumedFileSha256: sha256(resumed.bytes), coldFileSha256: sha256(cold.bytes), coldRevision: cold.project.revision, originalGivenIds: p.entities.map(entity => entity.id).sort(), importedExternalIds: [...externalIds].sort(), importedParagraphId: externalBodyId, originalParagraphId: scene.data.body[0].id, editOperations: [externalEdit?.operationId, resumedEdit.operationId], resumedBaselineIds: resumed.project.entities.map(entity => entity.id).sort(), resumedReview: review, fullResumedBaselineEntities: resumed.project.entities, canonicalColdUnchanged: true, preservedEntityIds: cold.project.entities.map(entity => entity.id), preservedBlockId: actual.data.body[0].id, preservedAssetSha256: sha256(cold.assets[0].bytes), sourceWasDownloadedFile: true, physicalDeviceLossObserved: false, separateDeviceFileRetention: 'blocked_external_condition' });
  } finally { await emptyContext.close(); }
});

test('AT-N15 本文を含む保存失敗と認証失敗から診断を確認し、任意持出し前後とも本文を自動送信しない', async ({ page, context }, info) => {
  const manuscript = 'AP04_PRIVATE_MANUSCRIPT_15_8af361';
  const p = createProject('AP04_PRIVATE_PROJECT_15');
  const note = createEntity(p.projectId, 'note', 'AP04_PRIVATE_NAME_15', { body: textToRichText(manuscript) });
  p.entities.push(note);
  const fixture = await exportScenario(p);
  await attachGiven(info, 'AT-N15', fixture, { projectId: p.projectId, noteId: note.id, failureInjection: 'native projects puts stay quota-failing during observation, including blur retry, with manuscript in message; dedicated HTTP Auth response is 401 with manuscript in message', authScope: 'local_http_contract_only' });
  const requests: { url: string; method: string; body: string }[] = [], consoleRows: string[] = [], downloads: string[] = [];
  context.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() ?? '' }));
  page.on('console', message => consoleRows.push(message.text()));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  const contract = await createHttpContract(async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
    return route.fulfill({ status: 401, json: { message: `${manuscript} private remote stack`, access_token: 'AP04_PRIVATE_TOKEN_15' } });
  });
  try {
    await seed(page, fixture);
    await openEntity(page, 'note', note.name);
    const durableBefore = await authorFingerprint(page);
    await page.evaluate(body => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (this.name === 'projects') throw new DOMException(`${body} private save stack`, 'QuotaExceededError');
        return put.apply(this, args);
      };
    }, manuscript);
    await page.getByLabel('名前', { exact: true }).fill('AP04_PRIVATE_RETAINED_INPUT_15');
    await expect(page.locator('.detail-panel').getByRole('alert')).toContainText('容量');
    await expect(page.getByLabel('名前', { exact: true })).toHaveValue('AP04_PRIVATE_RETAINED_INPUT_15');
    expect(await authorFingerprint(page)).toBe(durableBefore);

    await page.getByRole('button', { name: 'アカウント・専用同期', exact: true }).click();
    await page.getByLabel('専用Supabase URL', { exact: true }).fill(contract.url);
    await page.getByLabel('公開用APIキー', { exact: true }).fill('sb_publishable_ap04_diagnostic_fixture');
    await page.getByRole('button', { name: '接続設定を保持', exact: true }).click();
    await page.getByLabel('メール', { exact: true }).fill('ap04-private@example.invalid');
    await page.getByLabel('パスワード', { exact: true }).fill('AP04_PRIVATE_PASSWORD_15');
    await page.getByRole('button', { name: '認証してアカウント領域を開く', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'AUTH_REQUIRED' })).toBeVisible();
    const panel = page.getByLabel('任意持出し診断', { exact: true });
    await panel.locator('summary').click();
    await expect(panel).toContainText('QUOTA_EXCEEDED');
    await expect(panel).toContainText('AUTH_REQUIRED');
    await expect(panel).toContainText('ファイルの内容を確認して本人が持ち出します');
    expect(downloads).toEqual([]);
    const forbidden = [manuscript, p.name, note.name, 'AP04_PRIVATE_RETAINED_INPUT_15', 'AP04_PRIVATE_TOKEN_15', 'AP04_PRIVATE_PASSWORD_15', 'ap04-private@example.invalid', 'private remote stack', 'private save stack', 'sb_publishable_ap04_diagnostic_fixture'];
    for (const text of forbidden) expect(await panel.innerText()).not.toContain(text);
    const beforeExportRequests = requests.length;
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: '確認した診断をファイルに持出す', exact: true }).click();
    const diagnosticBytes = new Uint8Array(await readFile((await (await pending).path())!));
    const raw = Buffer.from(diagnosticBytes).toString('utf8'), diagnostic = JSON.parse(raw);
    expect(downloads).toHaveLength(1);
    expect(diagnostic.format).toBe('scenario-diagnostics');
    expect(diagnostic.records.map((row: { code: string }) => row.code)).toEqual(expect.arrayContaining(['QUOTA_EXCEEDED', 'AUTH_REQUIRED']));
    for (const row of diagnostic.records) {
      expect(Object.keys(row).sort()).toEqual(['code', 'environment', 'metadata', 'operationId', 'recordedAt', 'revision', 'schemaVersion']);
      expect(row.operationId).toMatch(/^[0-9a-f-]{36}$/);
      if (row.revision !== null) expect(row.revision).toMatch(/^(0|[1-9]\d*)$/);
      expect(Object.keys(row.metadata).every(key => ['commit', 'tree', 'dirty', 'base', 'browser', 'browserVersion', 'os', 'osVersion', 'width', 'height', 'online'].includes(key))).toBe(true);
    }
    for (const text of forbidden) expect(raw).not.toContain(text);
    // Observe browser + worker requests; user-requested auth may send fixture
    // credentials to the local endpoint, while manuscript never leaves storage.
    for (const request of requests) expect(`${request.url}\n${request.body}`).not.toContain(manuscript);
    for (const line of consoleRows) expect(line).not.toContain(manuscript);
    expect(requests.slice(beforeExportRequests)).toEqual([]);
    const applicationOrigin = new URL(page.url()).origin;
    expect(requests.filter(request => ![applicationOrigin, new URL(contract.url).origin].includes(new URL(request.url).origin))).toEqual([]);
    expect(await authorFingerprint(page)).toBe(durableBefore);
    await info.attach('AT-N15-user-selected-diagnostics.json', { body: Buffer.from(diagnosticBytes), contentType: 'application/json' });
    await attachObservation(info, 'AT-N15-observation', { diagnosticSha256: sha256(diagnosticBytes), diagnosticCodes: diagnostic.records.map((row: { code: string }) => row.code), manualDownloads: downloads.length, requestDestinations: [...new Set(requests.map(request => new URL(request.url).origin))], automaticManuscriptRequests: 0, canonicalAuthorDataUnchanged: true, realAuthObserved: false });
  } finally { await contract.close(); }
});
