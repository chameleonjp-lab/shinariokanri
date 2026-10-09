import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, emptyRuntimeState, newId, validateProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { jsonBytes, sha256 } from '../../src/storage/json';

async function restore(page: Page, project: Parameters<typeof exportScenario>[0]) {
  const validation = validateProject(project); if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'structured.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await expect(page.getByRole('heading', { name: '検査済みの作品' })).toBeVisible();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
}

async function seed(page: Page) {
  const project = createProject('構造化入力の保持と修正');
  const character = createEntity(project.projectId, 'character', '別名のある人物');
  const alias = (text: string) => ({ id: newId(), text, reading: '', validity: { worldRange: null, routeCondition: { op: 'visited' as const, entityId: character.id, count: 1 }, presentationAnchor: null }, audienceHolderIds: [], isPublicDefault: true });
  character.data.aliases = [alias('削除する別名'), alias('残す別名')];
  const place = createEntity(project.projectId, 'place', '地図の場所');
  const map = createEntity(project.projectId, 'map', '数値入力の地図', { placeId: place.id, pins: [{ id: newId(), placeId: place.id, x: 0.25, y: 0.5 }, { id: newId(), placeId: place.id, x: 0.75, y: 0.5 }] });
  const variable = createEntity(project.projectId, 'variable', '参照する整数状態', { key: 'value', valueType: 'integer', initial: { type: 'integer', value: 7 }, allowed: { min: 0, max: 10 } });
  const secondVariable = createEntity(project.projectId, 'variable', '変更先の整数状態', { key: 'other_value', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } });
  const runtimeState = emptyRuntimeState(project.projectId); runtimeState.provenance = 'partial'; runtimeState.variableValues[variable.id] = { type: 'integer', value: 7 };
  const checkpoint = createEntity(project.projectId, 'checkpoint', '記録キーの検査', { contentVersionId: project.projectId, origin: 'partial', runtimeState });
  project.entities = [character, place, map, variable, secondVariable, checkpoint];
  await restore(page, project);
  return { character, map, variable, secondVariable };
}
async function open(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name: /^検索/ }).click();
  await page.getByLabel('作品内を検索').fill(name);
  await page.locator('.entity-card').filter({ hasText: name }).first().click();
  return page.locator('.detail-panel');
}

test('別名の不正な子項目を削除・種類切替・任意項目解除で修正すると保存でき、切替取消は入力を保つ', async ({ page }) => {
  const { character } = await seed(page);
  let editor = await open(page, character.name);
  await editor.getByRole('tab', { name: '詳細', exact: true }).click();
  let aliases = editor.locator('[data-field="aliases"]');
  await aliases.locator('.sd-array-item').first().getByLabel('文章', { exact: true }).fill('');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await aliases.getByRole('button', { name: '別名と公開範囲 1を削除', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, character.name); aliases = editor.locator('[data-field="aliases"]');
  await expect(aliases.locator('.sd-array-item')).toHaveCount(1);
  await expect(aliases.getByLabel('文章', { exact: true })).toHaveValue('残す別名');
  await aliases.getByLabel('count', { exact: true }).fill('-');
  await aliases.getByLabel('経路条件の種類', { exact: true }).selectOption({ label: '常に真／偽' });
  await aliases.getByRole('button', { name: '切替を取り消す', exact: true }).click();
  await expect(aliases.getByLabel('count', { exact: true })).toHaveValue('-');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await aliases.getByLabel('経路条件の種類', { exact: true }).selectOption({ label: '常に真／偽' });
  await aliases.getByRole('button', { name: '内容を確認して切り替える', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await aliases.getByLabel('文章', { exact: true }).fill('');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await aliases.getByLabel('別名と公開範囲', { exact: true }).selectOption('unset');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, character.name); aliases = editor.locator('[data-field="aliases"]');
  await expect(aliases.getByLabel('別名と公開範囲', { exact: true })).toHaveValue('unset');
  await aliases.getByLabel('別名と公開範囲', { exact: true }).selectOption('value');
  await aliases.getByRole('button', { name: '項目を追加', exact: true }).click();
  const id = await aliases.getByLabel('ID', { exact: true }).inputValue();
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await aliases.getByLabel('文章', { exact: true }).fill('フォームから追加');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, character.name); aliases = editor.locator('[data-field="aliases"]');
  await expect(aliases.getByLabel('文章', { exact: true })).toHaveValue('フォームから追加');
  await expect(aliases.getByLabel('ID', { exact: true })).toHaveValue(id);
});

test('未完成の数値を未保存入力として再表示し、非表示でも保存を止め、修正と配列削除後の値を再読込する', async ({ page }) => {
  const { map } = await seed(page);
  let editor = await open(page, map.name);
  let pins = editor.locator('[data-field="pins"]');
  await pins.locator('.sd-array-item').first().getByLabel('横位置', { exact: true }).fill('-');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '1件の未保存入力' })).toBeVisible();
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await page.getByRole('button', { name: '1件の未保存入力' }).click();
  await page.getByRole('dialog', { name: '未保存の入力' }).getByRole('button', { name: /入力へ戻る/ }).click();
  editor = page.locator('.detail-panel'); pins = editor.locator('[data-field="pins"]');
  await expect(pins.locator('.sd-array-item').first().getByLabel('横位置', { exact: true })).toHaveValue('-');
  await editor.getByText('この端末での項目と画面の表示', { exact: true }).click();
  await editor.getByLabel('場所のピンを表示').uncheck();
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await editor.getByLabel('場所のピンを表示').check();
  const x = pins.locator('.sd-array-item').first().getByLabel('横位置', { exact: true });
  await expect(x).toHaveValue('-'); await x.press('ControlOrMeta+A'); await x.press('Backspace');
  await x.pressSequentially('0.', { delay: 60 }); await expect(x).toHaveValue('0.');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await x.pressSequentially('5', { delay: 60 }); await x.press('Tab');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, map.name); pins = editor.locator('[data-field="pins"]');
  await expect(pins.locator('.sd-array-item').first().getByLabel('横位置', { exact: true })).toHaveValue('0.5');
  await pins.locator('.sd-array-item').first().getByLabel('横位置', { exact: true }).fill('-');
  await pins.getByRole('button', { name: '場所のピン 1を削除', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, map.name); pins = editor.locator('[data-field="pins"]');
  await expect(pins.locator('.sd-array-item')).toHaveCount(1);
  await expect(pins.getByLabel('横位置', { exact: true })).toHaveValue('0.75');
});

