import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { createEntity, createProject, emptyValidity, ID_PATTERN, newId, textToRichText } from '../../src/domain/model';
import type { Entity, ProjectData } from '../../src/domain/types';
import { prepareAsset } from '../../src/domain/attachments';
import { createSharedCommentReview } from '../../src/domain/sharedReviews';
import { sharedReviewFixture } from '../../src/testing/sharedReviewFixture';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

// Budget for repeated normal UI/cold/full-file operations only. Original
// acceptance performance limits, exploration limits and assertions are intact.
test.setTimeout(180_000);

// Original-clause entrances only. Authenticated reviewer, physical-device and
// real synchronization observations for F29/F30/F31/F33/F34 remain external.
// No authored entrance is acceptance evidence before the fixed build runs it.
type InputMode = 'tap' | 'keyboard';
async function activate(control: Locator, mode: InputMode) {
  if (mode === 'tap') await control.tap(); else await control.press('Enter');
}
async function choose(control: Locator, value: string, mode: InputMode) {
  if (mode === 'tap') return control.selectOption(value);
  const index = await control.locator('option').evaluateAll((options, selected) =>
    options.findIndex(option => (option as HTMLOptionElement).value === selected), value);
  if (index < 0) throw new Error(`通常フォームに選択肢がありません: ${value}`);
  await control.press('Home');
  for (let step = 0; step < index; step++) await control.press('ArrowDown');
  await control.press('Tab');
  await expect(control).toHaveValue(value);
}
async function modeNavigate(page: Page, name: RegExp, mode: InputMode) {
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await activate(menu, mode);
  await activate(page.locator('.sidebar').getByRole('button', { name }).first(), mode);
}
async function work(page: Page, tab: string) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: tab, exact: true }).click();
}
async function saveEditor(page: Page) {
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
}
function record<K extends Entity['kind']>(p: Pick<ProjectData, 'entities'>, id: string, kind: K): Entity<K> {
  const found = p.entities.find(entity => entity.id === id);
  if (!found || found.kind !== kind) throw new Error(`${kind}の保存対象がありません: ${id}`);
  return found as Entity<K>;
}
async function archiveWithInvalidCustomValue(bytes: Uint8Array, personId: string) {
  // A valid container and current hashes isolate the declared custom type error
  // from ZIP corruption. This input never writes the application's database.
  const files = unzipSync(bytes);
  const project = JSON.parse(strFromU8(files['data/project.json'])) as ProjectData;
  record(project, personId, 'character').customValues.affiliation = 25;
  files['data/project.json'] = new TextEncoder().encode(JSON.stringify(project));
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { files: { path: string; byteSize: number; sha256: string }[] };
  const row = manifest.files.find(file => file.path === 'data/project.json')!;
  row.byteSize = files['data/project.json'].byteLength;
  row.sha256 = createHash('sha256').update(files['data/project.json']).digest('hex');
  files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  return zipSync(files);
}

