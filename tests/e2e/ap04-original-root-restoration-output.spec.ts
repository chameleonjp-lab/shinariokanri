import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createEntity, createProject, KIND_LABELS, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { forkAuthorAlternative } from '../../src/domain/writingWorkspace';
import { sealAuthorAlternative } from '../../src/domain/authorAlternativeIntegrity';
import { inspectScenario, exportScenario } from '../../src/storage/archive';
import { ARCHIVE_LIMITS, canonicalJson } from '../../src/storage/json';
import { attachGiven, attachObservation, backup, editData, navigate, openEntity, retainGeneratedOutput, seed } from './ap04-original-helpers';

// Authored procedures have no acceptance credit. Physical Files and other
// engines remain separate; the ten other safety bounds have companion entries.
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fixtureRoot = 'tests/fixtures/rb10-import-errors/';

async function output(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
}

async function outputFile(page: Page, filename: string) {
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  const artifact = page.locator('.export-artifact').filter({ has: page.getByRole('heading', { name: filename, exact: true }) });
  await expect(artifact).toBeVisible();
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', { name: 'この内容を保存', exact: true }).click();
  const file = await pending, bytes = await readFile((await file.path())!);
  await retainGeneratedOutput(bytes, file.suggestedFilename());
  return { bytes, content: bytes.toString('utf8'), sha256: hash(bytes) };
}

async function durable(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const normalize = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer) return [...new Uint8Array(value)];
      if (ArrayBuffer.isView(value)) return [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
      return value;
    };
    try {
      const inputAndNavigation = new Set(['viewStates', 'importDrafts', 'authorToolDrafts', 'workspaceInputs']);
      const tables = [...db.objectStoreNames].filter(name => !inputAndNavigation.has(name)).sort();
      const tx = db.transaction(tables, 'readonly');
      return JSON.stringify(await Promise.all(tables.map(name => new Promise<unknown>((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve([name, normalize(request.result)]); request.onerror = () => reject(request.error);
      }))));
    } finally { db.close(); }
  });
}

function withFieldBytes(bytes: Uint8Array, length: number) {
  // Only this derived boundary fixture changes. The original seven bytes stay
  // unchanged; matching SHA/size declarations avoid testing a hash error instead.
  const files = unzipSync(bytes), project = JSON.parse(strFromU8(files['data/project.json']));
  const note = project.entities.find((entity: { kind: string }) => entity.kind === 'note');
  if (!note) throw Error('全情報 fixture に note がありません');
  note.data.body = [{ ...(note.data.body[0] ?? textToRichText('a')[0]), text: 'a'.repeat(length) }];
  files['data/project.json'] = strToU8(JSON.stringify(project));
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  const row = manifest.files.find((file: { path: string }) => file.path === 'data/project.json');
  row.byteSize = files['data/project.json'].length; row.sha256 = hash(files['data/project.json']);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files);
}