test('状態値の記録キーは状態変数から選択でき、不正な数値を含む記録項目を削除して保存する', async ({ page }) => {
  const { character, variable, secondVariable } = await seed(page);
  let editor = await open(page, '記録キーの検査');
  let values = editor.locator('[data-field="runtimeState"] .sd-record-rows').first();
  const key = values.getByLabel('項目1のキー', { exact: true });
  await expect(key).toHaveValue(variable.id);
  await expect(key).toContainText(variable.name);
  expect(await key.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).not.toContain(character.id);
  await values.getByLabel('値', { exact: true }).fill('-');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await key.selectOption(secondVariable.id);
  await expect(values.getByLabel('値', { exact: true })).toHaveValue('-');
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  editor = await open(page, '記録キーの検査'); values = editor.locator('[data-field="runtimeState"] .sd-record-rows').first();
  await expect(values.getByLabel('項目1のキー', { exact: true })).toHaveValue(secondVariable.id);
  await expect(values.getByLabel('値', { exact: true })).toHaveValue('-');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await values.getByLabel('値', { exact: true }).fill('8');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, '記録キーの検査'); values = editor.locator('[data-field="runtimeState"] .sd-record-rows').first();
  await expect(values.getByLabel('項目1のキー', { exact: true })).toHaveValue(secondVariable.id);
  await expect(values.getByLabel('値', { exact: true })).toHaveValue('8');
  await values.getByLabel('値', { exact: true }).fill('-');
  await values.getByRole('button', { name: '項目1を削除', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, '記録キーの検査'); values = editor.locator('[data-field="runtimeState"] .sd-record-rows').first();
  await expect(values.getByLabel('項目1のキー', { exact: true })).toHaveCount(0);
  await expect(values.getByLabel('新しいキー', { exact: true })).toBeVisible();
});

