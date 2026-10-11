import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { prepareAsset } from '../../src/domain/attachments';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, openEntity, seed } from './ap04-original-helpers';
import { onePixelPng } from './ap04-original-f-assets';

// Budget for multi-step UI/cold/file checks; original acceptance limits stay unchanged.
test.setTimeout(180_000);

async function production(page: Page) {
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '制作', exact: true }).click();
  return page.locator('.production-planning');
}
async function saveEditor(page: Page) {
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel .editor-save-state')).toContainText('端末内保存済み');
}

test('AT-F51 世界日付の変更と六工程の実制作期限を分け、執筆済み未実装を抽出し、素材待ち依存の循環だけを拒否する', async ({ page }, info) => {
  const p = createProject('AT-F51 世界日時と制作期限');
  const event = createEntity(p.projectId, 'event', '執筆済み場面の出来事', { time: { mode: 'instant', at: '5', calendarId: p.calendarId } });
  const scene = createEntity(p.projectId, 'scene', '本文完成・実装未着手の場面', { body: textToRichText('本文の執筆は完了している。'), eventIds: [event.id] });
  const deadline = { date: '2026-12-10', timeZone: 'Asia/Tokyo' };
  const written = createEntity(p.projectId, 'production_task', '場面の執筆済み', { targetIds: [scene.id], stage: 'writing', progress: 'done', deadline });
  const waiting = createEntity(p.projectId, 'production_task', '完成素材の承認待ち', { targetIds: [scene.id], stage: 'review', progress: 'todo', blockingReason: '完成背景素材の承認を待つ', deadline: { date: '2026-12-20', timeZone: 'Asia/Tokyo' } });
  const implementation = createEntity(p.projectId, 'production_task', '執筆済み場面の未実装', { targetIds: [scene.id], stage: 'implementation', progress: 'todo', dependsOn: [written.id, waiting.id], deadline });
  const translation = createEntity(p.projectId, 'production_task', '翻訳だけ進行中', { targetIds: [scene.id], stage: 'translation', progress: 'doing', deadline });
  const recording = createEntity(p.projectId, 'production_task', '収録だけ未着手', { targetIds: [scene.id], stage: 'recording', progress: 'todo', deadline });
  const verification = createEntity(p.projectId, 'production_task', '確認だけ再確認待ち', { targetIds: [scene.id], stage: 'verification', progress: 'needs_review', deadline });
  const publication = createEntity(p.projectId, 'production_task', '公開だけ未着手', { targetIds: [scene.id], stage: 'publication', progress: 'todo', deadline });
  p.entities.push(event, scene, written, waiting, implementation, translation, recording, verification, publication);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F51', bytes, { eventId: event.id, sceneId: scene.id, worldTick: '5', deadline, writtenTaskId: written.id, implementationTaskId: implementation.id, waitingTaskId: waiting.id, dependencyIds: implementation.data.dependsOn, stages: [written, implementation, translation, recording, verification, publication].map(task => ({ id: task.id, stage: task.data.stage, progress: task.data.progress })) });
  await seed(page, bytes); await openEntity(page, 'event', event.name);
  await page.locator('.detail-panel').getByLabel('世界内tick', { exact: true }).fill('15'); await saveEditor(page);
  const panel = await production(page);
  await expect(panel.locator('article').filter({ hasText: written.name })).toContainText('writing · needs_review');
  const pending = panel.locator('article').filter({ hasText: implementation.name });
  await expect(pending).toContainText('implementation · todo');
  await expect(pending).toContainText('先行条件または詰まりあり');
  await expect(pending.getByRole('alert')).toHaveText('先行作業の期限が後、または時域が異なります。現実の日付を再確認してください。');
  await expect(panel.locator('article').filter({ hasText: waiting.name })).toContainText(waiting.data.blockingReason!);
  for (const task of [written, implementation, translation, recording, verification, publication]) {
    const row = panel.locator('article').filter({ hasText: task.name });
    await expect(row).toContainText(`${task.data.stage} · ${task.id === written.id ? 'needs_review' : task.data.progress}`);
    await expect(row).toContainText('制作期限 2026-12-10 / Asia/Tokyo');
  }
  await navigate(page, /^検索/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  await page.getByLabel('制作進捗で絞り込む', { exact: true }).selectOption('todo');
  await expect(page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: scene.name, exact: true }) })).toBeVisible();
  await expect(page.locator('.entity-card')).toHaveCount(1);
  const saved = await backup(page);
  expect(saved.project.entities.find(entity => entity.id === event.id)).toMatchObject({ data: { time: { mode: 'instant', at: '15', calendarId: p.calendarId } } });
  for (const task of [written, waiting, implementation, translation, recording, verification, publication]) expect(saved.project.entities.find(entity => entity.id === task.id)?.data).toEqual({ ...task.data, ...(task.id === written.id ? { progress: 'needs_review' } : {}) });
  expect(saved.project.entities.find(entity => entity.id === scene.id)?.data).toEqual(scene.data);
  await openEntity(page, 'production_task', written.name);
  const dependencies = page.locator('.detail-panel [data-field="dependsOn"]');
  const before = await authorFingerprint(page);
  await dependencies.getByLabel('追加する対象', { exact: true }).selectOption(implementation.id);
  await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
  await expect(page.locator('.detail-panel').getByRole('alert').filter({ hasText: '制作依存に循環があります。' }).first()).toBeVisible();
  await expect(dependencies).toContainText(implementation.name);
  expect(await authorFingerprint(page)).toBe(before);
  await dependencies.getByRole('button', { name: `${implementation.name}を外す`, exact: true }).click();
  await saveEditor(page);
  await production(page);
  await page.getByLabel(`${written.name}の進捗`, { exact: true }).selectOption('done');
  await expect(page.getByLabel(`${written.name}の進捗`, { exact: true })).toHaveValue('done');
  await expect(panel.locator('article').filter({ hasText: written.name })).toContainText('writing · done');
  await page.reload();
  const cold = await backup(page);
  for (const task of [written, waiting, implementation, translation, recording, verification, publication]) expect(cold.project.entities.find(entity => entity.id === task.id)?.data).toEqual(task.data);
  await production(page);
  await expect(pending).toContainText('implementation · todo');
  await expect(pending.getByRole('alert')).toContainText('先行作業の期限が後');
  await attachObservation(info, 'AT-F51-observed', { eventId: event.id, worldTick: '15', sceneId: scene.id, initialWriting: 'done', writingAfterDependentWorldDateChange: 'needs_review', writingAfterAuthorReconfirmation: 'done', sixStagesStoredSeparately: true, completedBodyPreserved: true, deadline, waitingTaskId: waiting.id, deadlineConflictShown: true, cycleRejectedAtomically: true, dependencyIds: implementation.data.dependsOn, revision: cold.project.revision });
});

