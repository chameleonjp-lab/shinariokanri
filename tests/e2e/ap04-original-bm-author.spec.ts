import { expect, test } from '@playwright/test';
import { createProject, newId, textToRichText } from '../../src/domain/model';
import { attachObservation, backup, clause, editData, entity, findEntity, given, navigate, openEntity, reader, sceneStructure } from './ap04-original-bm-helpers';

test('AT-B08 参加者未設定から二人の異なる役割とメモを登録し、両人物の参照元へ同じ出来事を出す', async ({ page }, info) => {
  const p = createProject('AT-B08 参加と知識'), a = entity(p, 'character', '当事者A'), b = entity(p, 'character', '目撃者B'), event = entity(p, 'event', '未設定から参加を記録', { participants: [] });
  await clause('AT-B08', 'given', async () => { expect(event.data.participants).toEqual([]); await given(page, info, 'AT-B08', p); await openEntity(page, 'event', event.name); await page.getByRole('tab', { name: '詳細', exact: true }).click(); });
  await clause('AT-B08', 'when', async () => {
    await page.getByRole('button', { name: '参加者を追加', exact: true }).click(); await page.getByLabel('参加者1', { exact: true }).selectOption(a.id); await page.getByLabel('参加者1の役割', { exact: true }).selectOption('actor');
    await page.getByRole('button', { name: '参加者を追加', exact: true }).click(); await page.getByLabel('参加者2', { exact: true }).selectOption(b.id); await page.getByLabel('参加者2の役割', { exact: true }).selectOption('witness');
    await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click(); await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
    const saved = await backup(page); await openEntity(page, 'event', event.name); await editData(page, { ...findEntity(saved.project, event.id, 'event').data, authorNotes: textToRichText('目撃だけで真相を知ったとはしない。') });
  });
  await clause('AT-B08', 'then', async () => {
    for (const person of [a, b]) {
      await openEntity(page, 'character', person.name); await page.locator('.references-section').getByRole('button', { name: new RegExp(event.name) }).click(); await expect(page.locator('#entity-name')).toHaveValue(event.name); await page.getByRole('tab', { name: '詳細', exact: true }).click();
      await expect(page.getByLabel('参加者1', { exact: true })).toHaveValue(a.id); await expect(page.getByLabel('参加者2', { exact: true })).toHaveValue(b.id);
    }
  });
  await clause('AT-B08', 'negative_or_edge', async () => {
    await expect(page.getByLabel('参加者1の役割', { exact: true })).toHaveValue('actor'); await expect(page.getByLabel('参加者2の役割', { exact: true })).toHaveValue('witness');
    await expect(page.getByLabel('参加者1の役割', { exact: true }).locator('option')).toContainText(['当事者', '目撃者', '言及される', '情報を得る', '独自の役割']);
    await page.reload(); const saved = await backup(page), registered = findEntity(saved.project, event.id, 'event'); expect(registered.data.participants).toEqual([{ characterId: a.id, role: 'actor' }, { characterId: b.id, role: 'witness' }]); expect(registered.data.authorNotes?.[0].text).toBe('目撃だけで真相を知ったとはしない。'); expect(saved.project.entities.filter(e => e.kind === 'assertion')).toHaveLength(0); await attachObservation(info, 'AT-B08-observed', { eventId: event.id, participants: registered.data.participants, inferredKnowledgeIds: [] });
  });
});