test.describe('AT-F32 常時見えるボタンと一覧の操作', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 900 } });
  for (const mode of ['tap', 'keyboard'] as const) {
    test(`AT-F32 ${mode} だけで線の作成・順序移動・一括編集を保存し cold で照合する`, async ({ page }, info) => {
      const p = createProject(`AT-F32 ボタン操作 ${mode}`);
      const a = createEntity(p.projectId, 'character', 'ボタンの人物A');
      const b = createEntity(p.projectId, 'character', 'ボタンの人物B');
      const first = createEntity(p.projectId, 'scene', '一番目の場面', { body: textToRichText('一番目の本文') });
      const second = createEntity(p.projectId, 'scene', '二番目の場面', { body: textToRichText('二番目の本文') });
      const chapter = createEntity(p.projectId, 'chapter', '順序を動かす章', { sceneIds: [first.id, second.id] });
      first.data.chapterId = second.data.chapterId = chapter.id;
      const notes = [createEntity(p.projectId, 'note', '一括対象A'), createEntity(p.projectId, 'note', '一括対象B')];
      p.entities.push(a, b, first, second, chapter, ...notes);
      for (const entity of [a, b, first, second, chapter]) entity.status = 'confirmed';
      const bytes = await exportScenario(p);
      await attachGiven(info, 'AT-F32', bytes, { mode, characterIds: [a.id, b.id], chapterId: chapter.id, sceneIds: [first.id, second.id], bulkIds: notes.map(note => note.id) });
      await seed(page, bytes);

      await modeNavigate(page, /^年表/, mode);
      await activate(page.getByRole('tab', { name: '関係表・図', exact: true }), mode);
      await activate(page.getByRole('button', { name: '関係表', exact: true }), mode);
      await activate(page.getByRole('button', { name: '関係を追加', exact: true }), mode);
      const relation = page.getByRole('dialog', { name: '意味付きの関係を編集', exact: true });
      await choose(relation.getByLabel('関係の種類', { exact: true }), 'related', mode);
      await choose(relation.getByRole('combobox', { name: '関係の始点', exact: true }), a.id, mode);
      await choose(relation.getByRole('combobox', { name: '関係の終点', exact: true }), b.id, mode);
      await choose(relation.getByLabel('関係の向き', { exact: true }), 'forward', mode);
      await activate(relation.getByRole('button', { name: '関係を保存', exact: true }), mode);
      await expect(relation).toBeHidden();
      await expect(page.locator('.world-relation-table')).toContainText('関連');
      await activate(page.getByRole('button', { name: '関係図', exact: true }), mode);
      const node = page.getByRole('button', { name: `${a.name}を選択。矢印キーで配置を移動、Enterで詳細`, exact: true });
      const x = Number(await node.locator('text').getAttribute('x'));
      if (mode === 'tap') await node.tap(); else await node.press(' ');
      if (mode === 'tap') await activate(page.getByRole('button', { name: '選択項目を→へ移動', exact: true }), mode);
      else await node.press('ArrowRight');
      await expect(node.locator('text')).toHaveAttribute('x', String(x + 20));

      await modeNavigate(page, /^構成/, mode);
      await activate(page.getByRole('tab', { name: '章・本文', exact: true }), mode);
      await choose(page.getByRole('combobox', { name: '物語の並べ方', exact: true }), 'chapter', mode);
      await expect(page.getByRole('combobox', { name: '物語の並べ方', exact: true })).toHaveValue('chapter');
      const secondCard = page.locator(`[data-scene-id="${second.id}"]`);
      await expect(secondCard.getByRole('button', { name: '前へ', exact: true })).toBeVisible();
      await activate(secondCard.getByRole('button', { name: '前へ', exact: true }), mode);
      await expect(page.locator('.story-lane').filter({ hasText: chapter.name }).locator('[data-scene-id]').first()).toHaveAttribute('data-scene-id', second.id);

      await modeNavigate(page, /^検索/, mode);
      await activate(page.getByRole('tab', { name: '複合検索・一覧', exact: true }), mode);
      await choose(page.locator('.search-page').getByLabel('情報の種類', { exact: true }), 'note', mode);
      const bulk = page.locator('.search-page details').filter({ has: page.locator('summary').filter({ hasText: '結果をまとめて編集' }) });
      await activate(bulk.locator('summary'), mode);
      await activate(bulk.getByRole('button', { name: '結果をすべて選択', exact: true }), mode);
      await choose(bulk.getByLabel('まとめて設定する状態', { exact: true }), 'needs_review', mode);
      await activate(bulk.getByRole('button', { name: '変更差分を確認', exact: true }), mode);
      const preview = page.getByRole('dialog', { name: '変更差分の確認', exact: true });
      await expect(preview).toContainText(notes[0].name);
      await expect(preview).toContainText(notes[1].name);
      await activate(preview.getByRole('button', { name: '差分を確定して保存', exact: true }), mode);
      await expect(preview).toBeHidden();
      await expect(page.locator('.search-page').getByRole('status')).toContainText('一括変更を保存');

      const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
      expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i);
      // Supplemental text enlargement is recorded separately from real browser
      // zoom; it verifies that the normal button/list forms remain reachable.
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await expect(bulk.locator('summary')).toBeVisible();
      await expect(page.locator('.search-page').getByRole('button', { name: '表', exact: true })).toBeVisible();
      await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
      await page.reload();
      const cold = await backup(page);
      expect(cold.project.relations).toHaveLength(1);
      expect(cold.project.relations[0]).toMatchObject({ fromId: a.id, toId: b.id, relationType: 'related', direction: 'forward' });
      expect(record(cold.project, chapter.id, 'chapter').data.sceneIds).toEqual([second.id, first.id]);
      for (const note of notes) expect(record(cold.project, note.id, 'note').status).toBe('needs_review');
      for (const scene of [first, second]) expect(record(cold.project, scene.id, 'scene').data).toEqual(scene.data);
      await attachObservation(info, 'AT-F32-observed', { mode, sceneOrder: record(cold.project, chapter.id, 'chapter').data.sceneIds, relation: cold.project.relations[0], bulkIds: notes.map(note => note.id), viewport, supplementalFontScale: '200%', physicalBrowserTextZoom: 'not_run' });
    });
  }
});

