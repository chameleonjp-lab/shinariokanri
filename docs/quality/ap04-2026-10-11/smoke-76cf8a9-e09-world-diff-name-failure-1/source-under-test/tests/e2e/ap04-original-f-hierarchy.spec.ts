import { expect, test } from '@playwright/test';
import { createEntity, createProject } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, backup, navigate, seed } from './ap04-original-helpers';

// Budget for multi-step UI/cold/file checks; original acceptance limits stay unchanged.
test.setTimeout(180_000);

test('AT-F13 章へ折りたたんだ階層graphに未接続出口・条件エラー・未確認条件を示し、会話から通常再接続した版をcold保存する', async ({ page }, info) => {
  const p = createProject('AT-F13 章・場面・会話の未接続出口');
  const chapter = createEntity(p.projectId, 'chapter', '階層の章');
  const line = createEntity(p.projectId, 'dialogue_line', '会話の台詞');
  const scene = createEntity(p.projectId, 'scene', '階層の場面', { chapterId: chapter.id, dialogueLineIds: [line.id] });
  chapter.data.sceneIds = [scene.id];
  const variable = createEntity(p.projectId, 'variable', '未確認の鍵状態', { key: 'unconfirmed_key', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '作者がまだ決めていない' } });
  // Both operands are valid safe integers. The saved expression is valid, but
  // evaluating their sum must report an error rather than hide it as unknown.
  const outOfRange = createEntity(p.projectId, 'variable', '範囲を超える算出状態', { key: 'out_of_range', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: -2_147_483_647, max: 2_147_483_647 }, derived: { op: 'add', left: { op: 'value', value: { type: 'integer', value: Number.MAX_SAFE_INTEGER } }, right: { op: 'value', value: { type: 'integer', value: 1 } } } });
  const entry = createEntity(p.projectId, 'flow_node', '会話の入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '会話の出口', { nodeType: 'terminal', sceneId: scene.id, terminalReason: '会話が終わる', gate: { op: 'compare', variableId: outOfRange.id, comparator: 'eq', value: { type: 'integer', value: 0 } } });
  const unfinished = createEntity(p.projectId, 'flow_edge', 'まだ結んでいない会話の出口', { fromId: entry.id, toId: { unresolved: { label: '出口未接続', reason: '作者が接続前' } }, condition: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  const graph = createEntity(p.projectId, 'flow_graph', '会話の階層graph', { nodeIds: [entry.id, end.id], entryIds: [], exitIds: [end.id], edgeIds: [unfinished.id] });
  p.entities.push(chapter, scene, line, variable, outOfRange, entry, end, unfinished, graph);
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F13', bytes, { chapterId: chapter.id, sceneId: scene.id, lineId: line.id, entryId: entry.id, unresolvedEdgeId: unfinished.id, graphId: graph.id, unknownVariableId: variable.id, errorVariableId: outOfRange.id, conditionError: '算術結果が安全な整数の範囲を超えています。' });
  await seed(page, bytes); await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '分岐', exact: true }).click();
  await page.getByRole('button', { name: '章・場面・会話へ掘り下げる', exact: true }).click();
  const hierarchy = page.getByRole('region', { name: '章・場面・会話と分岐の階層図', exact: true });
  const chapterFolder = hierarchy.locator('.flow-hierarchy-level').first().locator(':scope > li').filter({ has: page.getByRole('button', { name: `章 · ${chapter.name}`, exact: true }) });
  await expect(chapterFolder).toContainText('未完成 2');
  await expect(chapterFolder).toContainText('未確認条件 1');
  await expect(chapterFolder).toContainText('エラー 1');
  await expect(hierarchy.getByRole('button', { name: `台詞 · ${line.name}`, exact: true })).toHaveCount(0);
  await hierarchy.getByRole('button', { name: `${chapter.name}を掘り下げる`, exact: true }).click();
  await hierarchy.getByRole('button', { name: `${scene.name}を掘り下げる`, exact: true }).click();
  await expect(hierarchy.getByRole('button', { name: `台詞 · ${line.name}`, exact: true })).toBeVisible();
  await expect(hierarchy.getByRole('button', { name: '算術結果が安全な整数の範囲を超えています。', exact: true }).first()).toBeVisible();
  await expect(hierarchy.getByRole('button', { name: '入口が未宣言です。', exact: true }).first()).toBeVisible();
  await hierarchy.getByRole('button', { name: '接続の出口が未完成です。', exact: true }).first().click();
  const editor = page.locator('.detail-panel');
  await expect(editor.locator('h2')).toHaveText(unfinished.name);
  await editor.getByLabel('行き先未定の下書き', { exact: true }).uncheck();
  await editor.getByLabel('行き先ノード', { exact: true }).selectOption(end.id);
  await editor.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(editor.locator('.editor-save-state')).toContainText('端末内保存済み');
  await editor.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  await expect(chapterFolder).toContainText('未完成 1');
  await expect(chapterFolder).toContainText('未確認条件 1');
  await expect(chapterFolder).toContainText('エラー 1');
  await hierarchy.getByRole('button', { name: `${chapter.name}を折りたたむ`, exact: true }).click();
  await expect(hierarchy.getByRole('button', { name: `台詞 · ${line.name}`, exact: true })).toHaveCount(0);
  await expect(chapterFolder).toContainText('未確認条件 1');
  await expect(chapterFolder).toContainText('エラー 1');
  await page.reload();
  const saved = await backup(page);
  expect(saved.project.entities.find(e => e.id === unfinished.id)).toMatchObject({ data: { fromId: entry.id, toId: end.id, condition: unfinished.data.condition } });
  for (const given of [chapter, scene, line, variable, outOfRange, entry, end, graph]) expect(saved.project.entities.find(e => e.id === given.id)?.data).toEqual(given.data);
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click();
  await page.getByRole('button', { name: '章・場面・会話へ掘り下げる', exact: true }).click();
  await expect(chapterFolder).toContainText('未完成 1');
  await expect(chapterFolder).toContainText('未確認条件 1');
  await expect(chapterFolder).toContainText('エラー 1');
  await attachObservation(info, 'AT-F13-observed', { chapterId: chapter.id, edgeId: unfinished.id, resolvedExitId: end.id, graphId: graph.id, revision: saved.project.revision, before: { unfinished: 2, unknown: 1, errors: 1 }, after: { unfinished: 1, unknown: 1, errors: 1 }, unresolvedEntryDeclarationRetained: true, foldedAndColdCountsRetained: true });
});
