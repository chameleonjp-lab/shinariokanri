import { expect, test, type Page } from '@playwright/test';
import type { Condition, ProjectData, TypedValue } from '../../src/domain/types';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { DomainValidationError, evaluateCondition, initializeRuntimeState } from '../../src/domain/conditions';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

// AT-N16 remains not_run until all original clauses execute on the fixed UI.
// The oracle is the real shared pure evaluator, never a UI-specific copy.
async function reader(page: Page, entryId: string) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByLabel('試読する作品版', { exact: true }).selectOption('');
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entryId);
  await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click();
}

function evaluate(p: ProjectData, condition: Condition, externalValues: Record<string, TypedValue> = {}) {
  return evaluateCondition(condition, { state: initializeRuntimeState(p), entities: p.entities, externalValues });
}

function failure(p: ProjectData, condition: Condition, externalValues: Record<string, TypedValue> = {}) {
  try { evaluate(p, condition, externalValues); }
  catch (error) { if (error instanceof DomainValidationError) return error.issues[0]; throw error; }
  throw new Error('共有評価処理がこの入力を拒否しませんでした');
}

test('AT-N16 同じ条件 ID を構造化画面と JSON で編集し、純粋評価の真偽不明・実エラーコードと試読表示を比較する', async ({ page }, info) => {
  const p = createProject('AT-N16 条件の共通規則');
  const variable = createEntity(p.projectId, 'variable', '共通の整数', { key: 'common_count', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 2 }, allowed: {} });
  const contract = createEntity(p.projectId, 'external_contract', '宣言した整数の外部値', { key: 'external_count', owner: 'game', inputType: 'integer', outputType: 'integer', missingPolicy: 'unknown' });
  const scene = createEntity(p.projectId, 'scene', '共通規則の本文', { body: textToRichText('構造化表示と JSON 表示は同じ条件を編集する。') });
  const entry = createEntity(p.projectId, 'flow_node', '共通規則の入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '共通規則の終端', { nodeType: 'terminal', terminalReason: '条件を確認した' });
  const initial: Condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'integer', value: 0 } };
  const edge = createEntity(p.projectId, 'flow_edge', '同じ条件を編集する線', { fromId: entry.id, toId: end.id, label: '共通規則で進む', condition: initial });
  p.entities.push(variable, contract, scene, entry, end, edge);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-N16', bytes, { projectId: p.projectId, entityIds: p.entities.map(entity => entity.id), edgeId: edge.id, variableId: variable.id, contractId: contract.id, initialCondition: initial, evaluator: 'src/domain/conditions.ts:evaluateCondition', displays: ['structured condition editor', 'full data JSON editor', 'trial reader'] });
  await seed(page, bytes);

  // given/when: the first edit uses the real structured condition controls.
  await openEntity(page, 'flow_edge', edge.name);
  const field = page.locator('.detail-panel [data-field="condition"]');
  await field.getByLabel('比較演算', { exact: true }).selectOption('ge');
  await field.getByLabel('値', { exact: true }).fill('3');
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const structured = await backup(page), structuredEdge = structured.project.entities.find(entity => entity.id === edge.id);
  if (!structuredEdge || structuredEdge.kind !== 'flow_edge') throw new Error('構造化画面で保存した条件がありません');
  expect(structuredEdge.data.condition).toEqual({ op: 'compare', variableId: variable.id, comparator: 'ge', value: { type: 'integer', value: 3 } });
  const falseResult = evaluate(structured.project, structuredEdge.data.condition!);
  expect(falseResult.value).toBe('false');
  await reader(page, entry.id);
  const choice = page.locator('.reader-choice').filter({ hasText: '共通規則で進む' });
  await expect(choice).toBeDisabled();
  await expect(choice).toContainText('条件を満たしていません');

  // The same durable record/reference IDs are then edited through JSON.
  const trueCondition: Condition = { ...structuredEdge.data.condition!, op: 'compare', variableId: variable.id, comparator: 'ge', value: { type: 'integer', value: 2 } };
  await openEntity(page, 'flow_edge', edge.name);
  await editData(page, { ...structuredEdge.data, condition: trueCondition });
  const json = await backup(page), jsonEdge = json.project.entities.find(entity => entity.id === edge.id);
  if (!jsonEdge || jsonEdge.kind !== 'flow_edge') throw new Error('JSON 画面で保存した条件がありません');
  expect(jsonEdge.data.condition).toEqual(trueCondition);
  const trueResult = evaluate(json.project, jsonEdge.data.condition!);
  expect(trueResult.value).toBe('true');
  await reader(page, entry.id);
  await expect(choice).toBeEnabled();

  // An unknown declared value remains unknown in both the oracle and UI.
  await openEntity(page, 'variable', variable.name);
  await editData(page, { ...variable.data, initial: { type: 'unknown', value: null, reason: 'AT-N16 未調査' } });
  const unknown = await backup(page);
  const unknownResult = evaluate(unknown.project, trueCondition);
  expect(unknownResult).toEqual({ value: 'unknown', reasons: ['AT-N16 未調査'] });
  await reader(page, entry.id);
  await expect(choice).toBeDisabled();
  await expect(choice).toContainText('未確認');
  for (const reason of unknownResult.reasons) await expect(choice).toContainText(reason);
  await openEntity(page, 'variable', variable.name);
  await editData(page, variable.data);

  // A valid AST with a mismatched typed comparison has the evaluator's code.
  await openEntity(page, 'flow_edge', edge.name);
  const details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
  await details.locator('summary').click();
  const raw = details.getByRole('textbox', { name: '詳細データ', exact: true });
  const beforeInvalid = await authorFingerprint(page);
  const mismatch: Condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } };
  const mismatchIssue = failure(json.project, mismatch);
  await raw.fill(JSON.stringify({ ...jsonEdge.data, condition: mismatch }, null, 2));
  const error = page.locator('.detail-panel [data-field="condition"]').getByRole('alert');
  await expect(error.locator('code')).toHaveText(mismatchIssue.code);
  await expect(error).toContainText('値の型が比較する状態と一致しません');
  await expect(page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ })).toBeDisabled();
  expect(await authorFingerprint(page)).toBe(beforeInvalid);
  await raw.fill(JSON.stringify(jsonEdge.data, null, 2));
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');

  // Edit one external-condition AST using both displays. A declared integer
  // supplied by the ordinary stub dialog cannot be treated as boolean truth.
  await field.getByLabel('条件の種類', { exact: true }).selectOption('external');
  await field.getByLabel('参照先', { exact: true }).selectOption(contract.id);
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const external = await backup(page), externalEdge = external.project.entities.find(entity => entity.id === edge.id);
  if (!externalEdge || externalEdge.kind !== 'flow_edge') throw new Error('外部条件がありません');
  const externalCondition: Condition = { op: 'external', contractId: contract.id };
  expect(externalEdge.data.condition).toEqual(externalCondition);
  await openEntity(page, 'flow_edge', edge.name);
  await editData(page, { ...externalEdge.data, condition: externalCondition });
  const input: Record<string, TypedValue> = { [contract.id]: { type: 'integer', value: 1 } };
  const externalIssue = failure(external.project, externalCondition, input);
  await reader(page, entry.id);
  await expect(choice).toContainText('未確認');
  const beforeStub = await authorFingerprint(page);
  await page.locator('.runtime-external .runtime-variable').filter({ hasText: contract.name }).getByRole('button', { name: '仮値', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '作者の仮値を設定', exact: true });
  await dialog.getByLabel('値の型', { exact: true }).selectOption('integer');
  await dialog.getByLabel('値', { exact: true }).fill('1');
  await dialog.getByRole('button', { name: '仮値を適用', exact: true }).click();
  await expect(page.locator('.reader-issue code')).toHaveText(externalIssue.code);
  await expect(page.locator('.reader-issue')).toContainText(externalIssue.message);
  await expect(page.locator('.reader-trial-heading')).toContainText('確認が必要');
  expect(await authorFingerprint(page)).toBe(beforeStub);
  await page.reload();
  const cold = await backup(page);
  // negative_or_edge: every display retains the same shared UUID references;
  // trial input never creates replacement author IDs or commits runtime values.
  expect(cold.project.entities.map(entity => entity.id).sort()).toEqual(p.entities.map(entity => entity.id).sort());
  expect(cold.project.entities.find(entity => entity.id === edge.id)?.data).toMatchObject({ condition: externalCondition });
  expect(cold.project.entities.find(entity => entity.id === variable.id)?.data).toEqual(variable.data);
  await attachObservation(info, 'AT-N16-observation', { edgeId: edge.id, variableId: variable.id, contractId: contract.id, structuredCondition: structuredEdge.data.condition, jsonCondition: jsonEdge.data.condition, falseResult, trueResult, unknownResult, mismatchCode: mismatchIssue.code, runtimeErrorCode: externalIssue.code, externalCondition, canonicalRuntimeInputUnchanged: true, coldRevision: cold.project.revision, retainedEntityIds: cold.project.entities.map(entity => entity.id), guidanceWithoutEvaluatorIssueHasNoInventedCode: true });
});