test('AT-F56 同名人物と参照 ID を保って改名し、必須・空欄・型変更の影響と不正型の読み込みを確認する', async ({ page }, info) => {
  const p = createProject('AT-F56 同名と型付き追加項目');
  const a = createEntity(p.projectId, 'character', '同名の人物');
  const b = createEntity(p.projectId, 'character', '同名の人物');
  const template = createEntity(p.projectId, 'template', '同名人物の雛形', { targetKind: 'character', fields: [
    { key: 'affiliation', label: '所属', type: 'enum', required: false, nullable: true, default: '独立', allowedValues: ['独立', '町'] },
    { key: 'peer', label: '対応人物', type: 'ref', required: true, nullable: false, default: { type: 'ref', value: a.id }, targetKinds: ['character'] },
    { key: 'optionalText', label: '空欄を許す文章', type: 'text', required: false, nullable: true, default: null },
    { key: 'requiredText', label: '必須の文章', type: 'text', required: true, nullable: false, default: '初期の必須文' },
  ] });
  a.templateId = b.templateId = template.id;
  a.customValues = { affiliation: '町', peer: { type: 'ref', value: b.id }, optionalText: null, requiredText: '人物Aの必須文' };
  b.customValues = { affiliation: '独立', peer: { type: 'ref', value: a.id }, optionalText: '人物Bの自由文', requiredText: '人物Bの必須文' };
  const runA = createEntity(p.projectId, 'variable', '同じ表示名の状態', { key: 'run-a', scope: 'run', initial: { type: 'boolean', value: false } });
  const runB = createEntity(p.projectId, 'variable', '同じ表示名の状態', { key: 'run-b', scope: 'run', initial: { type: 'boolean', value: false } });
  const ownA = createEntity(p.projectId, 'variable', '人物別の同じ状態キー', { key: 'owned-key', scope: 'character', ownerId: a.id, initial: { type: 'boolean', value: false } });
  const ownB = createEntity(p.projectId, 'variable', '人物別の同じ状態キー', { key: 'owned-key', scope: 'character', ownerId: b.id, initial: { type: 'boolean', value: false } });
  p.entities.push(a, b, template, runA, runB, ownA, ownB);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F56', bytes, { sameNameIds: [a.id, b.id], templateId: template.id, typedReferenceValues: [a.customValues.peer, b.customValues.peer], enumValues: [a.customValues.affiliation, b.customValues.affiliation], scopedKeys: [runA.id, runB.id, ownA.id, ownB.id] });
  await seed(page, bytes);

  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('character');
  const sameNameCards = page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: a.name, exact: true }) });
  await expect(sameNameCards).toHaveCount(2);
  await sameNameCards.first().click();
  await page.locator('.detail-panel summary').filter({ hasText: 'IDと履歴情報' }).click();
  await expect(page.locator('.detail-panel .record-meta dd').first()).toHaveText(a.id);
  await expect(page.locator('.detail-panel').getByLabel('必須の文章', { exact: true })).toHaveValue('人物Aの必須文');
  const renamed = 'IDを保持して改名した人物A';
  await page.locator('.detail-panel').getByLabel('名前', { exact: true }).fill(renamed);
  await saveEditor(page);
  await openEntity(page, 'character', b.name);
  await expect(page.locator('.detail-panel .record-meta dd').first()).toHaveText(b.id);
  const peer = page.locator('.detail-panel').getByLabel('対応人物', { exact: true });
  await expect(peer).toHaveValue(a.id);
  await expect(peer.locator('option:checked')).toContainText(renamed);
  await expect(peer.locator('option:checked')).toContainText(a.id);

  await openEntity(page, 'character', renamed);
  const required = page.locator('.detail-panel').getByLabel('必須の文章', { exact: true });
  const beforeEmpty = await authorFingerprint(page);
  await required.fill('');
  await expect(page.locator('.custom-fields')).toContainText('必須の文章');
  await expect(page.locator('.custom-fields').getByRole('alert').first()).toContainText('宣言したtext型');
  await expect(page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
  await expect(required).toHaveValue('');
  expect(await authorFingerprint(page)).toBe(beforeEmpty);
  await required.fill('人物Aの必須文');
  await saveEditor(page);
  const optional = page.locator('.custom-fields [data-field="optionalText"]');
  await optional.getByRole('button', { name: '未設定にする', exact: true }).click();
  await saveEditor(page);
  await optional.getByRole('button', { name: '空欄にする', exact: true }).click();
  await saveEditor(page);
  const optionalSaved = await backup(page);
  expect(record(optionalSaved.project, a.id, 'character').customValues.optionalText).toBeNull();
  expect(record(optionalSaved.project, b.id, 'character').customValues.peer).toEqual({ type: 'ref', value: a.id });

  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('variable');
  // The same display name is allowed; select the second saved variable by its
  // ordinary card order and assert its separate key before attempting a clash.
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: runB.name, exact: true }) }).nth(1).click();
  await expect(page.locator('.detail-panel .record-meta dd').first()).toHaveText(runB.id);
  const key = page.locator('.detail-panel').getByLabel('一意の状態キー', { exact: true });
  await expect(key).toHaveValue(runB.data.key);
  const beforeDuplicate = await authorFingerprint(page);
  await key.fill(runA.data.key);
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.detail-panel').getByRole('alert')).toContainText('同じスコープでキーが重複');
  await expect(key).toHaveValue(runA.data.key);
  expect(await authorFingerprint(page)).toBe(beforeDuplicate);
  await key.fill(runB.data.key);
  await saveEditor(page);

  await openEntity(page, 'template', template.name);
  const editor = page.locator('.detail-panel');
  const beforeType = await authorFingerprint(page);
  await editor.getByLabel('項目1の型', { exact: true }).selectOption('number');
  await editor.getByLabel('項目1を必須にする', { exact: true }).check();
  await editor.getByLabel('項目1で空欄を許可', { exact: true }).uncheck();
  await editor.getByLabel('項目1の初期値', { exact: true }).fill('0');
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '雛形の変更・適用差分', exact: true });
  for (const person of [a, b]) {
    const impact = preview.locator('.template-impact').filter({ has: page.getByRole('heading', { level: 4 }).filter({ hasText: person.id }) });
    await expect(impact).toContainText('現在の値を保持します');
    await expect(impact).toContainText(String(person.customValues.affiliation));
  }
  await expect(preview.getByRole('button', { name: 'この差分を一括保存', exact: true })).toBeDisabled();
  expect(await authorFingerprint(page)).toBe(beforeType);
  await preview.getByRole('button', { name: '中止', exact: true }).click();
  await editor.getByRole('button', { name: '保存済みの内容へ戻す', exact: true }).click();
  await expect(editor.getByLabel('項目1の型', { exact: true })).toHaveValue('enum');
  await editor.getByLabel('項目3を必須にする', { exact: true }).check();
  await editor.getByLabel('項目3で空欄を許可', { exact: true }).uncheck();
  await editor.getByLabel('項目3の初期値', { exact: true }).fill('必須へ変更する案');
  await editor.getByRole('button', { name: '保存前の差分を確認', exact: true }).click();
  await expect(preview.locator('.template-impact').filter({ has: page.getByRole('heading', { level: 4 }).filter({ hasText: a.id }) })).toContainText('空欄（null）');
  await expect(preview.getByRole('button', { name: 'この差分を一括保存', exact: true })).toBeDisabled();
  expect(await authorFingerprint(page)).toBe(beforeType);
  await preview.getByRole('button', { name: '中止', exact: true }).click();
  await editor.getByRole('button', { name: '保存済みの内容へ戻す', exact: true }).click();
  await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();

  const beforeImport = await backup(page);
  const invalidBytes = await archiveWithInvalidCustomValue(beforeImport.bytes, a.id);
  const fingerprint = await authorFingerprint(page);
  await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: 'invalid-enum-number.scenario', mimeType: 'application/zip', buffer: Buffer.from(invalidBytes) });
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText('affiliation');
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText(/enum型|選択候補/);
  expect(await authorFingerprint(page)).toBe(fingerprint);
  await page.reload();
  const cold = await backup(page);
  expect(cold.project).toEqual(beforeImport.project);
  expect(record(cold.project, a.id, 'character')).toMatchObject({ name: renamed, templateId: template.id, customValues: a.customValues });
  expect(record(cold.project, b.id, 'character')).toMatchObject({ name: b.name, templateId: template.id, customValues: b.customValues });
  expect(record(cold.project, template.id, 'template').data).toEqual(template.data);
  for (const variable of [runA, runB, ownA, ownB]) expect(record(cold.project, variable.id, 'variable').data).toEqual(variable.data);
  await attachObservation(info, 'AT-F56-observed', { sameNameIds: [a.id, b.id], renamedId: a.id, references: [a.customValues.peer, b.customValues.peer], preservedEnumValues: [a.customValues.affiliation, b.customValues.affiliation], typeChangeRefusedWithImpact: true, nullableChangeRefusedWithImpact: true, invalidFileSha256: createHash('sha256').update(invalidBytes).digest('hex'), coldRevision: cold.project.revision });
});