test('AT-B11 場所・物品型・個体を出来事へ関連付けて相互移動し、同じ個体の再取得は二重所有にしない', async ({ page }, info) => {
  const p = createProject('AT-B11 場所と個体'), person = entity(p, 'character', '鍵の所持者'), place = entity(p, 'place', '鍵を受け取る駅'), type = entity(p, 'item', '鍵という種類', { itemMode: 'type' }), individual = entity(p, 'item', '刻印7の鍵個体', { itemMode: 'instance', typeId: type.id });
  const event = entity(p, 'event', '駅で個体を受け取る');
  const start = entity(p, 'flow_node', '個体取得の入口', { nodeType: 'entry' }), middle = entity(p, 'flow_node', '個体取得済み', { nodeType: 'choice' }), end = entity(p, 'flow_node', '再取得の終端', { nodeType: 'terminal', terminalReason: '二重取得を許さない' }), grant = entity(p, 'effect', '同じ鍵個体を取得', { operation: 'grant', targetId: individual.id, value: { type: 'integer', value: 1 } });
  entity(p, 'flow_edge', '個体を一度取得', { fromId: start.id, toId: middle.id, label: '個体を一度取得', effectIds: [grant.id] }); entity(p, 'flow_edge', '同じ個体を再取得', { fromId: middle.id, toId: end.id, label: '同じ個体を再取得', effectIds: [grant.id] });
  await clause('AT-B11', 'given', async () => { await given(page, info, 'AT-B11', p); await openEntity(page, 'event', event.name); });
  const linked = { id: newId(), kind: 'paragraph' as const, text: '人物と場所と個体', links: [{ start: 0, end: 2, target: { entityId: person.id } }, { start: 3, end: 5, target: { entityId: place.id } }, { start: 6, end: 8, target: { entityId: individual.id } }] };
  await clause('AT-B11', 'when', async () => { await editData(page, { ...event.data, locationId: place.id, itemIds: [individual.id], participants: [{ characterId: person.id, role: 'actor' }], summary: [linked] }); });
  await clause('AT-B11', 'then', async () => {
    for (const record of [place, individual, person]) {
      await openEntity(page, record.kind, record.name); await page.locator('.references-section').getByRole('button', { name: new RegExp(event.name) }).click(); await expect(page.locator('#entity-name')).toHaveValue(event.name);
      await page.getByRole('tab', { name: '確認表示', exact: true }).click(); const label = record === person ? '人物' : record === place ? '場所' : '個体'; await page.locator('.detail-panel').getByRole('button', { name: label, exact: true }).click(); await expect(page.locator('#entity-name')).toHaveValue(record.name);
    }
  });
  await clause('AT-B11', 'negative_or_edge', async () => {
    await openEntity(page, 'item', type.name); await page.getByRole('tab', { name: '詳細', exact: true }).click(); await expect(page.getByLabel('物品の扱い', { exact: true })).toHaveValue('type'); await openEntity(page, 'item', individual.name); await page.getByRole('tab', { name: '詳細', exact: true }).click(); await expect(page.getByLabel('物品の扱い', { exact: true })).toHaveValue('instance');
    await reader(page); await page.getByLabel('試読の開始点', { exact: true }).selectOption(start.id); await page.getByRole('button', { name: '試読を始める', exact: true }).click(); await page.getByRole('button', { name: '個体を一度取得', exact: true }).click(); await expect(page.locator('.reader-state-counts')).toContainText('1個'); await page.getByRole('button', { name: '同じ個体を再取得', exact: true }).click(); await expect(page.locator('.reader-page')).toContainText('二重取得'); await expect(page.locator('.reader-state-counts')).toContainText('1個');
    const saved = await backup(page); expect(saved.project.entities.filter(e => e.kind === 'item').map(e => e.id)).toEqual([type.id, individual.id]); expect(findEntity(saved.project, event.id, 'event').data.itemIds).toEqual([individual.id]); expect(saved.project.entities.filter(e => e.kind === 'assertion')).toEqual([]); await attachObservation(info, 'AT-B11-observed', { typeId: type.id, individualId: individual.id, eventId: event.id, duplicateAcquisitionRejected: true });
  });
});

