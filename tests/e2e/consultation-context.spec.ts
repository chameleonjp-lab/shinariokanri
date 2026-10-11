import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario, inspectScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';

async function nav(page: Page, name: RegExp) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function output(page: Page) {
  await nav(page, /^作品・保存/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
}
async function seed(page: Page, project: ProjectData) {
  const bytes = Buffer.from(await exportScenario(project));
  await test.info().attach('consultation-fixture.scenario', { body: bytes, contentType: 'application/zip' });
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'consultation.scenario', mimeType: 'application/zip', buffer: bytes });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.import-preview')).toBeHidden();
  await expect(page.locator('.app-shell')).toBeVisible();
}
async function consultationFile(page: Page) {
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  const artifact = page.locator('.export-artifact').filter({ has: page.getByRole('heading', { name: 'consultation.md', exact: true }) });
  await expect(artifact).toBeVisible();
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', { name: 'この内容を保存', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  await test.info().attach('consultation.md', { body: bytes, contentType: 'text/markdown' });
  return bytes.toString('utf8');
}
async function nativeField(page: Page, projectId: string, table: 'projects' | 'authorToolDrafts') {
  return page.evaluate(async ({ projectId, table }) => {
    for (const descriptor of await indexedDB.databases()) {
      if (!descriptor.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(descriptor.name!); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        if (!database.objectStoreNames.contains('projects') || !database.objectStoreNames.contains(table)) continue;
        const read = (name: string, key: string) => new Promise<Record<string, any> | undefined>((resolve, reject) => { const request = database.transaction(name, 'readonly').objectStore(name).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const project = await read('projects', projectId);
        if (project) return table === 'projects' ? project.revision : (await read(table, `guest:export:${projectId}`))?.fields;
      } finally { database.close(); }
    }
    throw Error('The tested project has no native stored row.');
  }, { projectId, table });
}
function fixture() {
  const project = createProject('秘密の作者作品名');
  const scene = createEntity(project.projectId, 'scene', '相談の場面S', { body: textToRichText('公開する場面Sの本文') });
  const other = createEntity(project.projectId, 'scene', '相談しない場面T', { body: textToRichText('SECRET_OTHER_SCENE') });
  const state = createEntity(project.projectId, 'variable', '作者の許可状態', { key: 'permit', valueType: 'boolean', initial: { type: 'boolean', value: false }, description: textToRichText('相談に添える状態') });
  const integer = createEntity(project.projectId, 'variable', '作者の回数', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: -10, max: 10 } });
  const confirmed = createEntity(project.projectId, 'lore', '確定設定', { body: textToRichText('公開する確定設定') });
  const provisional = createEntity(project.projectId, 'lore', '仮の設定', { body: textToRichText('公開する仮設定') });
  const secret = createEntity(project.projectId, 'lore', 'SECRET_NAME', { body: textToRichText('SECRET_BODY') });
  const event = createEntity(project.projectId, 'event', '関連する出来事');
  scene.data.eventIds = [event.id];
  project.entities.push(scene, other, state, integer, confirmed, provisional, secret, event);
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  provisional.status = 'provisional';
  const selected = [scene, state, integer, confirmed, provisional, event];
  const publicTexts = Object.fromEntries(selected.map(entity => [entity.id, Object.fromEntries(Object.entries(entity.data).filter(([key]) => ['body', 'description', 'key'].includes(key)).map(([key, value]) => [key, Array.isArray(value) ? value.map(block => ({ ...block, id: newId() })) : value]))]));
  const policy = createEntity(project.projectId, 'projection_profile', 'S周辺の相談範囲', { audience: 'consultation', publicTitle: '公開する相談', includedStatuses: ['confirmed', 'provisional', 'needs_review'], includedIds: selected.map(entity => entity.id), allowedKinds: [...new Set(selected.map(entity => entity.kind))], idPolicy: 'remap', publicIds: Object.fromEntries(selected.map(entity => [entity.id, newId()])), namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(selected.map(entity => [entity.id, { mode: 'replace' as const, replacement: entity.id === state.id ? '公開する許可状態' : entity.id === integer.id ? '公開する回数' : entity.name }])) }, publicTexts });
  policy.status = 'confirmed'; project.entities.push(policy);
  return { project, scene, state, integer, policy, secret, provisional };
}

