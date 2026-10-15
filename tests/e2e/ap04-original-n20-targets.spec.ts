import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import {readFile} from './downloadEvidence';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { canonicalJson } from '../../src/storage/json';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, seed } from './ap04-original-helpers';

// All original clauses are not_run until actual browser execution. This given
// represents an authored unsupported external-contract type, not an arbitrary
// external command implementation or real game-engine adapter.
const engineTargets = ['unity', 'unreal', 'ink', 'yarn'] as const;
const publicBody = '確認した本文だけを読む。外部コマンドを呼び出さない。';
function fixture(inputType = 'unimplemented-command-v99') {
  const project = createProject('AT-N20 対応先と未対応外部契約');
  const scene = createEntity(project.projectId, 'scene', '作者の本文', { body: textToRichText('AP04_N20_PRIVATE_MANUSCRIPT') });
  const contract = createEntity(project.projectId, 'external_contract', '未対応の外部コマンド契約', { key: 'AP04_N20_PRIVATE_COMMAND', owner: 'game', inputType, outputType: 'boolean', missingPolicy: 'block' });
  const entry = createEntity(project.projectId, 'flow_node', '外部結果を確認する入口', { nodeType: 'entry', sceneId: scene.id, gate: { op: 'external', contractId: contract.id } });
  const end = createEntity(project.projectId, 'flow_node', '確認後の終端', { nodeType: 'terminal', terminalReason: 'AP04_N20_PRIVATE_END_REASON' });
  const edge = createEntity(project.projectId, 'flow_edge', '確認して終える', { fromId: entry.id, toId: end.id, edgeType: 'automatic' });
  const graph = createEntity(project.projectId, 'flow_graph', '外部結果を使う経路', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
  const included = [scene, contract, entry, end, edge, graph];
  included.forEach(entity => { entity.status = 'confirmed'; });
  const profile = createEntity(project.projectId, 'projection_profile', '外部契約を含む制作範囲', { audience: 'reader', publicTitle: '公開する経路', publicVersionLabel: '対応先を検査する公開版', includedIds: included.map(entity => entity.id), allowedKinds: [...new Set(included.map(entity => entity.kind))], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' } }, publicTexts: { [scene.id]: { body: textToRichText(publicBody) }, [contract.id]: { key: 'public-contract' }, [end.id]: { terminalReason: '意図した終端' } } });
  const safe = createEntity(project.projectId, 'projection_profile', '本文だけの明示安全範囲', { audience: 'reader', publicTitle: '実行しない公開本文', publicVersionLabel: '本文だけの公開版', includedIds: [scene.id], allowedKinds: ['scene'], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開本文' } }, publicTexts: { [scene.id]: { body: textToRichText(publicBody) } } });
  profile.status = safe.status = 'confirmed';
  project.entities.push(...included, profile, safe);
  return { project, profile, safe, contract };
}
async function output(page: Page) {
  await navigate(page, /^作品・保存/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
}
async function preview(page: Page) {
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-result')).toBeVisible();
}
async function download(page: Page, filename: string) {
  const artifact = page.locator('.export-artifact').filter({ has: page.getByRole('heading', { name: filename, exact: true }) });
  await expect(artifact).toBeVisible();
  const pending = page.waitForEvent('download');
  await artifact.getByRole('button', { name: 'この内容を保存', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  return { content: bytes.toString('utf8'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

test('AT-N20 未対応外部契約がある同じ作品で対応先を選び、実ID・項目の不一致と未実装先を示し、明示した本文だけを保存する', async ({ page }, info) => {
  const { project, profile, safe, contract } = fixture();
  const bytes = await exportScenario(project);
  await attachGiven(info, 'AT-N20-targets', bytes, { projectId: project.projectId, contractId: contract.id, inputType: contract.data.inputType, outputType: contract.data.outputType, implementedTarget: 'scenario-runtime 1.1.0', unimplementedTargets: engineTargets, limit: 'unsupported declared contract type; arbitrary external command semantics and real engine execution are not observed' });
  await seed(page, bytes);
  const before = await authorFingerprint(page);
  const downloads: string[] = [];
  page.on('download', item => downloads.push(item.suggestedFilename()));
  await output(page);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('runtime_json');
  const target = page.getByLabel('制作の対応先', { exact: true });
  await target.selectOption('scenario-runtime');
  await expect(target.locator('option:checked')).toContainText('実装済み');
  const declaration = page.locator('.runtime-target-compatibility');
  await expect(declaration.getByRole('row', { name: /scenario-runtime 1.1.0/ })).toContainText('実装済み');
  for (const name of ['Unity', 'Unreal', 'ink', 'Yarn']) {
    const row = declaration.getByRole('row', { name: new RegExp(`^${name}`) });
    await expect(row).toContainText('未対応');
    await expect(row).toContainText('変換器は未実装');
    await expect(row).not.toContainText('実装済み');
  }
  await preview(page);
  const mismatch = page.locator('.export-issue').filter({ hasText: 'この外部値の型を対応先で表せません' });
  await expect(mismatch).toHaveCount(1);
  await expect(mismatch.locator('.export-issue-code')).toHaveText('EXPORT_UNSUPPORTED');
  await expect(mismatch.locator('.export-issue-entity')).toHaveText(contract.id);
  await expect(mismatch.locator('.export-issue-field')).toHaveText('inputType');
  await expect(page.locator('.export-result').getByRole('alert')).toContainText('この項目は対応先で安全に表せません');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  expect(downloads).toEqual([]);
  await mismatch.getByRole('button', { name: '対象を開く', exact: true }).click();
  await expect(page.locator('#entity-name')).toHaveValue(contract.name);
  await output(page);
  await expect(target).toHaveValue('scenario-runtime');

  const results: { purpose: string; target: string; unsupported: true }[] = [];
  for (const purpose of ['runtime_json', 'playable_preview'] as const) {
    await page.getByLabel('出力目的', { exact: true }).selectOption(purpose);
    for (const destination of engineTargets) {
      await target.selectOption(destination);
      await expect(page.locator('.export-result')).toHaveCount(0);
      await expect(target.locator('option:checked')).toContainText('未対応：互換検査のみ');
      await preview(page);
      const targetIssue = page.locator('.export-issue').filter({ has: page.locator('.export-issue-field').filter({ hasText: /^runtimeProfile\.profileId$/ }) });
      await expect(targetIssue.locator('.export-issue-code')).toHaveText('EXPORT_UNSUPPORTED');
      await expect(targetIssue).toContainText('未実装のゲームエンジンへ直接変換できません');
      await expect(page.locator('.runtime-target-result')).toContainText(destination);
      await expect(page.locator('.runtime-target-result')).toContainText('変換未対応');
      await expect(page.locator('.export-artifact')).toHaveCount(0);
      expect(downloads).toEqual([]);
      expect(await authorFingerprint(page)).toBe(before);
      results.push({ purpose, target: destination, unsupported: true });
    }
  }
  await page.reload();
  await output(page);
  await expect(page.getByLabel('出力目的', { exact: true })).toHaveValue('playable_preview');
  await expect(target).toHaveValue('yarn');
  await expect(page.locator('.export-artifact')).toHaveCount(0);

  // A separate explicit publication scope and purpose are the only safe output.
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(safe.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('reader');
  await page.getByLabel('本文の出力形式', { exact: true }).selectOption('markdown');
  await preview(page);
  await expect(page.getByLabel('制作の対応先', { exact: true })).toHaveCount(0);
  await expect(page.locator('.export-result').getByRole('alert')).toHaveCount(0);
  const safeOutput = await download(page, 'reader.md');
  expect(safeOutput.content).toContain(publicBody);
  expect(safeOutput.content).toContain('対象版: 本文だけの公開版');
  expect(safeOutput.content).not.toContain(contract.id);
  expect(safeOutput.content).not.toContain('AP04_N20_PRIVATE');
  expect(safeOutput.content).not.toContain('runtimeTarget');
  expect(downloads).toEqual(['reader.md']);
  expect(await authorFingerprint(page)).toBe(before);
  await page.reload();
  const cold = await backup(page);
  expect(cold.project.entities).toEqual(project.entities);
  await attachObservation(info, 'AT-N20-targets-observation', { contractId: contract.id, mismatchField: 'inputType', unimplemented: results, safeOutput: { sha256: safeOutput.sha256, bytes: safeOutput.bytes, selectedScopeId: safe.id }, authorUnchanged: true, limits: ['No arbitrary external command execution or real game adapter is implemented or observed.', 'No success is inferred for Unity, Unreal, ink or Yarn; those targets are diagnostics-only.'] });
});

test('AT-N20 補助: 対応する宣言契約の汎用JSONだけを選択した対応先・仕様版・公開版・hashで保存し、未対応先へ切替えると旧結果を破棄する', async ({ page }, info) => {
  const { project, profile, contract } = fixture('integer');
  const bytes = await exportScenario(project);
  await attachGiven(info, 'AT-N20-supported-control', bytes, { contractId: contract.id, inputType: 'integer', outputType: 'boolean', scope: 'positive generic-runtime control; not the unsupported-command original given' });
  await seed(page, bytes);
  const before = await authorFingerprint(page);
  await output(page);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id);
  await page.getByLabel('出力目的', { exact: true }).selectOption('runtime_json');
  const target = page.getByLabel('制作の対応先', { exact: true });
  await target.selectOption('scenario-runtime');
  await preview(page);
  await expect(page.locator('.runtime-target-result')).toContainText('scenario-runtime');
  await expect(page.locator('.runtime-target-result')).toContainText('runtime仕様 1.1.0 / 形式 1.0.0');
  await expect(page.locator('.runtime-target-result')).toContainText('実ゲーム内の外部処理は未検証');
  const saved = await download(page, 'runtime.json');
  const payload = JSON.parse(saved.content);
  expect(payload).toMatchObject({ format: 'scenario-runtime', formatVersion: '1.0.0', versionLabel: '対応先を検査する公開版', externalEvidence: 'not_included', hashScope: 'public_projection', profile: { profileId: 'scenario-runtime', profileVersion: '1.1.0', schemaVersion: '1.0.0' } });
  expect(payload.externalContracts[0].data).toMatchObject({ inputType: 'integer', outputType: 'boolean', missingPolicy: 'block', key: 'public-contract' });
  expect(payload.contentVersionId).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(payload.runtimeProjectHash).toBe(createHash('sha256').update(canonicalJson(payload.runtimeProject)).digest('hex'));
  expect(payload.profile.omissions).toEqual(expect.arrayContaining(['author_notes', 'playtest_traces', 'asset_bytes']));
  expect(saved.content).not.toContain('AP04_N20_PRIVATE');
  expect(saved.content).not.toContain('runtimeTarget');
  await target.selectOption('unity');
  await expect(page.locator('.export-result')).toHaveCount(0);
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  await preview(page);
  await expect(page.locator('.export-result').getByRole('alert')).toContainText('未実装のゲームエンジン');
  await expect(page.locator('.export-artifact')).toHaveCount(0);
  expect(await authorFingerprint(page)).toBe(before);
  await attachObservation(info, 'AT-N20-supported-control-observation', { sha256: saved.sha256, bytes: saved.bytes, declaredProfile: payload.profile, publicVersion: payload.versionLabel, externalEvidence: payload.externalEvidence, scope: 'positive control only; no arbitrary command or engine execution evidence' });
});