test('AT-B13 古い出来事の回想を章内で並替え、読者の提示順だけを変え世界日時は保持する', async ({ page }, info) => {
  const p = createProject('AT-B13 回想の提示順'), oldEvent = entity(p, 'event', '十年前の出来事', { time: { mode: 'instant', at: '-1000', calendarId: p.calendarId } }), currentEvent = entity(p, 'event', '現在の出来事', { time: { mode: 'instant', at: '0', calendarId: p.calendarId } }), chapter = entity(p, 'chapter', '回想を含む章'), first = entity(p, 'scene', '現在の場面', { chapterId: chapter.id, eventIds: [currentEvent.id], body: textToRichText('現在を先に読む。') }), flashback = entity(p, 'scene', '後から示す回想', { chapterId: chapter.id, eventIds: [oldEvent.id], body: textToRichText('古い出来事を後から読む。') }); chapter.data.sceneIds = [first.id, flashback.id];
  await clause('AT-B13', 'given', async () => { await given(page, info, 'AT-B13', p); await sceneStructure(page); await page.getByLabel('物語の並べ方', { exact: true }).selectOption('chapter'); await expect(page.locator(`.story-lane[data-lane-id="${chapter.id}"] [data-scene-id]`).first()).toHaveAttribute('data-scene-id', first.id); });
  await clause('AT-B13', 'when', async () => { await page.locator(`[data-scene-id="${flashback.id}"]`).getByRole('button', { name: '前へ', exact: true }).click(); });
  await clause('AT-B13', 'then', async () => { await expect(page.locator(`.story-lane[data-lane-id="${chapter.id}"] [data-scene-id]`).first()).toHaveAttribute('data-scene-id', flashback.id); await page.getByRole('tab', { name: '章の試読', exact: true }).click(); await page.getByRole('button', { name: '記録付き読書を始める', exact: true }).click(); await page.getByRole('button', { name: '次の場面を提示', exact: true }).click(); await expect(page.locator('.chapter-reading-presented')).toContainText('古い出来事を後から読む。'); });
  await clause('AT-B13', 'negative_or_edge', async () => { await page.reload(); const saved = await backup(page); expect(findEntity(saved.project, chapter.id, 'chapter').data.sceneIds).toEqual([flashback.id, first.id]); expect(findEntity(saved.project, oldEvent.id, 'event').data.time).toEqual(oldEvent.data.time); expect(findEntity(saved.project, currentEvent.id, 'event').data.time).toEqual(currentEvent.data.time); for (const s of [first, flashback]) expect(findEntity(saved.project, s.id, 'scene').data.eventIds).toEqual(s.data.eventIds); await attachObservation(info, 'AT-B13-observed', { chapterId: chapter.id, sceneOrder: [flashback.id, first.id], retainedWorldTimes: [oldEvent.data.time, currentEvent.data.time] }); });
});

test('AT-B20 目的が変わる人物へ根拠場面を登録し、変化前後と根拠へ移動し未入力役割の場面も保存する', async ({ page }, info) => {
  const p = createProject('AT-B20 目的と根拠'), person = entity(p, 'character', '目的が変わる人物'), scene = entity(p, 'scene', '目的変更の根拠場面', { povId: person.id, body: textToRichText('救出から復讐へ目的が変わる。'), goals: textToRichText('友を救出する'), results: textToRichText('友の死を知り復讐を選ぶ'), newInformation: textToRichText('友は戻らない') }), goal = entity(p, 'goal', '変化後の人物目的', { ownerId: person.id, description: textToRichText('友の復讐を果たす'), evidenceSceneIds: [] }); person.data.goals = [goal.id];
  const unspecified = entity(p, 'scene', '役割を未入力の場面', { goals: null, conflicts: null, results: null, newInformation: null });
  await clause('AT-B20', 'given', async () => { await given(page, info, 'AT-B20', p); await openEntity(page, 'goal', goal.name); });
  await clause('AT-B20', 'when', async () => { await editData(page, { ...goal.data, evidenceSceneIds: [scene.id] }); });
  await clause('AT-B20', 'then', async () => {
    await sceneStructure(page); await page.getByLabel('物語の並べ方', { exact: true }).selectOption('character'); const lane = page.locator(`.story-lane[data-lane-id="${person.id}"]`);
    await expect(lane.getByRole('region', { name: `${scene.name}の人物変化` })).toContainText('友を救出する'); await expect(lane.getByRole('region', { name: `${scene.name}の人物変化` })).toContainText('友の死を知り復讐を選ぶ'); await lane.getByRole('button', { name: `${goal.name}の根拠場面 ${scene.name}を開く`, exact: true }).click(); await expect(page.locator('#entity-name')).toHaveValue(scene.name);
  });
  await clause('AT-B20', 'negative_or_edge', async () => { await openEntity(page, 'scene', unspecified.name); await editData(page, { ...unspecified.data, body: textToRichText('目的や役割を決める前でも書ける。') }); await page.reload(); const saved = await backup(page); expect(findEntity(saved.project, goal.id, 'goal').data.evidenceSceneIds).toEqual([scene.id]); expect(findEntity(saved.project, unspecified.id, 'scene').data.goals).toBeNull(); expect(findEntity(saved.project, unspecified.id, 'scene').data.body[0].text).toBe('目的や役割を決める前でも書ける。'); });
});