async function injectOneAtomicQuotaFailure(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let pending = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (pending && this.name === 'projects') {
        pending = false;
        throw new DOMException('AT-F35 declared atomic quota failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
}
async function durableRecoveryImage(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const normalize = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
      if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
      return value;
    };
    try {
      const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'worlds', 'restorePoints', 'recoveredPending', 'recordParts', 'syncMetadata', 'importLogs'].filter(name => db.objectStoreNames.contains(name));
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => new Promise<unknown>((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve(normalize(request.result));
        request.onerror = () => reject(request.error);
      })));
      return JSON.stringify(Object.fromEntries(names.map((name, index) => [name, rows[index]])));
    } finally { db.close(); }
  });
}
async function selectRestoreFile(page: Page, bytes: Uint8Array, mode: 'clone' | 'replace' | 'merge', targetId?: string) {
  await work(page, '完全保存・復元');
  await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: 'AT-F35-downloaded.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await page.getByLabel('復元方法', { exact: true }).selectOption(mode);
  if (targetId) await page.getByLabel('復元する対象作品', { exact: true }).selectOption(targetId);
  await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
}
function portableMeaning(p: ProjectData) {
  return {
    records: p.entities.map(entity => ({ id: entity.id, kind: entity.kind, name: entity.name, data: entity.data })),
    relations: p.relations.map(relation => ({ id: relation.id, fromId: relation.fromId, toId: relation.toId, direction: relation.direction, relationType: relation.relationType, validity: relation.validity, evidenceIds: relation.evidenceIds })),
    calendars: p.calendars, mainStart: p.mainStart,
  };
}

