import {expect, test, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backup, navigate, openEntity, seed, retainGeneratedOutput} from './ap04-original-helpers';

// Additional composition proof. Original persona-specific cases remain separate.
// Unicode and narrow viewports are automated observations, never real IME/device evidence.
test('phase3: 空作品の通常制作から参照・試読・履歴・秘密出力・完全復元・offline再編集までつながる', async ({page, browser}, info) => {
  test.setTimeout(180_000);
  const body = '霧の門で𠮷野が😀約束を守る。\n次の段落でも同じ人物を参照する。';
  const secret = 'PHASE3_PRIVATE_作者だけの結末';
  const observations: string[] = [];
  page.on('pageerror', error => observations.push(error.message));
  async function add(kind: string, label: string, name: string) {
    await navigate(page, /^資料/);
    await page.locator('.materials-filter').getByLabel('情報の種類', {exact:true}).selectOption(kind);
    await page.getByRole('button', {name: `${label}を追加`, exact:true}).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('名前', {exact:true}).fill(name);
    await dialog.getByRole('button', {name:'編集を始める', exact:true}).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  }
  async function save(target: Page) {
    await target.locator('.editor-footer').getByRole('button', {name:/^(保存する|保存を再試行)$/}).click();
    await expect(target.locator('.editor-save-state')).toContainText('端末内保存済み');
  }
  await page.goto('./');
  await page.getByLabel('作品名', {exact:true}).fill('第3段階の連続制作');
  await page.getByRole('button', {name:'作品を作成', exact:true}).click();
  expect((await backup(page)).project.entities).toHaveLength(0);
  await add('character', '人物', '𠮷野');
  await page.locator('.detail-panel').getByLabel('情報の状態', {exact:true}).selectOption('confirmed');
  await save(page);
  await add('chapter', '章', '第一章');
  await page.locator('.detail-panel').getByLabel('情報の状態', {exact:true}).selectOption('confirmed');
  await save(page);
  await add('scene', '場面', '霧の門');
  const registered = await backup(page);
  const person = registered.project.entities.find(e => e.kind === 'character')!;
  const chapter = registered.project.entities.find(e => e.kind === 'chapter')!;
  const scene = registered.project.entities.find(e => e.kind === 'scene')!;
  await openEntity(page, 'scene', scene.name);
  const editor = page.locator('.detail-panel');
  await editor.getByLabel('情報の状態', {exact:true}).selectOption('confirmed');
  await editor.getByRole('tab', {name:'詳細', exact:true}).click();
  await editor.getByLabel('章', {exact:true}).selectOption(chapter.id);
  await editor.getByLabel('視点人物', {exact:true}).selectOption(person.id);
  await editor.getByRole('tab', {name:'本文', exact:true}).click();
  await editor.getByRole('textbox', {name:'本文', exact:true}).fill(body);
  await save(page);
  await editor.getByRole('tab', {name:'作者メモ', exact:true}).click();
  await editor.getByRole('textbox', {name:'作者メモ', exact:true}).fill(secret);
  await save(page);
  await navigate(page, /^検索/);
  await page.getByLabel('作品内を検索', {exact:true}).fill('約束を守る');
  await expect(page.locator('.entity-card h3')).toHaveText(scene.name);
  await page.locator('.entity-card').click();
  await editor.getByRole('tab', {name:'本文', exact:true}).click();
  await expect(editor.getByRole('textbox', {name:'本文', exact:true})).toHaveValue(body);
  await editor.getByRole('button', {name:'詳細を閉じる', exact:true}).click();
  await navigate(page, /^構成/);
  await page.getByRole('tab', {name:'章の試読', exact:true}).click();
  await page.getByRole('button', {name:'記録付き読書を始める', exact:true}).click();
  await page.getByRole('button', {name:'次の場面を提示', exact:true}).click();
  await expect(page.locator('.chapter-reading-presented')).toContainText('約束を守る');
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', {name:'変更履歴', exact:true}).click();
  await expect(page.locator('.history-list .reference-link').first()).toBeVisible();
  await page.getByRole('tab', {name:'作品の設定', exact:true}).click();
  await page.getByLabel('確定版の名称', {exact:true}).fill('復元前の固定版');
  await page.getByRole('button', {name:'現在の内容を確定版として保存', exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'本文と設定の確定版'})).toBeVisible();
  await page.getByRole('tab', {name:'目的別出力', exact:true}).click();
  await page.getByRole('button', {name:'公開範囲を作成', exact:true}).click();
  const dialog = page.getByRole('dialog', {name:'公開する範囲を作成', exact:true});
  await dialog.getByLabel('公開用の作品名', {exact:true}).fill('公開する門の話');
  for (const id of [person.id, chapter.id, scene.id]) await dialog.getByLabel('追加する対象', {exact:true}).selectOption(id);
  await dialog.getByLabel('選んだ対象の本文・表記を公開文へコピーする', {exact:true}).check();
  await dialog.getByRole('button', {name:'範囲を作成して内容を確認', exact:true}).click();
  await page.getByRole('button', {name:'内容を検査・プレビュー', exact:true}).click();
  // Creating a policy is not approval: the original export boundary must refuse it.
  await expect(page.locator('.export-result')).toContainText('引用固定版の公開範囲が未確認');
  await expect(page.locator('.export-result .export-artifact')).toHaveCount(0);
  await editor.getByLabel('情報の状態', {exact:true}).selectOption('confirmed');
  await save(page);
  await editor.getByRole('button', {name:'詳細を閉じる', exact:true}).click();
  await page.getByRole('button', {name:'内容を検査・プレビュー', exact:true}).click();
  const artifact = page.locator('.export-result .export-artifact');
  await expect(artifact).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', {name:'この内容を保存', exact:true}).click();
  const download = await pending, publicBytes = await readFile((await download.path())!);
  await retainGeneratedOutput(publicBytes, download.suggestedFilename(), 'text/markdown');
  expect(publicBytes.toString()).toContain('約束を守る');
  expect(publicBytes.toString()).not.toContain(secret);
  const complete = await backup(page);
  expect(complete.project.entities.find(e => e.id === scene.id)).toMatchObject({data:{chapterId:chapter.id, povId:person.id}});
  expect(JSON.stringify(complete.project.entities.find(e => e.id === scene.id))).toContain(secret);
  expect(complete.project.snapshots).toHaveLength(1);
  const fresh = await browser.newContext({viewport:{width:390, height:844}});
  try {
    const restored = await fresh.newPage();
    await seed(restored, complete.bytes);
    await restored.reload();
    const cold = await backup(restored);
    expect(cold.project).toEqual(complete.project);
    expect(cold.recovery).toBeDefined();
    expect(complete.recovery).toBeDefined();
    const originalPending = complete.recovery!.pending;
    expect(cold.recovery!.pending.filter(row => originalPending.some(old => old.operationId === row.operationId))).toEqual(originalPending);
    const restoreAudit = cold.recovery!.pending.filter(row => !originalPending.some(old => old.operationId === row.operationId));
    expect(restoreAudit).toHaveLength(1);
    expect(restoreAudit[0]!.command.reason).toContain('専用ファイルをnewで復元');
    expect(cold.recovery!.projectId).toBe(complete.recovery!.projectId);
    await fresh.setOffline(true);
    await restored.reload();
    await openEntity(restored, 'scene', scene.name);
    const name = restored.locator('.detail-panel').getByLabel('名前', {exact:true});
    await name.fill('復元後も同じ場面');
    await save(restored);
    const changed = await backup(restored);
    expect(changed.project.entities.find(e => e.id === scene.id)).toMatchObject({name:'復元後も同じ場面', data:{chapterId:chapter.id, povId:person.id}});
    expect(changed.project.history.length).toBe(cold.project.history.length+1);
    expect(changed.project.snapshots).toEqual(complete.project.snapshots);
    expect(changed.project.entities.filter(e => e.kind === 'scene')).toHaveLength(1);
  } finally { await fresh.close(); }
  expect(observations).toEqual([]);
  await info.attach('phase3-continuity.json', {body:JSON.stringify({scope:'Additional automated UI continuity, not physical/IME/Auth acceptance',
    engine:info.project.name, startedFromEmpty:true, typedReferences:{person:person.id, chapter:chapter.id, scene:scene.id},
    publicSHA256:createHash('sha256').update(publicBytes).digest('hex'), completeSHA256:createHash('sha256').update(complete.bytes).digest('hex'),
    privateAuthorNotesExcluded:true, coldFullCorrespondence:true, offlineReeditAndImmutablePin:true}), contentType:'application/json'});
});