test.beforeEach(async ({ browser, browserName, page }) => {
  await test.info().attach('browser-environment.json', { body: JSON.stringify({ capturedAt: new Date().toISOString(), browserName, actualVersion: browser.version(), viewport: page.viewportSize(), nodeVersion: process.version, physicalDevice: false, actualAuthRlsStorage: false }), contentType: 'application/json' });
});

test('相談の前後状態を版・範囲付き下書きとしてcold再開し、承認した値と未確定事項だけを実MDへ出力する', async ({ page }) => {
  test.setTimeout(180000);
  const f = fixture(), pinned = await createWorldSnapshot(f.project, '相談の旧版'), pin = pinned.snapshots.at(-1)!;
  const outbound: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) outbound.push(url.origin); });
  await seed(page, pinned); await output(page);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(f.policy.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('consultation');
  const context = page.getByRole('region', { name: '相談に添える対象と前後状態' });
  await context.getByLabel('追加する対象', { exact: true }).selectOption(f.scene.id);
  await context.getByLabel('相談へ前後状態を追加', { exact: true }).selectOption(f.state.id);
  const before = context.getByRole('group', { name: '前の状態 · 公開する許可状態' }), after = context.getByRole('group', { name: '後の状態 · 公開する許可状態' });
  await before.getByLabel('値の型', { exact: true }).selectOption('boolean');
  await after.getByLabel('値の型', { exact: true }).selectOption('boolean');
  await after.getByLabel('真偽値', { exact: true }).selectOption('true');
  await nav(page, /^資料/); await page.reload(); await output(page);
  await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-panel > [role=alert]')).toContainText('再確認');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  const markdown = await consultationFile(page);
  expect(markdown).toContain('### 前の状態'); expect(markdown).toContain('公開する許可状態: false');
  expect(markdown).toContain('### 後の状態'); expect(markdown).toContain('公開する許可状態: true');
  expect(markdown).toContain('未確定事項'); expect(markdown).toContain('仮の設定');
  expect(markdown).toContain('確定設定'); expect(markdown).toContain('関連する出来事');
  expect(markdown).toContain(f.policy.data.publicIds![f.scene.id]);
  expect(markdown).not.toMatch(/SECRET_|秘密の作者作品名|作者の許可状態/); expect(outbound).toEqual([]);
  await page.getByLabel('出力する作品版', { exact: true }).selectOption(pin.id);
  await expect(context.getByRole('group', { name: '後の状態 · 公開する許可状態' })).toHaveCount(0);
  await page.getByLabel('出力する作品版', { exact: true }).selectOption('');
  await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
  await after.getByLabel('値の型', { exact: true }).selectOption('unknown');
  await after.getByLabel('未設定の理由', { exact: true }).fill('SECRET_UNKNOWN_REASON');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  const unknown = await consultationFile(page); expect(unknown).toContain('公開する許可状態: 未確定'); expect(unknown).not.toContain('SECRET_UNKNOWN_REASON');
  const proposal = page.locator('.consultation-import');
  await proposal.locator('summary').click();
  await proposal.getByLabel('提案の出所', { exact: true }).fill('作者が確認した consultation.md');
  await proposal.getByLabel('提案の相談対象版', { exact: true }).selectOption(pin.id);
  await proposal.getByLabel('提案を比較する本文対象', { exact: true }).selectOption(f.scene.id);
  await proposal.getByLabel('提案MDを選ぶ', { exact: true }).setInputFiles({ name: 'proposal.md', mimeType: 'text/markdown', buffer: Buffer.from('😀相談から届いた変更候補') });
  await expect(proposal.getByLabel('提案Markdown', { exact: true })).toHaveValue('😀相談から届いた変更候補');
  await proposal.getByRole('button', { name: '提案の別案差分を確認', exact: true }).click();
  await proposal.getByRole('button', { name: '提案を作者別案として保存', exact: true }).click();
  await expect(proposal.getByRole('status')).toContainText('作者別案へ保存');
  await page.reload(); await nav(page, /^構成/);
  await page.getByRole('tab', { name: '作者別案', exact: true }).click();
  await page.getByLabel('別案内の編集対象', { exact: true }).selectOption(f.scene.id);
  await expect(page.getByLabel('別案内の場面本文', { exact: true })).toHaveValue('😀相談から届いた変更候補');
  await expect(page.locator('.alternative-diff-list')).toContainText('公開する場面Sの本文');
  await nav(page, /^作品・保存/); await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const full = page.waitForEvent('download'); await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const fullBytes = await readFile((await (await full).path())!);
  await test.info().attach('consultation-complete.scenario', { body: fullBytes, contentType: 'application/zip' });
  const restored = await inspectScenario(new Uint8Array(fullBytes), { worker: false });
  expect(restored.project.entities.find(entity => entity.id === f.state.id)).toMatchObject({ data: { initial: { type: 'boolean', value: false } } });
  expect(restored.project.entities.find(entity => entity.id === f.secret.id)).toMatchObject({ name: 'SECRET_NAME' });
  expect(restored.project.snapshots.find(snapshot => snapshot.id === pin.id)?.contentHash).toBe(pin.contentHash);
  expect(restored.project.entities.find(entity => entity.id === f.scene.id)).toMatchObject({ data: { body: [{ text: '公開する場面Sの本文' }] } });
  expect(restored.project.authorAlternatives?.[0].applyReceipts).toHaveLength(0);
  expect(restored.project.authorAlternatives?.[0].versions.at(-1)?.content.entities.find(entity => entity.kind === 'note')?.customValues).toMatchObject({ consultationSource: '作者が確認した consultation.md', consultationTargetVersionId: pin.id });
  expect(outbound).toEqual([]);
});