test('AT-E07 全entity・未知日時・巨大tick・実素材を完全保存で空環境へ往復し、不正原本と1MiB境界を拒否する', async ({ page, browser, baseURL }, info) => {
  test.setTimeout(180_000);
  const manifest = JSON.parse(await readFile(fixtureRoot + 'MANIFEST.json', 'utf8'));
  const bytes = new Uint8Array(await readFile(fixtureRoot + manifest.complete.path));
  expect(hash(bytes)).toBe(manifest.complete.sha256);
  const original = await inspectScenario(bytes, { worker: false });
  await test.step('given: 全entity種・未知日時・巨大tick・素材を含む同じ原作品', async () => {
    expect(new Set(original.project.entities.map(entity => entity.kind))).toEqual(new Set(Object.keys(KIND_LABELS)));
    expect(original.project.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'event', data: expect.objectContaining({ time: expect.objectContaining({ mode: 'unknown' }) }) }),
      expect.objectContaining({ kind: 'event', data: expect.objectContaining({ time: expect.objectContaining({ at: '900719925474099312345' }) }) }),
    ]));
    expect(original.assets.length).toBeGreaterThan(0);
    await attachGiven(info, 'AT-E07', bytes, { entityKinds: Object.keys(KIND_LABELS), assetHashes: original.assets.map(asset => asset.contentHash), worldIds: Object.keys(original.worlds) });
    await seed(page, bytes);
  });
  const exported = await backup(page);
  expect(canonicalJson(exported.project)).toBe(canonicalJson(original.project));
  expect(exported.worlds).toEqual(original.worlds); expect(exported.assets).toEqual(original.assets);
  await test.step('when/then: 実downloadだけを空contextへ持ち込み正規化情報と全素材を一致させる', async () => {
    const context = await browser.newContext({ baseURL });
    try {
      const empty = await context.newPage();
      await seed(empty, exported.bytes);
      const restored = await backup(empty);
      expect(canonicalJson(restored.project)).toBe(canonicalJson(exported.project));
      expect(restored.worlds).toEqual(exported.worlds); expect(restored.assets).toEqual(exported.assets);
      await empty.reload();
      const cold = await backup(empty);
      expect(canonicalJson(cold.project)).toBe(canonicalJson(exported.project));
      expect(cold.worlds).toEqual(exported.worlds); expect(cold.assets).toEqual(exported.assets);
    } finally { await context.close(); }
  });
  await test.step('negative_or_edge: hash・参照・危険path・未対応版・添付重複・ID衝突でも既存正本と素材bytesは不変', async () => {
    for (const row of manifest.negative) {
      const bad = await readFile(fixtureRoot + row.path); expect(hash(bad)).toBe(row.sha256);
      const before = await durable(page);
      await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: row.path, mimeType: 'application/zip', buffer: bad });
      await expect(page.locator('.backup-page').getByRole('alert')).toContainText(new RegExp(row.expected_reason));
      await expect(page.locator('.backup-page').getByRole('alert')).toContainText(row.expected_path);
      expect(await durable(page)).toBe(before);
    }
    const below = withFieldBytes(bytes, ARCHIVE_LIMITS.fieldBytes - 1);
    await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: 'field-limit-minus-one.scenario', mimeType: 'application/zip', buffer: Buffer.from(below) });
    await expect(page.getByRole('heading', { name: `検査済みの作品 · ${original.project.name}`, exact: true })).toBeVisible();
    const lowerExpected = await inspectScenario(below, { worker: false });
    const lowerContext = await browser.newContext({ baseURL });
    try {
      const lowerPage = await lowerContext.newPage();
      await seed(lowerPage, below);
      const committed = await backup(lowerPage);
      expect(canonicalJson(committed.project)).toBe(canonicalJson(lowerExpected.project));
      expect(committed.worlds).toEqual(lowerExpected.worlds); expect(committed.assets).toEqual(lowerExpected.assets);
      await lowerPage.reload();
      const cold = await backup(lowerPage);
      expect(canonicalJson(cold.project)).toBe(canonicalJson(lowerExpected.project));
      expect(cold.worlds).toEqual(lowerExpected.worlds); expect(cold.assets).toEqual(lowerExpected.assets);
      await attachObservation(info, 'AT-E07-field-below-committed-cold', { originalInputSha256: hash(bytes), belowSha256: hash(below), committedSha256: hash(committed.bytes), coldSha256: hash(cold.bytes), fullNormalizedProjectMatches: true, allWorldsAndAssetsMatch: true });
    } finally { await lowerContext.close(); }
    const before = await durable(page), above = withFieldBytes(bytes, ARCHIVE_LIMITS.fieldBytes + 1);
    await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: 'field-limit-plus-one.scenario', mimeType: 'application/zip', buffer: Buffer.from(above) });
    await expect(page.locator('.backup-page').getByRole('alert')).toContainText(/1 MiB|上限/);
    expect(await durable(page)).toBe(before);
    await attachObservation(info, 'AT-E07-boundaries', { testedOriginalNegativeFiles: manifest.negative, fieldLimitBytes: ARCHIVE_LIMITS.fieldBytes, below: { bytes: below.length, sha256: hash(below) }, above: { bytes: above.length, sha256: hash(above) }, requiredCompanion: 'ap04-original-e07-safety-bounds.spec.ts: original ten remaining L±1 safety bounds', remaining: ['actual OS Files/device handoff', 'companion bounds require their own execution on this fixed candidate'] });
  });
});

