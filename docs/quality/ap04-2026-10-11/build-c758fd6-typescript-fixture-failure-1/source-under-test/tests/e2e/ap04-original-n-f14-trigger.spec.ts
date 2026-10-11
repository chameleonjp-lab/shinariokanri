import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId } from '../../src/domain/model';
import type { Entity, RuntimeState } from '../../src/domain/types';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';

async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}

function withoutVersion(state: RuntimeState) {
  const { contentVersionId: _version, ...values } = state;
  return values;
}

async function record(page: Page, name: string, prior: string[]): Promise<Entity<'trace'>> {
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
  const file = await backup(page), created = file.project.entities.find(entity => entity.kind === 'trace' && !prior.includes(entity.id));
  if (created?.kind !== 'trace') throw new Error('通常操作で新しく保存した記録がありません');
  await openEntity(page, 'trace', created.name);
  await page.getByLabel('名前', { exact: true }).fill(name);
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await reader(page);
  prior.push(created.id);
  return { ...created, name };
}

test('AT-F14 鍵ありgate・入室trigger・once=runで、鍵状態だけの更新と入室・同じoccurrence再送・再入室を区別する', async ({ page }, info) => {
  test.setTimeout(90_000);
  const p = createProject('AT-F14 鍵と入室を別に扱う');
  const key = createEntity(p.projectId, 'variable', '鍵あり', { key: 'has_key', valueType: 'boolean', scope: 'across_runs', initial: { type: 'boolean', value: false } });
  const count = createEntity(p.projectId, 'variable', '入室時の効果回数', { key: 'entry_effect_count', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 0 }, allowed: { min: null, max: null } });
  const effect = createEntity(p.projectId, 'effect', '入室で一度だけ回数を増やす', { operation: 'add', targetId: count.id, value: { type: 'integer', value: 1 } });
  const triggerId = newId();
  const entry = createEntity(p.projectId, 'flow_node', '鍵ありで入室する入口', { nodeType: 'entry', executionPolicy: 'first_match', gate: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } }, trigger: { id: triggerId, event: 'enter', eventKey: '入室', repeat: 'once', scope: 'run' } });
  const inside = createEntity(p.projectId, 'flow_node', '入室済みの室内', { nodeType: 'choice' });
  const enter = createEntity(p.projectId, 'flow_edge', '入室で室内へ', { fromId: entry.id, toId: inside.id, edgeType: 'automatic', effectIds: [effect.id] });
  const returnToEntry = createEntity(p.projectId, 'flow_edge', '再入室の入口へ戻る', { fromId: inside.id, toId: entry.id, label: '再入室の入口へ戻る' });
  const graph = createEntity(p.projectId, 'flow_graph', '入室triggerのgraph', { nodeIds: [entry.id, inside.id], edgeIds: [enter.id, returnToEntry.id], entryIds: [entry.id], exitIds: [] });
  p.entities.push(key, count, effect, entry, inside, enter, returnToEntry, graph);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F14', bytes, { gate: entry.data.gate, trigger: entry.data.trigger, automaticPolicyExplicit: entry.data.executionPolicy, keyVariableId: key.id, effectCountId: count.id, effectId: effect.id, entryEdgeId: enter.id, booleanKeyStateIsAuthorDeclared: true });
  await seed(page, bytes);
  await reader(page);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-trial-heading')).toContainText('進行不可');
  const authorBeforeStub = await authorFingerprint(page);
  await page.locator('.runtime-variables .runtime-variable').filter({ hasText: key.name }).getByRole('button', { name: '仮値', exact: true }).click();
  const stub = page.getByRole('dialog', { name: '作者の仮値を設定', exact: true });
  await stub.getByLabel('値の型', { exact: true }).selectOption('boolean');
  await stub.getByLabel('真偽値', { exact: true }).selectOption('true');
  await stub.getByRole('button', { name: '仮値を適用', exact: true }).click();
  await expect(page.locator('.reader-sheet h2')).toHaveText(entry.name);
  await expect(page.locator('.runtime-variable').filter({ hasText: count.name })).toContainText('0');
  const advance = page.getByRole('button', { name: '進行規則に従って次へ', exact: true });
  await expect(advance).toBeDisabled();
  await expect(page.getByRole('button', { name: '直前のきっかけを再送', exact: true })).toHaveCount(0);
  expect(await authorFingerprint(page)).toBe(authorBeforeStub);
  const event = page.getByRole('checkbox', { name: '宣言したきっかけ「入室」で進む', exact: true });
  await event.check();
  await advance.click();
  await expect(page.locator('.reader-sheet h2')).toHaveText(inside.name);
  await expect(page.locator('.runtime-variable').filter({ hasText: count.name })).toContainText('1');
  const ids: string[] = [], first = await record(page, '初回入室の記録', ids);
  expect(first.data.steps).toHaveLength(2);
  const firstEvent = first.data.steps.find(step => step.edgeIds.includes(enter.id));
  expect(firstEvent?.occurrenceId).toMatch(/^[0-9a-f-]{36}$/);
  expect(firstEvent?.after.onceTriggers).toContain(`trigger:run:0:${triggerId}`);
  const beforeResend = await page.locator('.reader-state-panel').innerText();
  const resend = page.getByRole('button', { name: '直前のきっかけを再送', exact: true });
  await expect(resend).toBeEnabled();
  await resend.click();
  await resend.click();
  await expect(page.locator('.reader-sheet h2')).toHaveText(inside.name);
  expect(await page.locator('.reader-state-panel').innerText()).toBe(beforeResend);
  const duplicate = await record(page, '同一occurrence再送後の記録', ids);
  expect(duplicate.data.steps).toHaveLength(first.data.steps.length);
  expect(duplicate.data.steps.map(step => ({ ...step, before: withoutVersion(step.before), after: withoutVersion(step.after), ...(step.presentationState ? { presentationState: withoutVersion(step.presentationState) } : {}) }))).toEqual(first.data.steps.map(step => ({ ...step, before: withoutVersion(step.before), after: withoutVersion(step.after), ...(step.presentationState ? { presentationState: withoutVersion(step.presentationState) } : {}) })));
  expect(duplicate.data.steps.find(step => step.edgeIds.includes(enter.id))?.occurrenceId).toBe(firstEvent?.occurrenceId);
  await page.getByRole('button', { name: returnToEntry.data.label!, exact: true }).click();
  await event.check();
  await advance.click();
  await expect(page.locator('.reader-issue')).toContainText('この一回限りの発火は実行済みです');
  await expect(page.locator('.runtime-variable').filter({ hasText: count.name })).toContainText('1');
  const reentered = await record(page, '同じrunの再入室を拒否した記録', ids);
  expect(reentered.data.steps.filter(step => step.edgeIds.includes(enter.id))).toHaveLength(1);
  expect(reentered.data.steps.at(-1)?.after.onceTriggers.filter(value => value === `trigger:run:0:${triggerId}`)).toHaveLength(1);
  await page.getByRole('button', { name: '次の周回', exact: true }).click();
  await expect(page.locator('.runtime-variable').filter({ hasText: count.name })).toContainText('0');
  await event.check();
  await advance.click();
  await expect(page.locator('.runtime-variable').filter({ hasText: count.name })).toContainText('1');
  const nextRun = await record(page, '次runの一度目の入室記録', ids);
  expect(nextRun.data.steps.at(-1)?.after.loopNumber).toBe(1);
  expect(nextRun.data.steps.filter(step => step.edgeIds.includes(enter.id))).toHaveLength(1);
  expect(nextRun.data.steps.at(-1)?.after.onceTriggers).toContain(`trigger:run:1:${triggerId}`);
  const final = await backup(page);
  await page.reload();
  const cold = await backup(page);
  expect(cold.project).toEqual(final.project);
  expect(cold.project.entities.find(entity => entity.id === key.id)?.data).toEqual(key.data);
  expect(cold.project.entities.find(entity => entity.id === count.id)?.data).toEqual(count.data);
  await attachObservation(info, 'AT-F14-observation', { triggerId, scope: 'run', occurrenceId: firstEvent?.occurrenceId, savedTraceIds: ids, initialCount: 0, firstEntryCount: 1, duplicateDeliveryAddedSteps: 0, sameRunEntryEffectCount: 1, nextRunEntryEffectCount: 1, nextRunLoop: nextRun.data.steps.at(-1)?.after.loopNumber, authorVariablesUnchanged: true, coldProjectAndRecordsUnchanged: true });
});
