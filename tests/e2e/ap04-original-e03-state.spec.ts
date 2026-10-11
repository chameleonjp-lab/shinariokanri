import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText, validateProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, backup, navigate, seed } from './ap04-original-helpers';

async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}
async function start(page: Page, entryId: string) {
  await page.getByLabel('試読する作品版', { exact: true }).selectOption('');
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entryId);
  const button = page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ });
  await button.click();
}
async function shownState(page: Page) {
  return {
    variables: await page.locator('.runtime-variables').innerText(),
    counts: await page.locator('.reader-state-counts').innerText(),
  };
}

test('AT-E03 同じ鍵取得/未取得作品で合流差・巻戻し・禁止一括効果・未知条件と終端を区別する', async ({ page }, info) => {
  const p = createProject('AT-E03 鍵を持って合流する固定作品');
  const key = createEntity(p.projectId, 'item', '合流後も保持する鍵');
  const money = createEntity(p.projectId, 'variable', '一括拒否で保持する金額', { key: 'money', valueType: 'integer', scope: 'across_runs', initial: { type: 'integer', value: 10 }, allowed: { min: 0, max: 100 } });
  const lock = createEntity(p.projectId, 'variable', '宣言した鍵状態', { key: 'lock', valueType: 'enum', scope: 'across_runs', initial: { type: 'enum', value: 'locked' }, allowed: { values: ['locked', 'opened', 'forbidden'] }, transitionRules: [{ from: { type: 'enum', value: 'locked' }, to: { type: 'enum', value: 'opened' }, reason: '鍵を受け取る正規遷移' }] });
  const external = createEntity(p.projectId, 'external_contract', '未取得の外部条件', { key: 'unknown_gate', owner: 'game', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'unknown', version: '1.0.0' });
  const scene = createEntity(p.projectId, 'scene', '二つの鍵経路を選ぶ場面', { body: textToRichText('鍵を取るか、持たずに合流する。') });
  const entry = createEntity(p.projectId, 'flow_node', '鍵経路の入口', { nodeType: 'entry', sceneId: scene.id });
  const merged = createEntity(p.projectId, 'flow_node', '同じ合流先', { nodeType: 'terminal', terminalReason: '意図した鍵経路の終端' });
  const unknown = createEntity(p.projectId, 'flow_node', '外部値が未知の入口', { nodeType: 'entry' });
  const blocked = createEntity(p.projectId, 'flow_node', '有効選択肢ゼロの入口', { nodeType: 'entry' });
  const grant = createEntity(p.projectId, 'effect', '鍵を付与', { operation: 'grant', targetId: key.id, value: { type: 'integer', value: 1 } });
  const open = createEntity(p.projectId, 'effect', '宣言した正規遷移', { operation: 'set', targetId: lock.id, value: { type: 'enum', value: 'opened' } });
  const spend = createEntity(p.projectId, 'effect', '先に金額を変更', { operation: 'set', targetId: money.id, value: { type: 'integer', value: 5 } });
  const forbidden = createEntity(p.projectId, 'effect', '宣言していない禁止遷移', { operation: 'set', targetId: lock.id, value: { type: 'enum', value: 'forbidden' } });
  const take = createEntity(p.projectId, 'flow_edge', '鍵を取得して合流', { fromId: entry.id, toId: merged.id, label: '鍵を取得して合流', effectIds: [grant.id, open.id] });
  const leave = createEntity(p.projectId, 'flow_edge', '鍵なしで合流', { fromId: entry.id, toId: merged.id, label: '鍵なしで合流' });
  const illegal = createEntity(p.projectId, 'flow_edge', '禁止遷移を含む一括効果', { fromId: entry.id, toId: merged.id, label: '禁止遷移を含む一括効果', effectIds: [spend.id, grant.id, forbidden.id] });
  const unknownEdge = createEntity(p.projectId, 'flow_edge', '外部値が真なら進む', { fromId: unknown.id, toId: merged.id, label: '外部値が真なら進む', condition: { op: 'external', contractId: external.id } });
  const falseEdge = createEntity(p.projectId, 'flow_edge', '宣言した偽の条件', { fromId: blocked.id, toId: merged.id, label: '宣言した偽の条件', condition: { op: 'constant', value: false } });
  const graph = createEntity(p.projectId, 'flow_graph', '鍵・未知・行き止まりの固定分岐', { nodeIds: [entry.id, unknown.id, blocked.id, merged.id], edgeIds: [take.id, leave.id, illegal.id, unknownEdge.id, falseEdge.id], entryIds: [entry.id, unknown.id, blocked.id], exitIds: [merged.id] });
  p.entities.push(key, money, lock, external, scene, entry, merged, unknown, blocked, grant, open, spend, forbidden, take, leave, illegal, unknownEdge, falseEdge, graph);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const validation = validateProject(p); if (!validation.ok) throw Error(JSON.stringify(validation.issues));
  const bytes = await exportScenario(p);
  await test.step('AT-E03 given: 鍵取得/未取得が同じ合流先へ続く固定作品', async () => {
    await attachGiven(info, 'AT-E03', bytes, { entry: entry.id, merge: merged.id, key: key.id, take: take.id, leave: leave.id, forbiddenBatch: illegal.id, declaredTransition: lock.data.transitionRules });
    await seed(page, bytes); await reader(page); await start(page, entry.id);
  });
  let initial!: Awaited<ReturnType<typeof shownState>>;
  await test.step('AT-E03 when: 二経路を実行し戻す、禁止遷移を含む一括効果を選ぶ', async () => {
    initial = await shownState(page);
    await page.getByRole('button', { name: illegal.name, exact: true }).click();
    await expect(page.locator('.reader-issue')).toContainText(/遷移|禁止/);
    expect(await shownState(page)).toEqual(initial);
    await expect(page.locator('.reader-sheet h2')).toHaveText(scene.name);
    await page.getByRole('button', { name: take.name, exact: true }).click();
    await expect(page.locator('.reader-sheet h2')).toHaveText(merged.name);
    await expect(page.locator('.reader-state-counts')).toContainText('1個');
    await page.getByRole('button', { name: '経路を記録', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
    await page.getByRole('button', { name: '一手戻る', exact: true }).click();
    expect(await shownState(page)).toEqual(initial);
    await page.getByRole('button', { name: leave.name, exact: true }).click();
    await expect(page.locator('.reader-sheet h2')).toHaveText(merged.name);
    await expect(page.locator('.reader-state-counts')).toContainText('0個');
    await page.getByRole('button', { name: '経路を記録', exact: true }).click();
    await expect(page.locator('.regression-paths input[type=checkbox]')).toHaveCount(2);
    await page.getByRole('button', { name: '一手戻る', exact: true }).click();
    expect(await shownState(page)).toEqual(initial);
  });
  await test.step('AT-E03 then: 合流後も鍵差が残り、戻すと全状態が復元され、不正効果は全体拒否となる', async () => {
    for (const checkbox of await page.locator('.regression-paths input[type=checkbox]').all()) await checkbox.check();
    await page.getByRole('button', { name: '選んだ二経路を再生して比較', exact: true }).click();
    await expect(page.locator('.regression-paths')).toContainText('同じ合流点の状態');
    await expect(page.locator('.regression-paths')).toContainText('itemInstances');
    await expect(page.locator('.regression-paths')).toContainText(`variableValues.${lock.id}`);
  });
  await test.step('AT-E03 negative_or_edge: 未知の値は偽にされず、有効選択肢ゼロは意図した終端と区別される', async () => {
    await start(page, unknown.id);
    await expect(page.locator('.reader-trial-heading')).toContainText('未確認の条件');
    await expect(page.locator('.reader-choice').filter({ hasText: unknownEdge.name })).toContainText('未確認');
    await expect(page.getByRole('button', { name: new RegExp(unknownEdge.name) })).toBeDisabled();
    await start(page, blocked.id);
    await expect(page.locator('.reader-trial-heading')).toContainText('進行不可');
    await expect(page.locator('.reader-trial-heading')).not.toContainText('意図した終端');
    await start(page, entry.id); await page.getByRole('button', { name: leave.name, exact: true }).click();
    await expect(page.locator('.reader-trial-heading')).toContainText('意図した終端');
    await page.reload(); const saved = await backup(page);
    const traces = saved.project.entities.filter(entity => entity.kind === 'trace');
    expect(traces).toHaveLength(2);
    const states = traces.map(trace => trace.kind === 'trace' ? trace.data.steps.at(-1)!.after : null);
    expect(states.map(state => state!.itemInstances.filter(item => !item.consumed).length).sort()).toEqual([0, 1]);
    for (const state of states) expect(state!.variableValues[money.id]).toEqual({ type: 'integer', value: 10 });
    await attachObservation(info, 'AT-E03-observed', { traceIds: traces.map(trace => trace.id), merge: merged.id, finalStates: states, rejectedBatchPreservedVisibleState: initial!, rewindPreservedVisibleState: true, unknownIsFalse: false, blockedIsIntentionalTerminal: false });
  });
});
