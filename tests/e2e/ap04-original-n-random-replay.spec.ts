import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

// Candidate only: AT-N12 given/when/then/negative_or_edge all remain not_run
// until this exact UI procedure executes in the fixed browser build.
async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}

test('AT-N12 通常 UI の抽選経路を記録して同じ固定版で再現し、版変更の再確認結果を旧版の証跡へ混ぜない', async ({ page }, info) => {
  // given: the same edition has two true choices and an explicit random seed.
  const p = createProject('AT-N12 抽選を含む固定版の再実行');
  const amount = createEntity(p.projectId, 'variable', '抽選後の金額', { key: 'draw_amount', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } });
  const scene = createEntity(p.projectId, 'scene', '抽選前の本文', { body: textToRichText('同じ版と抽選種から二つの真の選択肢を抽選する。') });
  const entry = createEntity(p.projectId, 'flow_node', '抽選の入口', { nodeType: 'entry', sceneId: scene.id });
  const endings = [1, 2].map(value => createEntity(p.projectId, 'flow_node', `抽選の終端${value}`, { nodeType: 'terminal', terminalReason: `抽選の終端${value}` }));
  const effects = [1, 2].map(value => createEntity(p.projectId, 'effect', `抽選の金額${value}`, { operation: 'add', targetId: amount.id, value: { type: 'integer', value } }));
  const edges = endings.map((ending, index) => createEntity(p.projectId, 'flow_edge', `抽選候補${index + 1}`, { fromId: entry.id, toId: ending.id, label: `抽選候補${index + 1}`, condition: { op: 'compare', variableId: amount.id, comparator: 'eq', value: { type: 'integer', value: 0 } }, effectIds: [effects[index].id] }));
  const graph = createEntity(p.projectId, 'flow_graph', '抽選経路', { nodeIds: [entry.id, ...endings.map(ending => ending.id)], edgeIds: edges.map(edge => edge.id), entryIds: [entry.id], exitIds: endings.map(ending => ending.id) });
  p.entities.push(amount, scene, entry, ...endings, ...effects, ...edges, graph);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-N12', bytes, { projectId: p.projectId, entryId: entry.id, candidateEdgeIds: edges.map(edge => edge.id), conditions: edges.map(edge => edge.data.condition), variableId: amount.id, seed: 'AT-N12-fixed-random-seed' });
  await seed(page, bytes);
  await reader(page);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByLabel('抽選種', { exact: true }).fill('AT-N12-fixed-random-seed');
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  for (const edge of edges) await expect(page.getByRole('button', { name: edge.data.label!, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '真の選択肢から抽選', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('意図した終端');
  await expect(page.locator('.reader-state-counts')).toContainText('抽選位置');
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.locator('.saved-traces')).toContainText('試読経路');
  const recorded = await backup(page);
  const old = recorded.project.entities.find(entity => entity.kind === 'trace');
  if (!old || old.kind !== 'trace') throw new Error('抽選した経路の記録がありません');
  expect(old.data.steps).toHaveLength(1);
  const step = old.data.steps[0], selectedEdge = edges.find(edge => step.edgeIds.includes(edge.id));
  if (!selectedEdge) throw new Error('抽選した進行線を記録から確認できません');
  expect(step.before.rngSeed).toBe('AT-N12-fixed-random-seed');
  expect(step.after.rngSeed).toBe(step.before.rngSeed);
  expect(step.after.rngPosition).toBe(step.before.rngPosition + 1);
  expect(step.conditionResults).toEqual(expect.arrayContaining(edges.map(edge => expect.objectContaining({ targetId: edge.id, value: 'true' }))));
  const oldFinalValue = step.after.variableValues[amount.id];
  expect(oldFinalValue).toEqual({ type: 'integer', value: edges.indexOf(selectedEdge) + 1 });
  const oldPin = recorded.project.snapshots.find(snapshot => snapshot.id === old.data.contentVersionId);
  expect(oldPin).toBeDefined();

  // when/then: use the saved confirmation record, not a new live draw.
  for (let replay = 0; replay < 2; replay++) {
    await reader(page);
    await page.locator('.saved-traces').getByRole('button', { name: `${old.name} 再実行して状態を比較`, exact: true }).click();
    await expect(page.locator('.reader-page')).toContainText('保存版で経路を再実行しました。状態の一致を検査しています。');
    await expect(page.locator('.reader-trial-heading')).toContainText('意図した終端');
    await expect(page.getByLabel('試読する作品版', { exact: true })).toHaveValue(old.data.contentVersionId);
    await expect(page.locator('.runtime-variable').filter({ hasText: amount.name })).toContainText(String(oldFinalValue.value));
    await expect(page.locator('.reader-state-counts').locator('dd').nth(3)).toHaveText(String(step.after.rngPosition));
    const sameEdition = await backup(page);
    expect(sameEdition.project.entities.find(entity => entity.id === old.id)).toEqual(old);
    expect(sameEdition.project.snapshots.find(snapshot => snapshot.id === old.data.contentVersionId)).toEqual(oldPin);
  }

  // A different actual author revision requires the ordinary reconfirmation UI.
  const selectedEffect = effects[edges.indexOf(selectedEdge)];
  await openEntity(page, 'effect', selectedEffect.name);
  await editData(page, { ...selectedEffect.data, value: { type: 'integer', value: 7 } });
  await reader(page);
  const tool = page.getByRole('region', { name: '開始版の移行と経路の再確認' });
  await tool.locator('summary').filter({ hasText: '保存した経路を改訂稿で再確認する' }).click();
  await tool.getByRole('radio', { name: new RegExp(old.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).check();
  await expect(tool).toContainText('再確認待ち');
  const awaiting = await backup(page);
  expect(awaiting.project.entities.find(entity => entity.id === old.id)).toEqual(old);
  expect(awaiting.project.entities.filter(entity => entity.kind === 'trace')).toHaveLength(1);
  await reader(page);
  await tool.getByRole('button', { name: '旧経路を改訂稿で再実行して確認', exact: true }).click();
  await expect(tool).toContainText('再実行基底revision');
  await tool.getByRole('button', { name: '再実行した新しい経路と証跡を保存', exact: true }).click();
  await expect(tool).toContainText('旧版の証跡も保持しています。');
  await page.reload();
  const cold = await backup(page), revised = cold.project.entities.find(entity => entity.kind === 'trace' && entity.data.reconfirmation?.sourceTraceId === old.id);
  if (!revised || revised.kind !== 'trace') throw new Error('改訂稿を再確認した別経路がありません');
  // negative_or_edge: new result has separate IDs/edition/source binding; old
  // trace, condition observations and immutable content/hash remain unchanged.
  expect(revised.id).not.toBe(old.id);
  expect(revised.data.contentVersionId).not.toBe(old.data.contentVersionId);
  expect(revised.data.reconfirmation).toMatchObject({ sourceTraceId: old.id, sourceVersionId: old.data.contentVersionId, baseRevision: awaiting.project.revision });
  expect(revised.data.steps.at(-1)?.after.variableValues[amount.id]).toEqual({ type: 'integer', value: 7 });
  expect(cold.project.entities.find(entity => entity.id === old.id)).toEqual(old);
  expect(cold.project.snapshots.find(snapshot => snapshot.id === old.data.contentVersionId)).toEqual(oldPin);
  await reader(page);
  const saved = page.locator('.saved-traces');
  await saved.getByRole('button', { name: `${old.name} 再実行して状態を比較`, exact: true }).click();
  await expect(page.getByLabel('試読する作品版', { exact: true })).toHaveValue(old.data.contentVersionId);
  await expect(page.locator('.runtime-variable').filter({ hasText: amount.name })).toContainText(String(oldFinalValue.value));
  await saved.getByRole('button', { name: `${revised.name} 再実行して状態を比較`, exact: true }).click();
  await expect(page.getByLabel('試読する作品版', { exact: true })).toHaveValue(revised.data.contentVersionId);
  await expect(page.locator('.runtime-variable').filter({ hasText: amount.name })).toContainText('7');
  await attachObservation(info, 'AT-N12-observation', { selectedEdgeId: selectedEdge.id, oldTraceId: old.id, oldVersionId: old.data.contentVersionId, oldContentHash: oldPin!.contentHash, oldConditionResults: step.conditionResults, randomSeed: step.before.rngSeed, randomPositionBefore: step.before.rngPosition, randomPositionAfter: step.after.rngPosition, oldFinalValue, revisedTraceId: revised.id, revisedVersionId: revised.data.contentVersionId, reconfirmation: revised.data.reconfirmation, revisedFinalValue: revised.data.steps.at(-1)?.after.variableValues[amount.id], coldFileSha256: createHash('sha256').update(cold.bytes).digest('hex') });
});