test('AT-B22 会話・クエスト・設定を前提と本文リンクへ関連付け、根拠を双方から追い完了状態を分ける', async ({ page }, info) => {
  const p = createProject('AT-B22 会話の前提'), state = entity(p, 'variable', '任務進行', { key: 'quest_phase', valueType: 'enum', initial: { type: 'enum', value: 'active' }, allowed: { values: ['active', 'complete'] }, scope: 'run' }), quest = entity(p, 'quest', '台詞の任務', { key: 'talk_quest', stateVariableId: state.id, description: textToRichText('伝承を聞く任務') }), lore = entity(p, 'lore', '台詞の伝承', { body: textToRichText('任務の根拠となる設定。') }), line = entity(p, 'dialogue_line', '根拠を話す台詞', { text: textToRichText('任務と伝承を確認する。') }), scene = entity(p, 'scene', '前提のある会話場面', { dialogueLineIds: [line.id], body: textToRichText('任務の進行が前提。') }), node = entity(p, 'flow_node', '場面の前提', { nodeType: 'entry', sceneId: scene.id }), task = entity(p, 'production_task', '未完成の実装作業', { targetIds: [scene.id, line.id], stage: 'implementation', progress: 'todo' });
  await clause('AT-B22', 'given', async () => { await given(page, info, 'AT-B22', p); });
  await clause('AT-B22', 'when', async () => {
    await openEntity(page, 'flow_node', node.name); await editData(page, { ...node.data, gate: { op: 'compare', variableId: state.id, comparator: 'eq', value: { type: 'enum', value: 'active' } } });
    await openEntity(page, 'dialogue_line', line.name); await editData(page, { ...line.data, text: [{ ...line.data.text[0], links: [{ start: 0, end: 2, target: { entityId: quest.id } }, { start: 3, end: 5, target: { entityId: lore.id } }] }] });
  });
  await clause('AT-B22', 'then', async () => {
    for (const [target, label] of [[quest, '任務'], [lore, '伝承']] as const) {
      await openEntity(page, 'dialogue_line', line.name); await page.getByRole('tab', { name: '確認表示', exact: true }).click(); await page.locator('.detail-panel').getByRole('button', { name: label, exact: true }).click(); await expect(page.locator('#entity-name')).toHaveValue(target.name); await page.locator('.references-section').getByRole('button', { name: new RegExp(line.name) }).click(); await expect(page.locator('#entity-name')).toHaveValue(line.name);
    }
    await openEntity(page, 'variable', state.name); await page.locator('.references-section').getByRole('button', { name: new RegExp(node.name) }).click(); await expect(page.locator('#entity-name')).toHaveValue(node.name);
  });
  await clause('AT-B22', 'negative_or_edge', async () => { await openEntity(page, 'variable', state.name); await editData(page, { ...state.data, initial: { type: 'enum', value: 'complete' } }); const saved = await backup(page); expect(findEntity(saved.project, state.id, 'variable').data.initial).toEqual({ type: 'enum', value: 'complete' }); expect(findEntity(saved.project, task.id, 'production_task').data.progress).toBe('todo'); expect(findEntity(saved.project, line.id, 'dialogue_line').status).toBe('confirmed'); expect(findEntity(saved.project, scene.id, 'scene').data.body).toEqual(scene.data.body); expect(findEntity(saved.project, task.id, 'production_task').data.stage).toBe('implementation'); await attachObservation(info, 'AT-B22-observed', { questId: quest.id, questState: 'complete', independentImplementationProgress: 'todo', preservedTextIds: [scene.id, line.id] }); });
});