test('公開用の辞書の先頭キーをキーボードで変更しても位置・フォーカス・値を保ち、一時重複は復元後に修正できる', async ({ page }) => {
  const project = createProject('辞書キーの連続入力');
  const variable = createEntity(project.projectId, 'variable', '公開する状態', { key: 'public_state' });
  const profile = createEntity(project.projectId, 'projection_profile', '辞書キーの公開設定', { audience: '読者', publicValues: { [variable.id]: { true: '先頭の公開名', z_after: '次の公開名' } } });
  project.entities = [variable, profile]; await restore(page, project);
  let editor = await open(page, profile.name);
  let dictionary = editor.locator('[data-field="publicValues"] .sd-record-rows').nth(1);
  let key = dictionary.getByLabel('項目1のキー', { exact: true });
  await expect(key).toHaveValue('true');
  await expect(dictionary.getByLabel('項目1の値', { exact: true })).toHaveValue('先頭の公開名');
  await key.press('ControlOrMeta+A'); await key.press('Backspace');
  for (const character of 'false') {
    await key.pressSequentially(character, { delay: 50 });
    await expect(key).toBeFocused();
    const raw = await key.inputValue();
    expect(await key.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(raw.length);
    await expect(dictionary.getByLabel('項目1の値', { exact: true })).toHaveValue('先頭の公開名');
    await expect(dictionary.getByLabel('項目2のキー', { exact: true })).toHaveValue('z_after');
  }
  await expect(key).toHaveValue('false'); await key.press('Tab');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await key.fill('z_after');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  editor = await open(page, profile.name); dictionary = editor.locator('[data-field="publicValues"] .sd-record-rows').nth(1); key = dictionary.getByLabel('項目1のキー', { exact: true });
  await expect(key).toHaveValue('z_after');
  await expect(editor.getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await expect(dictionary.getByLabel('項目1の値', { exact: true })).toHaveValue('先頭の公開名');
  await expect(dictionary.getByLabel('項目2の値', { exact: true })).toHaveValue('次の公開名');
  await key.fill('false'); await key.press('Tab');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, profile.name); dictionary = editor.locator('[data-field="publicValues"] .sd-record-rows').nth(1);
  await expect(dictionary.getByLabel('項目1のキー', { exact: true })).toHaveValue('false');
  await expect(dictionary.getByLabel('項目2のキー', { exact: true })).toHaveValue('z_after');
  await expect(dictionary.getByLabel('項目1の値', { exact: true })).toHaveValue('先頭の公開名');
});

test('固定版の人物と段落が現在版からなくても、別名と試読状態の通常フォームから無関係な変更を保存する', async ({ page }) => {
  const project = createProject('固定版参照の通常編集');
  const source = createEntity(project.projectId, 'character', '固定版だけの人物', { body: [{ id: newId(), kind: 'paragraph', text: '昔の語句' }] });
  const variable = createEntity(project.projectId, 'variable', '固定版だけの数値', { key: 'old_value', valueType: 'integer', initial: { type: 'integer', value: 7 }, allowed: { min: 0, max: 10 } });
  project.entities = [source, variable];
  const { history: _history, snapshots: _snapshots, ...content } = structuredClone(project), snapshotId = newId(), blockId = source.data.body![0].id;
  project.snapshots.push({ id: snapshotId, versionLabel: '公開時の固定版', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) });
  const character = createEntity(project.projectId, 'character', '固定版への別名参照', { aliases: [{ id: newId(), text: '保存された別名', reading: '', validity: { worldRange: null, routeCondition: null, presentationAnchor: { entityId: source.id, blockId, start: 0, end: 2, sourceVersionId: snapshotId } }, audienceHolderIds: [], isPublicDefault: true }] });
  const state = emptyRuntimeState(snapshotId); state.provenance = 'partial'; state.seenIds = [source.id, blockId]; state.variableValues[variable.id] = { type: 'integer', value: 7 };
  const checkpoint = createEntity(project.projectId, 'checkpoint', '固定版を参照する記録', { contentVersionId: snapshotId, origin: 'partial', runtimeState: state });
  project.entities = [character, checkpoint]; await restore(page, project);
  let editor = await open(page, character.name);
  await editor.getByRole('tab', { name: '詳細', exact: true }).click();
  let aliases = editor.locator('[data-field="aliases"]');
  await expect(aliases).toContainText(source.name);
  await aliases.getByLabel('文章', { exact: true }).fill('別名だけを修正');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, character.name); aliases = editor.locator('[data-field="aliases"]');
  await expect(aliases.getByLabel('文章', { exact: true })).toHaveValue('別名だけを修正');
  await expect(aliases.locator(`option[value="${blockId}"]`)).toHaveCount(1);
  editor = await open(page, checkpoint.name);
  const runtime = editor.locator('[data-field="runtimeState"]');
  await expect(runtime.getByLabel('項目1のキー', { exact: true })).toHaveValue(variable.id);
  await expect(runtime).toContainText(variable.name);
  await editor.getByLabel('名前', { exact: true }).fill('固定版の記録名だけを修正');
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.reload(); editor = await open(page, '固定版の記録名だけを修正');
  await expect(editor.locator('[data-field="runtimeState"]').getByLabel('項目1のキー', { exact: true })).toHaveValue(variable.id);
  await expect(editor.locator(`[data-field="runtimeState"] option[value="${blockId}"]`)).toHaveCount(2);
});