test('AT-N19 公開版と作者別案を保って正本を改訂し、明示選択した版だけ制作出力する', async ({ page }, info) => {
  let project = createProject('AT-N19 公開済み作品と別案');
  const scene = createEntity(project.projectId, 'scene', '公開する場面', { body: textToRichText('公開済みの本文😀') }); scene.status = 'confirmed';
  const profile = createEntity(project.projectId, 'projection_profile', '制作する正本の範囲', { audience: 'reader', publicTitle: '版を選ぶ制作出力', publicVersionLabel: '公開一版', includedIds: [scene.id], allowedKinds: ['scene'], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開場面' } }, publicTexts: { [scene.id]: { body: textToRichText('公開済みの本文😀') } } }); profile.status = 'confirmed';
  project.entities.push(scene, profile); project = await createWorldSnapshot(project, '公開済み版1');
  const published = project.snapshots.at(-1)!;
  const alternative = await sealAuthorAlternative(forkAuthorAlternative(project, '公開版から分岐した別案', { snapshotId: published.id }));
  project.authorAlternatives = [alternative];
  const bytes = await exportScenario(project);
  await attachGiven(info, 'AT-N19', bytes, { sceneId: scene.id, publishedId: published.id, publishedHash: published.contentHash, alternativeId: alternative.id });
  await seed(page, bytes);
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '作者別案', exact: true }).click();
  await page.getByLabel('別案内の編集対象', { exact: true }).selectOption(scene.id);
  await page.getByLabel('別案内の場面本文', { exact: true }).fill('採用しない別案の本文');
  await page.getByRole('button', { name: '別案を新しい版として保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '別案を新しい版として保存', exact: true })).toBeEnabled();
  await expect(page.getByLabel('別案内の場面本文', { exact: true })).toHaveValue('採用しない別案の本文');
  const afterAlternative = await backup(page);
  expect(afterAlternative.project.entities).toEqual(project.entities);
  expect(afterAlternative.project.snapshots).toEqual(project.snapshots);
  await openEntity(page, 'scene', scene.name);
  const editor = page.locator('.detail-panel');
  await editor.getByRole('tab', { name: '本文', exact: true }).click();
  await editor.getByRole('textbox', { name: '本文', exact: true }).fill('改訂した正本の本文😀');
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor).toContainText('端末内保存済み');
  await openEntity(page, 'projection_profile', profile.name);
  await editData(page, { ...profile.data, publicVersionLabel: '改訂二版', publicTexts: { [scene.id]: { body: textToRichText('改訂した正本の本文😀') } } });
  await output(page); await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('production');
  await page.getByLabel('出力する作品版', { exact: true }).selectOption('');
  const current = await outputFile(page, 'production.json');
  expect(current.content).toContain('改訂した正本の本文😀'); expect(current.content).not.toContain('採用しない別案の本文');
  await page.getByLabel('出力する作品版', { exact: true }).selectOption(published.id);
  const old = await outputFile(page, 'production.json');
  expect(old.content).toContain('公開済みの本文😀'); expect(old.content).not.toContain('改訂した正本の本文😀'); expect(old.content).not.toContain('採用しない別案の本文');
  await page.reload(); const saved = await backup(page);
  expect(saved.project.snapshots.find(pin => pin.id === published.id)).toEqual(published);
  expect(saved.project.entities.find(entity => entity.id === scene.id)).toMatchObject({ data: { body: [{ text: '改訂した正本の本文😀' }] } });
  expect(saved.project.authorAlternatives?.[0].applyReceipts).toEqual([]);
  const head = saved.project.authorAlternatives?.[0].versions.at(-1);
  expect(head?.content.entities.find(entity => entity.id === scene.id)).toMatchObject({ data: { body: [{ text: '採用しない別案の本文' }] } });
  await attachObservation(info, 'AT-N19-outputs', { current: { sha256: current.sha256, bytes: current.bytes.length }, published: { sha256: old.sha256, bytes: old.bytes.length }, preservedSnapshot: published.id, savedRevision: saved.project.revision });
});

test('AT-N20 未対応外部契約を汎用実行出力で指摘し、実行しない本文出力だけを保存する', async ({ page }, info) => {
  const project = createProject('AT-N20 未対応外部コマンド契約');
  const scene = createEntity(project.projectId, 'scene', '安全に読む本文', { body: textToRichText('この本文を読むだけでは外部コマンドを呼びません。') });
  const contract = createEntity(project.projectId, 'external_contract', '未対応ゲームコマンド', { key: 'unimplemented-command', owner: 'game', inputType: 'unimplemented-command-v99', outputType: 'boolean', missingPolicy: 'block' });
  const entry = createEntity(project.projectId, 'flow_node', '外部確認する入口', { nodeType: 'entry', sceneId: scene.id, gate: { op: 'external', contractId: contract.id } });
  const end = createEntity(project.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '外部確認後の終端' });
  const edge = createEntity(project.projectId, 'flow_edge', '外部確認後の線', { fromId: entry.id, toId: end.id, edgeType: 'automatic' });
  const graph = createEntity(project.projectId, 'flow_graph', '外部確認する経路', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  const records = [scene, contract, entry, end, edge, graph]; records.forEach(entity => { entity.status = 'confirmed'; });
  const profile = createEntity(project.projectId, 'projection_profile', '未対応を隠さない公開範囲', { audience: 'reader', publicTitle: '安全な本文', includedIds: records.map(entity => entity.id), allowedKinds: [...new Set(records.map(entity => entity.kind))], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' } }, publicTexts: { [scene.id]: { body: textToRichText('この本文を読むだけでは外部コマンドを呼びません。') }, [contract.id]: { key: 'unimplemented-command' }, [end.id]: { terminalReason: '終端' } } }); profile.status = 'confirmed';
  const safeProfile = createEntity(project.projectId, 'projection_profile', '本文だけの明示安全範囲', { audience: 'reader', publicTitle: '実行しない本文', includedIds: [scene.id], allowedKinds: ['scene'], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開本文' } }, publicTexts: { [scene.id]: { body: textToRichText('この本文を読むだけでは外部コマンドを呼びません。') } } }); safeProfile.status = 'confirmed';
  project.entities.push(...records, profile, safeProfile); const bytes = await exportScenario(project);
  await attachGiven(info, 'AT-N20', bytes, { contractId: contract.id, unsupportedInputType: contract.data.inputType, declaredImplementedRuntime: 'scenario-runtime 1.1.0', otherGameEngines: 'not implemented/claimed' });
  await seed(page, bytes); await output(page);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('runtime_json');
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-result').getByRole('alert')).toContainText('この項目は対応先で安全に表せません');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  await page.locator('.export-result').getByRole('button', { name: '対象を開く', exact: true }).last().click();
  await expect(page.locator('.detail-panel').getByLabel('名前', { exact: true })).toHaveValue(contract.name);
  await output(page); await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(safeProfile.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('reader');
  await page.getByLabel('本文の出力形式', { exact: true }).selectOption('markdown');
  const safe = await outputFile(page, 'reader.md'); expect(safe.content).toContain('この本文を読むだけでは外部コマンドを呼びません');
  await page.reload(); const saved = await backup(page);
  expect(saved.project.entities).toEqual(project.entities);
  await attachObservation(info, 'AT-N20-output', { sha256: safe.sha256, bytes: safe.bytes.length, scope: 'unsupported external-contract rejected during public projection; explicitly selected separate text-only safe scope', requiredCompanion: 'ap04-original-n20-targets.spec.ts: explicit per-target selection and refusal on the same original given', remaining: ['this partial procedure does not operate the implemented target selector; its companion requires separate execution', 'arbitrary external command semantics beyond the current external_contract model'] });
});