test('AT-F52 二経路の共通場面を固有場面/台詞/実素材では一回、提示量では二回/一回と数え、速度と仮定付きで再見積する', async ({ page }, info) => {
  const p = createProject('AT-F52 固有制作量と経路提示量');
  const prepared = await prepareAsset(onePixelPng(), '共通背景.png');
  const { bytes: assetBytes, preview: _preview, ...metadata } = prepared;
  const asset = createEntity(p.projectId, 'attachment', '両経路で使う同じ素材', { ...metadata, stage: 'final' });
  const line = createEntity(p.projectId, 'dialogue_line', '両経路で使う同じ台詞', { text: textToRichText('同じ門を再び通る。') });
  const cue = createEntity(p.projectId, 'cue', '両経路の共通背景', { anchor: { entityId: line.id }, attachmentId: asset.id, cueType: 'background', mediaTime: 0 });
  line.data.cueIds = [cue.id];
  const scene = createEntity(p.projectId, 'scene', '両経路で使う一つの場面', { body: textToRichText('門の共通場面。'), dialogueLineIds: [line.id] });
  const a = createEntity(p.projectId, 'flow_node', '経路Aの最初の提示', { nodeType: 'entry', sceneId: scene.id });
  const again = createEntity(p.projectId, 'flow_node', '経路Aの二回目の提示', { nodeType: 'choice', sceneId: scene.id });
  const b = createEntity(p.projectId, 'flow_node', '経路Bの一回だけの提示', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '共通の終端', { nodeType: 'terminal', terminalReason: '体験を終える' });
  const ea = createEntity(p.projectId, 'flow_edge', 'Aで同じ場面を再提示', { fromId: a.id, toId: again.id, label: 'Aで同じ場面を再提示' });
  const eaEnd = createEntity(p.projectId, 'flow_edge', 'Aの体験を終える', { fromId: again.id, toId: end.id, label: 'Aの体験を終える' });
  const eb = createEntity(p.projectId, 'flow_edge', 'Bの体験を終える', { fromId: b.id, toId: end.id, label: 'Bの体験を終える' });
  const graph = createEntity(p.projectId, 'flow_graph', '共通場面を使う二経路', { nodeIds: [a.id, again.id, b.id, end.id], edgeIds: [ea.id, eaEnd.id, eb.id], entryIds: [a.id, b.id], exitIds: [end.id] });
  const task = createEntity(p.projectId, 'production_task', '共通場面・台詞・素材の制作', { targetIds: [scene.id], stage: 'implementation', progress: 'todo' });
  p.entities.push(asset, line, cue, scene, a, again, b, end, ea, eaEnd, eb, graph, task); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p, { loadAsset: hash => hash === prepared.contentHash ? assetBytes : undefined });
  await attachGiven(info, 'AT-F52', bytes, { sceneId: scene.id, lineId: line.id, attachmentId: asset.id, contentHash: prepared.contentHash, entryIds: [a.id, b.id], uniqueCounts: [1, 1, 1], perRouteOccurrences: [2, 1], speed: null, taskId: task.id });
  await seed(page, bytes);
  for (const [entry, edges] of [[a, [ea, eaEnd]], [b, [eb]]] as const) {
    await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
    await page.getByLabel('試読する作品版', { exact: true }).selectOption('');
    await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
    await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click();
    for (const edge of edges) await page.getByRole('button', { name: edge.name, exact: true }).click();
    await page.getByRole('button', { name: '経路を記録', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
  }
  const panel = await production(page);
  await expect(panel).toContainText('固有場面 1 · 固有台詞 1 · 固有素材 1');
  const routes = panel.getByLabel('制作量を比較する経路', { exact: true });
  const routeIds = await routes.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  expect(routeIds).toHaveLength(2);
  const beforeEstimate = await backup(page);
  for (const id of routeIds) {
    const trace = beforeEstimate.project.entities.find(entity => entity.id === id);
    if (trace?.kind !== 'trace') throw new Error('記録した経路がありません');
    const count = trace.data.steps.length === 2 ? 2 : 1;
    await production(page); await routes.selectOption(id);
    await expect(panel).toContainText(`選択経路の提示量 ${count}`);
    await expect(panel).toContainText(`対象版 ${trace.data.contentVersionId}`);
    await expect(panel).toContainText('経路参照不明 0');
  }
  await panel.getByLabel('見積する制作タスク', { exact: true }).selectOption(task.id);
  await panel.getByLabel('見積の仮定', { exact: true }).fill('同じ安定IDの場面・台詞・背景素材を一回ずつ制作する。');
  const before = await authorFingerprint(page);
  await panel.getByRole('button', { name: '制作見積を確認', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('速度');
  await expect(panel.getByRole('button', { name: '確認した制作見積を保存', exact: true })).toHaveCount(0);
  expect(await authorFingerprint(page)).toBe(before);
  await panel.getByLabel('一作業日の固有件数', { exact: true }).fill('2');
  await panel.getByRole('button', { name: '制作見積を確認', exact: true }).click();
  await expect(panel).toContainText('1.5作業日 · 不明 0件');
  expect(await authorFingerprint(page)).toBe(before);
  await panel.getByRole('button', { name: '確認した制作見積を保存', exact: true }).click();
  await expect(panel.locator('article').filter({ hasText: task.name })).toContainText('見積 1.5 作業日 · 速度 2 · 不明 0');
  await page.reload(); const saved = await backup(page);
  expect(saved.project.entities.filter(entity => entity.kind === 'scene')).toHaveLength(1);
  expect(saved.project.entities.filter(entity => entity.kind === 'dialogue_line')).toHaveLength(1);
  expect(saved.project.entities.filter(entity => entity.kind === 'attachment')).toHaveLength(1);
  expect(saved.project.entities.find(entity => entity.id === task.id)).toMatchObject({ data: { estimate: { value: 1.5, unit: '作業日', speed: 2, unknownCount: 0, assumptions: ['同じ安定IDの場面・台詞・背景素材を一回ずつ制作する。'], scope: { projectId: p.projectId } } } });
  expect(saved.assets[0].bytes).toEqual(assetBytes);
  await attachObservation(info, 'AT-F52-observed', { sceneId: scene.id, lineId: line.id, attachmentId: asset.id, routeIds, uniqueCounts: [1, 1, 1], perRouteOccurrences: [2, 1], speedWithoutEstimate: null, estimate: { value: 1.5, unit: '作業日', speed: 2, unknownCount: 0 }, revision: saved.project.revision });
});
