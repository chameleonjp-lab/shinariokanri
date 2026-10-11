import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, KIND_LABELS, newId, textToRichText } from '../../src/domain/model';
import type { AnalysisResult } from '../../src/domain/runtime';
import type { Entity, EntityDataMap, EntityKind, NamePolicy, ProjectData } from '../../src/domain/types';
import { authorFingerprint, backup, editData, entity, findEntity, navigate, reader } from './ap04-original-bm-helpers';
export * from './ap04-original-bm-helpers';

export async function start(page: Page, entryId: string) {
  await reader(page); await page.getByLabel('試読する作品版', { exact: true }).selectOption('');
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entryId);
  await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click();
}
export async function record(page: Page) {
  await page.getByRole('button', { name: '経路を記録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
}
export async function analyze(page: Page): Promise<AnalysisResult> {
  await page.getByRole('button', { name: '到達性と行き止まりを検査', exact: true }).click();
  await expect(page.locator('.analysis-result-heading')).toBeVisible({ timeout: 35000 });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '検査結果を保存', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
export async function production(page: Page) {
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '制作', exact: true }).click();
}
export async function add<K extends EntityKind>(page: Page, kind: K, name: string, data: Partial<EntityDataMap[K]>) {
  await navigate(page, /^資料/); await page.getByLabel('情報の種類', { exact: true }).selectOption(kind);
  await page.getByRole('button', { name: `${KIND_LABELS[kind]}を追加`, exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '情報を追加', exact: true }); await dialog.getByLabel('名前', { exact: true }).fill(name); await dialog.getByRole('button', { name: '編集を始める', exact: true }).click();
  await page.getByLabel('情報の状態', { exact: true }).selectOption('confirmed'); await editData(page, createEntity(newId(), kind, name, data).data);
  const saved = (await backup(page)).project, row = saved.entities.find(row => row.kind === kind && row.name === name);
  if (!row) throw Error(`通常画面で追加した情報がありません: ${name}`); return findEntity(saved, row.id, kind);
}
export async function rejectData(page: Page, data: unknown, message: RegExp) {
  const before = await authorFingerprint(page), details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.getByRole('textbox', { name: '詳細データ', exact: true }).fill(JSON.stringify(data, null, 2));
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel')).toContainText(message);
  expect(await authorFingerprint(page)).toBe(before);
}
export async function stub(page: Page, name: string, type: 'boolean' | 'integer' | 'enum' | 'unknown', value: string) {
  await page.locator('.runtime-variable').filter({ hasText: name }).getByRole('button', { name: '仮値', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '作者の仮値を設定', exact: true });
  await modal.getByLabel('値の型', { exact: true }).selectOption(type);
  if (type === 'boolean') await modal.getByLabel('真偽値', { exact: true }).selectOption(value);
  else await modal.getByLabel(type === 'unknown' ? '未設定の理由' : '値', { exact: true }).fill(value);
  await modal.getByRole('button', { name: '仮値を適用', exact: true }).click();
}
export function runtimeFixture(title: string) {
  const p = createProject(title), entry = entity(p, 'flow_node', '宣言した入口', { nodeType: 'entry' }), end = entity(p, 'flow_node', '宣言した終端', { nodeType: 'terminal', terminalReason: '作者が定めた終了' });
  return { p, entry, end };
}
/** Each case specializes the same scene/disclosure/flow relationships as E04. */
export function narrativeFixture(title: string) {
  const { p, entry, end } = runtimeFixture(title);
  const opening = entity(p, 'scene', '導入の本文', { body: textToRichText('謎を読み手へ提示する。') }), clueScene = entity(p, 'scene', '手掛かりの本文', { body: textToRichText('真相を示す第一の手掛かり。') }), revealScene = entity(p, 'scene', '回収の本文', { body: textToRichText('作者が設定した真相へ到達する。') });
  entry.data.sceneId = opening.id;
  const clueNode = entity(p, 'flow_node', '手掛かりの提示点', { nodeType: 'scene', sceneId: clueScene.id }), reveal = entity(p, 'flow_node', '真相の提示点', { nodeType: 'scene', sceneId: revealScene.id });
  const question = entity(p, 'foreshadow', '独立した問いQ', { question: textToRichText('真相は何か。'), resolutionPolicy: 'this_work' });
  const clue = entity(p, 'disclosure', '必須情報C', { foreshadowId: question.id, anchor: { entityId: clueScene.id }, role: 'clue', stage: 'hint' }), payoff = entity(p, 'disclosure', '回収P', { foreshadowId: question.id, anchor: { entityId: revealScene.id }, role: 'payoff', stage: 'reveal' });
  question.data.clueIds = [clue.id]; question.data.requiredInfo = [clue.id]; question.data.payoffIds = [payoff.id];
  const withClue = entity(p, 'flow_edge', '情報Cを通る', { fromId: entry.id, toId: clueNode.id, label: '情報Cを通る' }), bypass = entity(p, 'flow_edge', '情報を飛ばして回収へ', { fromId: entry.id, toId: reveal.id, label: '情報を飛ばして回収へ' }), join = entity(p, 'flow_edge', '情報Cから回収へ', { fromId: clueNode.id, toId: reveal.id, label: '情報Cから回収へ' }), finish = entity(p, 'flow_edge', '今作を終える', { fromId: reveal.id, toId: end.id, label: '今作を終える' });
  const graph = entity(p, 'flow_graph', '宣言した提示経路', { nodeIds: [entry.id, clueNode.id, reveal.id, end.id], edgeIds: [withClue.id, bypass.id, join.id, finish.id], entryIds: [entry.id], exitIds: [end.id] });
  return { p, entry, end, opening, clueScene, revealScene, clueNode, reveal, question, clue, payoff, withClue, bypass, join, finish, graph };
}
export function publicProfile(p: ProjectData) {
  const selected = p.entities.filter(row => ['scene', 'dialogue_line', 'flow_node', 'flow_edge', 'flow_graph', 'external_contract', 'variable', 'effect'].includes(row.kind));
  const publicTexts = Object.fromEntries(selected.map(row => [row.id, Object.fromEntries(Object.entries(row.data).filter(([field, value]) => value != null && ['body', 'summary', 'text', 'key', 'label', 'terminalReason', 'reason', 'description'].includes(field)).map(([field, value]) => [field, Array.isArray(value) ? value.map(block => ({ ...block, id: newId() })) : value]))]));
  return entity(p, 'projection_profile', '確認した公開範囲', { audience: 'reader', publicTitle: p.name, publicVersionLabel: '原要求を検証する公開版', includedIds: selected.map(row => row.id), allowedKinds: [...new Set(selected.map(row => row.kind))], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '公開項目' }, byEntityId: Object.fromEntries(selected.map(row => [row.id, { mode: 'replace', replacement: row.name } satisfies NamePolicy])) }, publicTexts });
}