test('相談の保存失敗後も新しい入力をcold再開し、作品の更新後は同じ入力の確認をやり直す', async ({ page }) => {
  test.setTimeout(180000);
  const f = fixture(); await seed(page, f.project); await output(page);
  await page.getByLabel('出力目的', { exact: true }).selectOption('consultation');
  const context = page.getByRole('region', { name: '相談に添える対象と前後状態' });
  await context.getByLabel('追加する対象', { exact: true }).selectOption(f.scene.id);
  await context.getByLabel('相談へ前後状態を追加', { exact: true }).selectOption(f.state.id);
  const before = context.getByRole('group', { name: '前の状態 · 公開する許可状態' }), after = context.getByRole('group', { name: '後の状態 · 公開する許可状態' });
  await before.getByLabel('値の型', { exact: true }).selectOption('boolean');
  await after.getByLabel('値の型', { exact: true }).selectOption('boolean');
  const draftKey = `${f.project.projectId}:${f.policy.id}`;
  await expect.poll(async () => (await nativeField(page, f.project.projectId, 'authorToolDrafts'))?.consultationDrafts?.[draftKey]?.afterValues?.[f.state.id]).toEqual({ type: 'boolean', value: false });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (fail && this.name === 'authorToolDrafts') { fail = false; throw new DOMException('fixture draft quota', 'QuotaExceededError'); }
      return put.apply(this, args);
    };
  });
  await after.getByLabel('真偽値', { exact: true }).selectOption('true');
  await expect(page.locator('.export-panel > p[role=alert]')).toContainText('下書き保存に失敗');
  // A newer database success must repair an older local pending value even
  // when both the new localStorage write and its ACK repair fail.
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    let failures = 2;
    Storage.prototype.setItem = function (key, value) {
      if (failures > 0 && key.startsWith('scenario-author-input:')) { failures--; throw new DOMException('fixture local quota', 'QuotaExceededError'); }
      return setItem.call(this, key, value);
    };
  });
  await after.getByLabel('真偽値', { exact: true }).selectOption('false');
  await expect(page.locator('.export-panel > p[role=alert]')).toHaveCount(0);
  await expect.poll(async () => (await nativeField(page, f.project.projectId, 'authorToolDrafts'))?.consultationDrafts?.[draftKey]?.afterValues?.[f.state.id]).toEqual({ type: 'boolean', value: false });
  await page.reload(); await output(page); await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('false');
  // Reproduce the database-only failure again, then check its retained input.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (fail && this.name === 'authorToolDrafts') { fail = false; throw new DOMException('fixture draft quota again', 'QuotaExceededError'); }
      return put.apply(this, args);
    };
  });
  await after.getByLabel('真偽値', { exact: true }).selectOption('true');
  await expect(page.locator('.export-panel > p[role=alert]')).toContainText('下書き保存に失敗');
  await nav(page, /^資料/); await output(page); await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
  await page.reload(); await output(page); await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  expect(await consultationFile(page)).toContain('公開する許可状態: true');
  const revision = await nativeField(page, f.project.projectId, 'projects');
  await nav(page, /^検索/); await page.getByLabel('作品内を検索', { exact: true }).fill('相談の場面S');
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: '相談の場面S', exact: true }) }).click();
  await page.getByLabel('名前', { exact: true }).fill('相談の場面S 更新');
  await expect.poll(() => nativeField(page, f.project.projectId, 'projects')).not.toBe(revision);
  await output(page); await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-panel > div[role=alert]')).toContainText('再確認');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  expect(await consultationFile(page)).toContain('公開する許可状態: true');
});