test('AT-F35 条件・線・実素材・巨大 tick・通常保存履歴を完全 new/clone 復元し、単体・統合の失敗を原子 rollback する', async ({ page, browser, baseURL }, info) => {
  const p = createProject('AT-F35 全対応を保持する完全保存');
  const a = createEntity(p.projectId, 'character', '巨大日時を知る人物A');
  const b = createEntity(p.projectId, 'character', '矢印の人物B');
  const hugeTick = '12345678901234567890123456789012345678';
  const event = createEntity(p.projectId, 'event', '数値丸めを許さない出来事', { time: { mode: 'instant', at: hugeTick, calendarId: p.calendarId }, participants: [{ characterId: a.id, role: 'witness' }, { characterId: b.id, role: 'actor' }] });
  const scene = createEntity(p.projectId, 'scene', '単体履歴を持つ場面', { body: textToRichText('初期の本文😀'), eventIds: [event.id] });
  const chapter = createEntity(p.projectId, 'chapter', '番号と段落を保持する章', { sceneIds: [scene.id] });
  scene.data.chapterId = chapter.id;
  const variable = createEntity(p.projectId, 'variable', '保存する条件の状態', { key: 'portable-key', scope: 'run', initial: { type: 'boolean', value: true } });
  const entry = createEntity(p.projectId, 'flow_node', '復元する入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '復元する終端', { nodeType: 'terminal', terminalReason: '条件とIDを保持して終了' });
  const edge = createEntity(p.projectId, 'flow_edge', '条件と矢印を復元する接続', { fromId: entry.id, toId: end.id, label: '条件を満たして次へ', condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  const graph = createEntity(p.projectId, 'flow_graph', '完全復元する分岐', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  const prepared = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '対応を保持する実音声.wav');
  const { bytes: assetBytes, preview: _assetPreview, ...metadata } = prepared;
  const asset = createEntity(p.projectId, 'attachment', '完全復元する実音声', metadata);
  p.entities.push(a, b, event, scene, chapter, variable, entry, end, edge, graph, asset);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  p.relations.push({ id: newId(), projectId: p.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [event.id], status: 'confirmed', visibility: 'private' });
  await seed(page, await exportScenario(p, { loadAsset: hash => hash === prepared.contentHash ? assetBytes : undefined }));

  // Construct the original given's unit history through genuine ordinary saves.
  // The given attached below is the downloaded native image after those saves.
  await openEntity(page, 'scene', scene.name);
  await page.getByRole('tab', { name: '本文', exact: true }).click();
  const body = page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true });
  const historicalBody = '初期の本文😀 単体復元する版1';
  const currentBody = '初期の本文😀 全体復元する最新版2';
  const initialBlockId = scene.data.body[0].id;
  expect(initialBlockId).toMatch(ID_PATTERN);
  await body.fill(historicalBody); await saveEditor(page);
  const firstSaved = await backup(page);
  const historicalScene = record(firstSaved.project, scene.id, 'scene');
  expect(historicalScene.id).toBe(scene.id);
  expect(historicalScene.data.body).toHaveLength(1);
  const historicalBlockId = historicalScene.data.body[0].id;
  expect(historicalBlockId).toMatch(ID_PATTERN);
  expect(historicalBlockId).not.toBe(initialBlockId);
  expect(historicalScene.data).toEqual({ ...scene.data, body: [{ ...scene.data.body[0], id: historicalBlockId, text: historicalBody }] });
  const unitOperation = firstSaved.project.history.find(command => command.after.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.text === historicalBody));
  if (!unitOperation) throw new Error('通常保存から版1の単体履歴を取得できません');
  expect(record(unitOperation.before, scene.id, 'scene').data).toEqual(scene.data);
  expect(record(unitOperation.after, scene.id, 'scene').data).toEqual(historicalScene.data);
  await openEntity(page, 'scene', scene.name);
  await page.getByRole('tab', { name: '本文', exact: true }).click();
  await body.fill(currentBody); await saveEditor(page);
  const given = await backup(page);
  const currentScene = record(given.project, scene.id, 'scene');
  expect(currentScene.id).toBe(scene.id);
  expect(currentScene.data.body).toHaveLength(1);
  const currentBlockId = currentScene.data.body[0].id;
  expect(currentBlockId).toMatch(ID_PATTERN);
  expect(new Set([initialBlockId, historicalBlockId, currentBlockId]).size).toBe(3);
  expect(currentScene.data).toEqual({ ...scene.data, body: [{ ...scene.data.body[0], id: currentBlockId, text: currentBody }] });
  const currentOperation = given.project.history.find(command => command.after.entities.some(entity => entity.id === scene.id && entity.kind === 'scene' && entity.data.body[0]?.id === currentBlockId));
  if (!currentOperation) throw new Error('通常保存から最新版2の段落対応を取得できません');
  expect(record(currentOperation.before, scene.id, 'scene').data).toEqual(historicalScene.data);
  expect(record(currentOperation.after, scene.id, 'scene').data).toEqual(currentScene.data);
  expect(given.project.history.slice(0, firstSaved.project.history.length)).toEqual(firstSaved.project.history);
  await attachGiven(info, 'AT-F35', given.bytes, { projectId: p.projectId, unitOperationId: unitOperation.operationId, currentOperationId: currentOperation.operationId, sceneId: scene.id, initialBlockId, historicalBlockId, bodyBlockId: currentBlockId, hugeTick, condition: edge.data.condition, relation: p.relations[0], assetId: asset.id, assetHash: prepared.contentHash, assetBytes: assetBytes.length, givenConstructedBy: 'normal UI saves followed by actual full download' });
  expect(given.assets).toHaveLength(1);
  expect(given.assets[0].bytes).toEqual(assetBytes);

  // Full restore in an independent origin/context with no native project rows.
  const cleanContext = await browser.newContext({ baseURL });
  try {
    const restoredPage = await cleanContext.newPage();
    await restoredPage.goto('./');
    await expect(restoredPage.locator('.library-projects')).toContainText('はじめての作品');
    await seed(restoredPage, given.bytes);
    await restoredPage.reload();
    const restored = await backup(restoredPage);
    expect(restored.project).toEqual(given.project);
    expect(portableMeaning(restored.project)).toEqual(portableMeaning(given.project));
    expect(restored.assets[0].contentHash).toBe(prepared.contentHash);
    expect(restored.assets[0].bytes).toEqual(assetBytes);
    await openEntity(restoredPage, 'event', event.name);
    await expect(restoredPage.getByLabel('世界内tick', { exact: true })).toHaveValue(hugeTick);
    await restoredPage.getByRole('button', { name: '詳細を閉じる', exact: true }).click();

    // Selecting replacement shows its real pending-operation constraint. It
    // cannot silently destroy pending author work merely to make this test pass.
    await selectRestoreFile(restoredPage, given.bytes, 'replace', p.projectId);
    const beforeReplace = await authorFingerprint(restoredPage);
    await expect(restoredPage.locator('.import-preview').getByRole('alert')).toContainText('未送信の変更');
    await expect(restoredPage.getByLabel('復元方法と対象への影響を確認しました')).toBeDisabled();
    expect(await authorFingerprint(restoredPage)).toBe(beforeReplace);
    await restoredPage.locator('.import-preview').getByRole('button', { name: '中止', exact: true }).click();

    // Addition applies a new ID map to every reference and paragraph, while
    // asset identity remains the SHA-256 of the real unchanged bytes.
    await selectRestoreFile(restoredPage, given.bytes, 'clone');
    await restoredPage.getByLabel('復元方法と対象への影響を確認しました').check();
    await restoredPage.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
    await expect(restoredPage.getByText('検査した作品を端末内に復元しました。保存した版を確認しました。')).toBeVisible();
    await restoredPage.reload();
    const clone = await backup(restoredPage);
    const cloneCommand = [...clone.project.history].reverse().find(command => command.reason === '専用ファイルをcloneで復元');
    if (!cloneCommand?.idMap) throw new Error('複製時の全ID対応がありません');
    const idMap = cloneCommand.idMap;
    expect(clone.project.projectId).toBe(idMap[p.projectId]);
    expect(clone.project.projectId).not.toBe(p.projectId);
    for (const original of given.project.entities) expect(idMap[original.id]).not.toBe(original.id);
    const clonedScene = record(clone.project, idMap[scene.id], 'scene');
    for (const blockId of [initialBlockId, historicalBlockId, currentBlockId]) {
      expect(idMap[blockId]).toMatch(ID_PATTERN);
      expect(idMap[blockId]).not.toBe(blockId);
    }
    expect(new Set([initialBlockId, historicalBlockId, currentBlockId].map(id => idMap[id])).size).toBe(3);
    expect(clonedScene.data.body).toEqual([{ ...currentScene.data.body[0], id: idMap[currentBlockId] }]);
    const clonedUnitOperation = clone.project.history.find(command => command.operationId === idMap[unitOperation.operationId]);
    const clonedCurrentOperation = clone.project.history.find(command => command.operationId === idMap[currentOperation.operationId]);
    if (!clonedUnitOperation || !clonedCurrentOperation) throw new Error('複製後の初期・単体履歴・最新版の対応がありません');
    expect(record(clonedUnitOperation.before, clonedScene.id, 'scene').data.body).toEqual([{ ...scene.data.body[0], id: idMap[initialBlockId] }]);
    expect(record(clonedUnitOperation.after, clonedScene.id, 'scene').data.body).toEqual([{ ...historicalScene.data.body[0], id: idMap[historicalBlockId] }]);
    expect(record(clonedCurrentOperation.before, clonedScene.id, 'scene').data.body).toEqual([{ ...historicalScene.data.body[0], id: idMap[historicalBlockId] }]);
    expect(record(clonedCurrentOperation.after, clonedScene.id, 'scene').data.body).toEqual(clonedScene.data.body);
    expect(clonedScene.data.chapterId).toBe(idMap[chapter.id]);
    expect(clonedScene.data.eventIds).toEqual([idMap[event.id]]);
    expect(record(clone.project, idMap[chapter.id], 'chapter').data.sceneIds).toEqual([clonedScene.id]);
    expect(record(clone.project, idMap[event.id], 'event').data.time).toEqual(event.data.time);
    expect(record(clone.project, idMap[event.id], 'event').data.participants).toEqual([{ characterId: idMap[a.id], role: 'witness' }, { characterId: idMap[b.id], role: 'actor' }]);
    expect(record(clone.project, idMap[edge.id], 'flow_edge').data).toMatchObject({ fromId: idMap[entry.id], toId: idMap[end.id], condition: { ...edge.data.condition, variableId: idMap[variable.id] } });
    expect(clone.project.relations[0]).toMatchObject({ id: idMap[p.relations[0].id], fromId: idMap[a.id], toId: idMap[b.id], direction: 'forward', evidenceIds: [idMap[event.id]] });
    expect(clone.project.history.some(command => command.operationId === idMap[unitOperation.operationId])).toBe(true);
    expect(clone.assets[0].contentHash).toBe(prepared.contentHash);
    expect(clone.assets[0].bytes).toEqual(assetBytes);
    await attachObservation(info, 'AT-F35-new-clone-observed', { sourceProjectId: p.projectId, restoredProjectId: restored.project.projectId, cloneProjectId: clone.project.projectId, idMap, hugeTick, assetHash: prepared.contentHash, successfulReplacement: 'not_run: pending operations require real synchronization first' });
  } finally { await cleanContext.close(); }

  // Unit restoration presents current referrers, then rolls back every author
  // store on a declared native quota failure while retaining the review input.
  await work(page, '変更履歴');
  const history = page.locator('.history-page');
  await history.getByLabel('履歴を検索', { exact: true }).fill(unitOperation.operationId);
  await history.locator('.history-list').getByRole('button', { name: new RegExp(unitOperation.operationId) }).click();
  await history.getByLabel('単体復元する対象', { exact: true }).selectOption(scene.id);
  await history.getByRole('button', { name: 'この情報だけの復元を確認', exact: true }).click();
  const unitPreview = history.getByRole('region', { name: '確認した復元差分', exact: true });
  await expect(unitPreview).toContainText('件の参照があります');
  await expect(unitPreview).toContainText(historicalBody);
  const beforeUnit = await durableRecoveryImage(page);
  await injectOneAtomicQuotaFailure(page);
  await unitPreview.getByRole('button', { name: 'この内容へ復元する', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('容量');
  expect(await durableRecoveryImage(page)).toBe(beforeUnit);
  await expect(unitPreview).toContainText(historicalBody);
  await unitPreview.getByRole('button', { name: 'この内容へ復元する', exact: true }).click();
  await expect(history.getByRole('status').filter({ hasText: '保存した版を確認' })).toBeVisible();
  const unitSaved = await backup(page);
  expect(record(unitSaved.project, scene.id, 'scene').data).toEqual(historicalScene.data);
  for (const original of given.project.entities.filter(entity => entity.id !== scene.id)) expect(record(unitSaved.project, original.id, original.kind).data).toEqual(original.data);
  expect(unitSaved.project.relations).toEqual(given.project.relations);
  expect(unitSaved.assets[0].bytes).toEqual(assetBytes);
  expect(unitSaved.project.history.slice(0, given.project.history.length)).toEqual(given.project.history);

  // Same-project merge keeps IDs and requires the real differing scene choice.
  await selectRestoreFile(page, given.bytes, 'merge', p.projectId);
  const conflicts = page.locator('.import-preview details').filter({ has: page.getByLabel(`${scene.id}の統合方法`, { exact: true }) });
  await conflicts.locator('summary').click();
  await expect(conflicts).toContainText(historicalBody);
  await expect(conflicts).toContainText(currentBody);
  await conflicts.getByLabel(`${scene.id}の統合方法`, { exact: true }).selectOption('incoming');
  await page.getByRole('button', { name: '復元の影響を確認', exact: true }).click();
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  const beforeMerge = await durableRecoveryImage(page);
  await injectOneAtomicQuotaFailure(page);
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText('容量');
  expect(await durableRecoveryImage(page)).toBe(beforeMerge);
  await expect(page.getByLabel('復元方法', { exact: true })).toHaveValue('merge');
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeChecked();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.getByText('検査した作品を端末内に復元しました。保存した版を確認しました。')).toBeVisible();
  await page.reload();
  const merged = await backup(page);
  expect(merged.project.projectId).toBe(given.project.projectId);
  expect(portableMeaning(merged.project)).toEqual(portableMeaning(given.project));
  expect(merged.project.history.slice(0, unitSaved.project.history.length)).toEqual(unitSaved.project.history);
  expect([...merged.project.history].reverse().find(command => command.reason === '専用ファイルをmergeで復元')?.targetIds).toContain(scene.id);
  expect(merged.assets[0].contentHash).toBe(prepared.contentHash);
  expect(merged.assets[0].bytes).toEqual(assetBytes);
  await attachObservation(info, 'AT-F35-unit-merge-observed', { unitOperationId: unitOperation.operationId, retainedHistoryIds: unitSaved.project.history.map(command => command.operationId), mergedHistoryIds: merged.project.history.map(command => command.operationId), unitRollback: true, mergeRollback: true, hugeTick: record(merged.project, event.id, 'event').data.time, finalCondition: record(merged.project, edge.id, 'flow_edge').data.condition, finalRelationId: merged.project.relations[0].id, assetHash: merged.assets[0].contentHash, successfulReplacement: 'not_run: pending operations require real synchronization first' });
});

async function expectOriginalReviewQuote(page: Page, originalBody: string, quote: string) {
  await page.getByRole('region', { name: '指摘の修正と確認', exact: true })
    .getByRole('button', { name: '指摘した元の固定版を開く', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '固定版の参照先', exact: true });
  await expect(dialog).toContainText('固定版: 版1');
  await expect(dialog).toContainText(originalBody);
  await expect(dialog.locator('.referenced-quote mark')).toHaveText(quote);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('AT-F29 ローカル引用保護: reviewer UUID の版1指摘から改訂・段落削除・修正済み・確認済みを順に保存し旧引用を開く', async ({ page, browser, baseURL }, info) => {
  const f = await sharedReviewFixture();
  const reviewerId = 'a1000000-0000-4000-8000-000000000029';
  const review = await createSharedCommentReview(f.p, f.envelope, f.comment, 'https://dedicated.review.invalid');
  // A valid identity UUID accompanies the established shared-review fixture.
  // Local import does not prove that an authenticated reviewer wrote it, and
  // this test makes no request to the fictional external connection.
  review.data.assigneeId = reviewerId;
  review.status = 'confirmed';
  const task = createEntity(f.p.projectId, 'production_task', '版1の指摘に対応するタスク', { targetIds: [review.id, f.line.id], stage: 'review', progress: 'todo', assigneeId: reviewerId });
  f.p.entities.push(review, task);
  const originalTarget = structuredClone(review.data.target);
  const originalBody = f.line.data.text[0].text;
  const quotedText = review.data.quotedText!;
  const bytes = await exportScenario(f.p);
  await attachGiven(info, 'AT-F29', bytes, { reviewerUuid: reviewerId, reviewerUuidMeaning: 'fixture identity only; real comment author and reviewer Auth are not_run', reviewId: review.id, lineId: f.line.id, originalBlockId: f.line.data.text[0].id, targetVersionId: f.pin.id, fixedContentHash: f.pin.contentHash, target: originalTarget, quote: quotedText, source: review.data.sharedSource, executionScope: 'local immutable version/quote/anchor/lifecycle protection only' });
  await seed(page, bytes);

  await openEntity(page, 'review', review.name);
  const actions = page.getByRole('region', { name: '指摘の修正と確認', exact: true });
  await expect(actions).toContainText('現在稿の位置 確認できる');
  await expect(actions.locator('blockquote')).toHaveText(quotedText);
  await expectOriginalReviewQuote(page, originalBody, quotedText);

  // A whole-field replacement has a new paragraph identity. Preserve the
  // initial paragraph in the recorded before-image and the immutable source pin.
  const originalBlockId = f.line.data.text[0].id;
  const revisedBody = '😀改訂された台詞L。版1の指摘の引用は書き換えない。';
  expect(originalBlockId).toMatch(ID_PATTERN);
  await openEntity(page, 'dialogue_line', f.line.name);
  await page.locator('.detail-panel').getByRole('textbox', { name: '台詞', exact: true }).fill(revisedBody);
  await saveEditor(page);
  const revised = await backup(page);
  const revisedLine = record(revised.project, f.line.id, 'dialogue_line');
  expect(revisedLine.id).toBe(f.line.id);
  expect(revisedLine.data.text).toHaveLength(1);
  const revisedBlockId = revisedLine.data.text[0].id;
  expect(revisedBlockId).toMatch(ID_PATTERN);
  expect(revisedBlockId).not.toBe(originalBlockId);
  expect(revisedLine.data).toEqual({ ...f.line.data, text: [{ ...f.line.data.text[0], id: revisedBlockId, text: revisedBody }] });
  const revisionOperation = revised.project.history.find(command => command.after.entities.some(entity => entity.id === f.line.id && entity.kind === 'dialogue_line' && entity.data.text[0]?.id === revisedBlockId));
  if (!revisionOperation) throw new Error('本文改訂の旧段落と保存済み新段落の履歴対応がありません');
  expect(record(revisionOperation.before, f.line.id, 'dialogue_line').data).toEqual(f.line.data);
  expect(record(revisionOperation.after, f.line.id, 'dialogue_line').data).toEqual(revisedLine.data);
  for (const image of [revisionOperation.before, revisionOperation.after]) {
    expect(record(image, review.id, 'review').data).toEqual(review.data);
    expect(image.snapshots).toEqual(f.p.snapshots);
  }
  expect(record(revised.project, review.id, 'review').data).toEqual(review.data);
  expect(revised.project.snapshots).toEqual(f.p.snapshots);
  await openEntity(page, 'review', review.name);
  await expect(actions).toContainText('現在稿の位置 不明');
  await expect(actions.locator('blockquote')).toHaveText(quotedText);
  await expectOriginalReviewQuote(page, originalBody, quotedText);

  // Delete the paragraph itself through the ordinary advanced editor. An
  // empty textarea would keep an empty paragraph and is not this boundary.
  await openEntity(page, 'dialogue_line', f.line.name);
  await editData(page, { ...record(revised.project, f.line.id, 'dialogue_line').data, text: [] });
  const deleted = await backup(page);
  const deletedLine = record(deleted.project, f.line.id, 'dialogue_line');
  expect(deletedLine.id).toBe(f.line.id);
  expect(deletedLine.data).toEqual({ ...revisedLine.data, text: [] });
  const deletionOperation = [...deleted.project.history].reverse().find(command => command.targetIds.includes(f.line.id) && command.after.entities.some(entity => entity.id === f.line.id && entity.kind === 'dialogue_line' && entity.data.text.length === 0));
  if (!deletionOperation) throw new Error('対象段落削除の保存履歴がありません');
  expect(record(deletionOperation.before, f.line.id, 'dialogue_line').data).toEqual(revisedLine.data);
  expect(record(deletionOperation.after, f.line.id, 'dialogue_line').data).toEqual(deletedLine.data);
  expect(deleted.project.history.slice(0, revised.project.history.length)).toEqual(revised.project.history);
  expect(record(deleted.project, review.id, 'review').data.target).toEqual(originalTarget);
  expect(record(deleted.project, review.id, 'review').data.quotedText).toBe(quotedText);
  expect(deleted.project.snapshots).toEqual(f.p.snapshots);
  await openEntity(page, 'review', review.name);
  await expect(actions).toContainText('現在稿の位置 不明');
  await expect(actions.locator('blockquote')).toHaveText(quotedText);

  await actions.getByRole('button', { name: '修正済みとして保存', exact: true }).click();
  await expect(actions.getByRole('status').filter({ hasText: '端末の指摘を修正済みにしました' })).toContainText('端末の指摘を修正済みにしました');
  await actions.getByRole('button', { name: '確認済みとして保存', exact: true }).click();
  await expect(actions.getByRole('status').filter({ hasText: '端末の指摘を確認済みにしました' })).toContainText('端末の指摘を確認済みにしました');
  await expectOriginalReviewQuote(page, originalBody, quotedText);
  const beforeCold = await backup(page);
  const verified = record(beforeCold.project, review.id, 'review');
  expect(verified.data).toEqual({ ...review.data, stage: 'verified' });
  expect(verified.data.target).toEqual(originalTarget);
  expect(beforeCold.project.snapshots).toEqual(f.p.snapshots);
  expect(record(beforeCold.project, task.id, 'production_task').data).toEqual(task.data);
  await page.reload();
  await openEntity(page, 'review', review.name);
  await expect(actions).toContainText('確認済み');
  await expect(actions).toContainText('現在稿の位置 不明');
  await expectOriginalReviewQuote(page, originalBody, quotedText);
  const cold = await backup(page);
  expect(cold.project).toEqual(beforeCold.project);

  // Use the downloaded full file in truly independent native contexts. New
  // keeps private IDs; clone remaps private IDs but retains public provenance.
  for (const mode of ['new', 'clone'] as const) {
    const context = await browser.newContext({ baseURL });
    try {
      const restoredPage = await context.newPage();
      await restoredPage.goto('./');
      await restoredPage.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
      await restoredPage.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'AT-F29-actual-full.scenario', mimeType: 'application/zip', buffer: Buffer.from(cold.bytes) });
      await restoredPage.getByLabel('復元方法', { exact: true }).selectOption(mode);
      await restoredPage.getByLabel('復元方法と対象への影響を確認しました').check();
      await restoredPage.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
      await expect(restoredPage.locator('.app-shell')).toBeVisible();
      await restoredPage.reload();
      const restored = await backup(restoredPage);
      const restoredReview = restored.project.entities.find((entity): entity is Entity<'review'> => entity.kind === 'review' && entity.name === review.name)!;
      expect(restoredReview.data.sharedSource).toEqual(review.data.sharedSource);
      expect(restoredReview.data).toMatchObject({ stage: 'verified', quotedText, assigneeId: reviewerId });
      if (mode === 'new') {
        expect(restored.project).toEqual(cold.project);
        expect(restoredReview.data.target).toEqual(originalTarget);
      } else {
        const command = [...restored.project.history].reverse().find(item => item.reason === '専用ファイルをcloneで復元');
        if (!command?.idMap) throw new Error('原指摘の clone ID 対応がありません');
        expect(restoredReview.id).toBe(command.idMap[review.id]);
        expect(restoredReview.data.targetVersionId).toBe(command.idMap[f.pin.id]);
        expect(restoredReview.data.target).toEqual({ ...(typeof originalTarget === 'string' ? {} : originalTarget), entityId: command.idMap[f.line.id], blockId: command.idMap[f.line.data.text[0].id], sourceVersionId: command.idMap[f.pin.id] });
        expect(record(restored.project, command.idMap[task.id], 'production_task').data.targetIds).toEqual([restoredReview.id, command.idMap[f.line.id]]);
        for (const blockId of [originalBlockId, revisedBlockId]) {
          expect(command.idMap[blockId]).toMatch(ID_PATTERN);
          expect(command.idMap[blockId]).not.toBe(blockId);
        }
        expect(command.idMap[originalBlockId]).not.toBe(command.idMap[revisedBlockId]);
        const clonedRevision = restored.project.history.find(item => item.operationId === command.idMap![revisionOperation.operationId]);
        const clonedDeletion = restored.project.history.find(item => item.operationId === command.idMap![deletionOperation.operationId]);
        if (!clonedRevision || !clonedDeletion) throw new Error('複製後の原段落・改訂段落・削除の履歴対応がありません');
        const clonedLineId = command.idMap[f.line.id];
        expect(record(clonedRevision.before, clonedLineId, 'dialogue_line').data.text).toEqual([{ ...f.line.data.text[0], id: command.idMap[originalBlockId] }]);
        expect(record(clonedRevision.after, clonedLineId, 'dialogue_line').data.text).toEqual([{ ...revisedLine.data.text[0], id: command.idMap[revisedBlockId] }]);
        expect(record(clonedDeletion.before, clonedLineId, 'dialogue_line').data.text).toEqual([{ ...revisedLine.data.text[0], id: command.idMap[revisedBlockId] }]);
        expect(record(clonedDeletion.after, clonedLineId, 'dialogue_line').data.text).toEqual([]);
      }
      await openEntity(restoredPage, 'review', review.name);
      await expect(restoredPage.getByRole('region', { name: '指摘の修正と確認', exact: true })).toContainText('現在稿の位置 不明');
      await expectOriginalReviewQuote(restoredPage, originalBody, quotedText);
      await attachObservation(info, `AT-F29-${mode}-observed`, { reviewId: restoredReview.id, target: restoredReview.data.target, targetVersionId: restoredReview.data.targetVersionId, quote: restoredReview.data.quotedText, stage: restoredReview.data.stage, retainedPublicProvenance: restoredReview.data.sharedSource, realReviewerAuthentication: 'not_run', realRolePermissions: 'not_run' });
    } finally { await context.close(); }
  }
});