test('相談の整数入力途中を移動とcoldから保持し、範囲外を拒否して修正した値だけ実MDへ出力する', async ({ page }) => {
  test.setTimeout(180000);
  const f = fixture(); await seed(page, f.project); await output(page);
  await page.getByLabel('出力目的', { exact: true }).selectOption('consultation');
  const context = page.getByRole('region', { name: '相談に添える対象と前後状態' });
  await context.getByLabel('追加する対象', { exact: true }).selectOption(f.scene.id);
  await context.getByLabel('相談へ前後状態を追加', { exact: true }).selectOption(f.integer.id);
  const after = context.getByRole('group', { name: '後の状態 · 公開する回数' });
  await after.getByLabel('値の型', { exact: true }).selectOption('integer');
  await after.getByLabel('値', { exact: true }).fill('-');
  await nav(page, /^資料/); await page.reload(); await output(page);
  await expect(after.getByLabel('値', { exact: true })).toHaveValue('-');
  await expect(context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-panel > div[role=alert]')).toContainText('整数の入力途中');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  await after.getByLabel('値', { exact: true }).fill('1e');
  await nav(page, /^資料/); await page.reload(); await output(page);
  await expect(after.getByLabel('値', { exact: true })).toHaveValue('1e');
  await after.getByLabel('値', { exact: true }).fill('11');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-result')).toContainText('出力を停止しました');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  await expect(after.getByLabel('値', { exact: true })).toHaveValue('11');
  await after.getByLabel('値', { exact: true }).fill('-3');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  expect(await consultationFile(page)).toContain('公開する回数: \\-3');
});

test('下書きの手動再試行で最新DB保存を確認し、失敗したキャッシュ更新の案内を消さずcold再開する', async ({ page }) => {
  test.setTimeout(180000);
  const f = fixture(); await seed(page, f.project); await output(page);
  await page.getByLabel('出力目的', { exact: true }).selectOption('consultation');
  const context = page.getByRole('region', { name: '相談に添える対象と前後状態' });
  await context.getByLabel('追加する対象', { exact: true }).selectOption(f.scene.id);
  await context.getByLabel('相談へ前後状態を追加', { exact: true }).selectOption(f.state.id);
  const after = context.getByRole('group', { name: '後の状態 · 公開する許可状態' });
  await after.getByLabel('値の型', { exact: true }).selectOption('boolean');
  const draftKey = `${f.project.projectId}:${f.policy.id}`;
  await expect.poll(async () => (await nativeField(page, f.project.projectId, 'authorToolDrafts'))?.consultationDrafts?.[draftKey]?.afterValues?.[f.state.id]).toEqual({ type: 'boolean', value: false });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let failures = 2;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (failures > 0 && this.name === 'authorToolDrafts') { failures--; throw new DOMException('fixture retry quota', 'QuotaExceededError'); }
      return put.apply(this, args);
    };
  });
  await after.getByLabel('真偽値', { exact: true }).selectOption('true');
  await expect(page.locator('.export-panel > p[role=alert]')).toContainText('下書き保存に失敗');
  await context.getByRole('button', { name: 'この範囲・版の相談内容を確認', exact: true }).click();
  await expect(page.locator('.export-panel > p[role=alert]')).toContainText('下書き保存に失敗');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem;
    let writeFailure = true, removeFailure = true;
    Storage.prototype.setItem = function (key, value) {
      if (writeFailure && key.startsWith('scenario-author-input:')) { writeFailure = false; throw new DOMException('fixture cache repair quota', 'QuotaExceededError'); }
      return setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (removeFailure && key.startsWith('scenario-author-input:')) { removeFailure = false; throw new DOMException('fixture cache removal denied', 'SecurityError'); }
      return removeItem.call(this, key);
    };
  });
  expect(await consultationFile(page)).toContain('公開する許可状態: true');
  await expect(page.locator('.export-panel > p[role=alert]')).toContainText('一時キャッシュの更新に失敗');
  expect((await nativeField(page, f.project.projectId, 'authorToolDrafts'))?.consultationDrafts?.[draftKey]?.afterValues?.[f.state.id]).toEqual({ type: 'boolean', value: true });
  await page.reload(); await output(page); await expect(after.getByLabel('真偽値', { exact: true })).toHaveValue('true');
});
