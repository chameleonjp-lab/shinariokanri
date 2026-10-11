import { expect, test } from '@playwright/test';
import { createProject, emptyValidity, textToRichText } from '../../src/domain/model';
import type { AnalysisResult } from '../../src/domain/runtime';
import type { Entity } from '../../src/domain/types';
import { add, analyze, attachObservation, backup, clause, editData, entity, findEntity, given, narrativeFixture, navigate, openEntity, reader, record, rejectData, start } from './ap04-original-e-f37-50-helpers';

test('AT-F43 二つの手掛かり・二つの回収を持つ独立Qを、場面の分割・移動・削除後にも残して再リンクする', async ({ page }, info) => {
  const f = narrativeFixture('AT-F43 独立した伏線の安定ID'), { p, question, clueScene, clue, payoff, clueNode, graph } = f;
  clueScene.data.body = textToRichText('第一段落の手掛かり。\n第二段落の別の手掛かり。');
  const another = entity(p, 'scene', '第二の手掛かりの場面', { body: textToRichText('別の位置に残す根拠。') }), anotherPayoffScene = entity(p, 'scene', '第二の回収の場面', { body: textToRichText('もう一つの回収。') });
  const clue2 = entity(p, 'disclosure', '第二の手掛かり', { foreshadowId: question.id, anchor: { entityId: another.id }, role: 'clue', stage: 'reinforce' }), payoff2 = entity(p, 'disclosure', '第二の回収', { foreshadowId: question.id, anchor: { entityId: anotherPayoffScene.id }, role: 'payoff', stage: 'reveal' });
  question.data.clueIds = [clue.id, clue2.id]; question.data.payoffIds = [payoff.id, payoff2.id];
  const chapter = entity(p, 'chapter', '手掛かり場面を移動する章', { sceneIds: [clueScene.id, another.id, anotherPayoffScene.id] });
  let split!: Entity<'scene'>;
  await clause('AT-F43', 'given', async () => { await given(page, info, 'AT-F43', p); await openEntity(page, 'foreshadow', question.name); });
  await clause('AT-F43', 'when', async () => {
    await openEntity(page, 'scene', clueScene.name); await editData(page, { ...clueScene.data, body: [clueScene.data.body[0]] });
    split = await add(page, 'scene', '通常画面で分割した後半場面', { body: [clueScene.data.body[1]] });
    await openEntity(page, 'chapter', chapter.name); await editData(page, { ...chapter.data, sceneIds: [another.id, split.id, anotherPayoffScene.id] });
    await openEntity(page, 'disclosure', clue.name); await editData(page, { ...clue.data, anchor: { entityId: split.id, blockId: split.data.body[0].id } });
    await openEntity(page, 'flow_node', clueNode.name); await editData(page, { ...clueNode.data, sceneId: split.id });
    await openEntity(page, 'scene', clueScene.name); await page.locator('.editor-footer').getByRole('button', { name: 'アーカイブ', exact: true }).click(); await page.getByRole('dialog', { name: 'アーカイブの確認', exact: true }).getByRole('button', { name: 'アーカイブする', exact: true }).click();
    await openEntity(page, 'foreshadow', question.name); await expect(page.locator('#entity-name')).toHaveValue(question.name);
    await openEntity(page, 'disclosure', clue2.name); await editData(page, { ...clue2.data, anchor: { entityId: another.id, blockId: another.data.body[0].id } });
  });
  await clause('AT-F43', 'then', async () => {
    const saved = (await backup(page)).project;
    expect(findEntity(saved, question.id, 'foreshadow').data).toMatchObject({ clueIds: [clue.id, clue2.id], payoffIds: [payoff.id, payoff2.id] });
    expect(findEntity(saved, clueScene.id, 'scene').deletedAt).toBeTruthy(); expect(findEntity(saved, clue.id, 'disclosure').data.anchor).toEqual({ entityId: split.id, blockId: split.data.body[0].id });
    expect(findEntity(saved, chapter.id, 'chapter').data.sceneIds).toEqual([another.id, split.id, anotherPayoffScene.id]); expect(findEntity(saved, graph.id, 'flow_graph').data).toEqual(graph.data);
  });
  await clause('AT-F43', 'negative_or_edge', async () => {
    const alternative = await add(page, 'disclosure', '第二手掛かりの別IDの代替説明', { foreshadowId: question.id, anchor: { entityId: anotherPayoffScene.id }, stage: 'alternative', role: 'clue' });
    await openEntity(page, 'foreshadow', question.name); await editData(page, { ...question.data, alternativeInfo: { [clue2.id]: [alternative.id] } });
    await page.reload(); const saved = (await backup(page)).project, q = findEntity(saved, question.id, 'foreshadow');
    expect(q.deletedAt).toBeFalsy(); expect(q.data.alternativeInfo).toEqual({ [clue2.id]: [alternative.id] }); expect(new Set([clue.id, clue2.id, payoff.id, payoff2.id, alternative.id]).size).toBe(5);
    await attachObservation(info, 'AT-F43-observed', { stableQuestionId: question.id, retainedClueIds: q.data.clueIds, retainedPayoffIds: q.data.payoffIds, archivedSceneId: clueScene.id, splitSceneId: split.id, alternatives: q.data.alternativeInfo });
  });
});

test('AT-F44 古い世界日時の回想を章順の最後・先頭・最後へ移し、提示順と人物知識を二経路で記録する', async ({ page }, info) => {
  const p = createProject('AT-F44 世界時間と開示の提示位置'), person = entity(p, 'character', '回想で真相を知る人物');
  const past = entity(p, 'event', '世界tick-10の回想', { time: { mode: 'instant', at: '-10', calendarId: p.calendarId } }), now = entity(p, 'event', '世界tick0の現在', { time: { mode: 'instant', at: '0', calendarId: p.calendarId } });
  const flashback = entity(p, 'scene', '最後に提示する古い回想', { body: textToRichText('昔の出来事で人物は真相を知る。'), eventIds: [past.id] }), present = entity(p, 'scene', '先に提示する現在場面', { body: textToRichText('現在の人物が真相を断言する。'), eventIds: [now.id] });
  const truth = entity(p, 'assertion', '作者の真実T', { subjectId: person.id, predicate: 'truth', value: { type: 'boolean', value: true }, truthKind: 'author_truth' }), acquired = entity(p, 'assertion', '人物が取得するT', { subjectId: person.id, predicate: 'truth', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: person.id, sourceIds: [truth.id], evidenceLocation: { entityId: flashback.id, blockId: flashback.data.body[0].id, start: 0, end: 1 } });
  const line = entity(p, 'dialogue_line', '現在でTを断言する台詞', { speakerId: person.id, text: textToRichText('真相を知っている。'), claimAssertionIds: [acquired.id] }); present.data.dialogueLineIds = [line.id];
  const q = entity(p, 'foreshadow', '回想の開示を必要とする問い', { question: textToRichText('人物は真相をいつ知ったか。'), resolutionPolicy: 'this_work' }), effect = entity(p, 'effect', '回想で人物がTを取得', { operation: 'assert', targetId: acquired.id });
  const clue = entity(p, 'disclosure', '回想での人物と読み手への開示', { foreshadowId: q.id, anchor: { entityId: flashback.id, blockId: flashback.data.body[0].id, start: 0, end: 1 }, stage: 'hint', role: 'clue', knowledgeEffects: [effect.id] }), payoff = entity(p, 'disclosure', '現在での真相提示', { foreshadowId: q.id, anchor: { entityId: present.id }, stage: 'reveal', role: 'payoff' }); q.data.clueIds = [clue.id]; q.data.requiredInfo = [clue.id]; q.data.payoffIds = [payoff.id];
  const chapter = entity(p, 'chapter', '回想を最後に置く章', { sceneIds: [present.id, flashback.id] });
  async function chapterReading() { await navigate(page, /^構成/); await page.getByRole('tab', { name: '章の試読', exact: true }).click(); await page.getByLabel('読む作品の版', { exact: true }).selectOption(''); await page.getByRole('button', { name: /^(記録付き読書を始める|読み直す)$/ }).click(); }
  async function next() { await page.getByRole('button', { name: '次の場面を提示', exact: true }).click(); }
  await clause('AT-F44', 'given', async () => { await given(page, info, 'AT-F44', p); await chapterReading(); });
  await clause('AT-F44', 'when', async () => {
    await next(); await expect(page.getByRole('region', { name: '章の伏線と回収', exact: true })).toContainText('必須情報'); await expect(page.getByRole('region', { name: '発言と提示時点の認識', exact: true }).locator('summary').filter({ hasText: line.name })).toContainText('未取得'); await next(); await page.getByRole('button', { name: '開始状態と経路を保存', exact: true }).click();
    await openEntity(page, 'chapter', chapter.name); await editData(page, { ...chapter.data, sceneIds: [flashback.id, present.id] }); await chapterReading(); await next(); await next();
  });
  await clause('AT-F44', 'then', async () => {
    await expect(page.getByRole('region', { name: '章の伏線と回収', exact: true })).not.toContainText('必須情報'); await expect(page.getByRole('region', { name: '発言と提示時点の認識', exact: true }).locator('summary').filter({ hasText: line.name })).toContainText('取得済み'); await page.getByRole('button', { name: '開始状態と経路を保存', exact: true }).click();
    const saved = (await backup(page)).project, traces = saved.entities.filter((row): row is Entity<'trace'> => row.kind === 'trace' && row.data.mode === 'chapters'); expect(traces).toHaveLength(2);
    expect(traces.map(row => row.data.readingPath?.sceneIds)).toEqual([[present.id, flashback.id], [flashback.id, present.id]]); expect(findEntity(saved, past.id, 'event').data.time).toEqual(past.data.time); expect(findEntity(saved, now.id, 'event').data.time).toEqual(now.data.time);
    await attachObservation(info, 'AT-F44-two-presentation-paths', traces.map(row => ({ traceId: row.id, versionId: row.data.contentVersionId, readingPath: row.data.readingPath })));
  });
  await clause('AT-F44', 'negative_or_edge', async () => {
    await openEntity(page, 'chapter', chapter.name); await editData(page, chapter.data); await navigate(page, /^構成/); await page.getByRole('tab', { name: '章の試読', exact: true }).click();
    const reconfirm = page.getByRole('region', { name: '開始版の移行と経路の再確認', exact: true }); await reconfirm.locator('summary').filter({ hasText: '保存した経路を改訂稿で再確認する' }).click(); await expect(reconfirm).toContainText('再確認待ち');
    const saved = (await backup(page)).project; expect(findEntity(saved, past.id, 'event').data.time).toEqual(past.data.time); expect(findEntity(saved, chapter.id, 'chapter').data.sceneIds).toEqual([present.id, flashback.id]); await attachObservation(info, 'AT-F44-world-time-not-presentation-time', { worldTick: '-10', originalOrder: [present.id, flashback.id], earlierDisclosureOrder: [flashback.id, present.id], restoredOrderNeedsReconfirmation: true });
  });
});

test('AT-F45 必須C・代替D・両方を飛ばす経路・任意手掛かりを検査し、証人経路と未知を理解認定から分ける', async ({ page }, info) => {
  const f = narrativeFixture('AT-F45 必須と代替の提示検査'), { p, question, clue, entry, end, reveal, payoff, graph } = f;
  const alternativeScene = entity(p, 'scene', '代替説明Dの本文', { body: textToRichText('Cに代わって真相を説明するD。') }), alternativeNode = entity(p, 'flow_node', '代替説明の提示点', { nodeType: 'scene', sceneId: alternativeScene.id }), d = entity(p, 'disclosure', '代替説明D', { foreshadowId: question.id, anchor: { entityId: alternativeScene.id }, role: 'clue', stage: 'alternative' }), optional = entity(p, 'disclosure', '任意の補足情報', { foreshadowId: question.id, anchor: { entityId: f.opening.id }, role: 'clue', stage: 'hint' });
  question.data.clueIds = [clue.id, d.id, optional.id]; question.data.alternativeInfo = { [clue.id]: [d.id] };
  const withD = entity(p, 'flow_edge', '代替Dを通る', { fromId: entry.id, toId: alternativeNode.id, label: '代替Dを通る' }), joinD = entity(p, 'flow_edge', 'Dから回収へ', { fromId: alternativeNode.id, toId: reveal.id, label: 'Dから回収へ' });
  const external = entity(p, 'external_contract', '未取得の外部経路条件', { key: 'unknown_path', owner: 'game', inputType: 'boolean', outputType: 'boolean', version: '1.0.0', missingPolicy: 'unknown' }), uncertain = entity(p, 'flow_edge', '外部条件が未確認の経路', { fromId: entry.id, toId: reveal.id, condition: { op: 'external', contractId: external.id } });
  graph.data.nodeIds.push(alternativeNode.id); graph.data.edgeIds.push(withD.id, joinD.id, uncertain.id);
  const count = entity(p, 'variable', '探索上限を超える整数状態', { key: 'unbounded_count', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: {} }), increment = entity(p, 'effect', '上限のない探索状態を増やす', { operation: 'add', targetId: count.id, value: { type: 'integer', value: 1 } }), loop = entity(p, 'flow_node', '制限打切りを観測する宣言入口', { nodeType: 'automatic', executionPolicy: 'first_match' }), repeat = entity(p, 'flow_edge', '制限打切りまで繰り返す', { fromId: loop.id, toId: loop.id, edgeType: 'automatic', effectIds: [increment.id] });
  graph.data.nodeIds.push(loop.id); graph.data.edgeIds.push(repeat.id); graph.data.entryIds.push(loop.id);
  await clause('AT-F45', 'given', async () => { await given(page, info, 'AT-F45', p); });
  await clause('AT-F45', 'when', async () => {
    for (const edges of [[f.withClue, f.join, f.finish], [withD, joinD, f.finish]]) { await start(page, entry.id); for (const edge of edges) await page.getByRole('button', { name: edge.name, exact: true }).click(); await expect(page.locator('.foreshadow-check')).not.toContainText(`不足する提示：${clue.name}`); await record(page); }
    await start(page, entry.id); await page.getByRole('button', { name: f.bypass.name, exact: true }).click(); await page.getByRole('button', { name: f.finish.name, exact: true }).click(); await record(page);
  });
  let analysis!: AnalysisResult;
  await clause('AT-F45', 'then', async () => {
    await expect(page.locator('.foreshadow-check')).toContainText(`不足する提示：${clue.name}`); await expect(page.locator('.foreshadow-check')).toContainText(`${entry.name} → ${reveal.name}`); await expect(page.locator('.foreshadow-check')).toContainText('読者の理解は判定しません');
    analysis = await analyze(page); const missing = analysis.findings.find(row => row.targetId === question.id && row.payoffId === payoff.id && row.code === 'REQUIRED_INFO_MISSING'); expect(missing?.missingInfoIds).toEqual([clue.id]); expect(missing?.path).toEqual(expect.arrayContaining([entry.id, reveal.id])); expect(missing?.missingInfoIds).not.toContain(optional.id);
  });
  await clause('AT-F45', 'negative_or_edge', async () => {
    expect(analysis.status).not.toBe('passed_for_checked_scope'); expect(analysis.findings.some(row => row.status === 'unknown' && /外部|未確認/.test(row.message))).toBe(true); expect(analysis.truncated).toBe(true); expect(analysis.limits).toEqual({ maxStates: 100000, maxTransitions: 10000, maxMs: 30000 }); expect(analysis.findings.some(row => row.status === 'unknown' && /制限|上限|打切り/.test(row.message))).toBe(true);
    const saved = (await backup(page)).project, traces = saved.entities.filter((row): row is Entity<'trace'> => row.kind === 'trace'); expect(traces).toHaveLength(3); expect(traces.every(row => row.data.steps.every(step => step.after.assertions.length === 0))).toBe(true);
    expect(findEntity(saved, question.id, 'foreshadow').data.requiredInfo).toEqual([clue.id]); await attachObservation(info, 'AT-F45-observed', { analysis, alternativeForC: [d.id], optionalNotRequired: optional.id, playerUnderstanding: 'not_inferred', externalUnconfirmed: external.id, unboundedStateId: count.id, explorationLimitObserved: { truncated: analysis.truncated, limits: analysis.limits, unknown: true } });
  });
});

test('AT-F46 真実T・Aの嘘・Bの誤解・Cの未取得知識を分離し、出所と取得位置を通常登録して発言を検査する', async ({ page }, info) => {
  const f = narrativeFixture('AT-F46 発言と知識取得の位置'), { p, opening, clueScene, clue, entry } = f;
  const a = entity(p, 'character', '嘘を語る人物A'), b = entity(p, 'character', '誤解する人物B'), c = entity(p, 'character', 'まだ知らない人物C');
  const truth = entity(p, 'assertion', '作者が定めた真実T', { subjectId: a.id, predicate: 'secret', truthKind: 'author_truth', value: { type: 'boolean', value: true } }), lie = entity(p, 'assertion', 'Aの誤った証言', { subjectId: a.id, predicate: 'secret', truthKind: 'testimony', holderId: a.id, value: { type: 'boolean', value: false } }), belief = entity(p, 'assertion', 'Bの誤解', { subjectId: a.id, predicate: 'secret', truthKind: 'belief', holderId: b.id, value: { type: 'boolean', value: false } }), knowledge = entity(p, 'assertion', 'Cが後で取得するT', { subjectId: a.id, predicate: 'secret', truthKind: 'belief', holderId: c.id, value: { type: 'boolean', value: true } }), hypothesis = entity(p, 'assertion', '未確定の仮説', { subjectId: a.id, predicate: 'secret', truthKind: 'hypothesis', value: { type: 'unknown', value: null, reason: 'まだ作者が確定していない' } }); hypothesis.status = 'provisional';
  const cLine = entity(p, 'dialogue_line', '未取得のCがTを断言', { speakerId: c.id, text: textToRichText('秘密は存在する。'), claimAssertionIds: [knowledge.id] }), aLine = entity(p, 'dialogue_line', '理由付きの意図した嘘', { speakerId: a.id, text: textToRichText('秘密などない。'), claimAssertionIds: [lie.id], assertionIntent: 'lie' }), bLine = entity(p, 'dialogue_line', '理由付きの人物の誤解', { speakerId: b.id, text: textToRichText('秘密などないと思う。'), claimAssertionIds: [belief.id], assertionIntent: 'misunderstanding' }); opening.data.dialogueLineIds = [cLine.id, aLine.id, bLine.id]; clueScene.data.dialogueLineIds = [cLine.id];
  const acquire = entity(p, 'effect', 'Cが出所付きのTを取得する', { operation: 'assert', targetId: knowledge.id }); clue.data.knowledgeEffects = [acquire.id]; clue.data.anchor = { entityId: clueScene.id, blockId: clueScene.data.body[0].id, start: 0, end: 1 };
  await clause('AT-F46', 'given', async () => { await given(page, info, 'AT-F46', p); });
  await clause('AT-F46', 'when', async () => {
    await openEntity(page, 'assertion', lie.name); await editData(page, { ...lie.data, sourceIds: [truth.id], evidenceLocation: { entityId: aLine.id, blockId: aLine.data.text[0].id } });
    await openEntity(page, 'assertion', belief.name); await editData(page, { ...belief.data, sourceIds: [lie.id], evidenceLocation: { entityId: bLine.id, blockId: bLine.data.text[0].id } });
    await openEntity(page, 'assertion', knowledge.name); await editData(page, { ...knowledge.data, sourceIds: [truth.id], evidenceLocation: clue.data.anchor });
    await openEntity(page, 'dialogue_line', aLine.name); await editData(page, { ...aLine.data, assertionReason: '真実を隠すためと作者が意図した' }); await openEntity(page, 'dialogue_line', bLine.name); await editData(page, { ...bLine.data, assertionReason: 'Aの証言を信じた誤解である' });
    await start(page, entry.id); const claims = page.getByRole('region', { name: '発言と提示時点の認識', exact: true }); await expect(claims.locator('summary').filter({ hasText: cLine.name })).toContainText('確認候補'); await claims.locator('summary').filter({ hasText: aLine.name }).click(); await expect(claims).toContainText('意図した嘘'); await expect(claims).toContainText('真実を隠すため');
  });
  await clause('AT-F46', 'then', async () => {
    const claims = page.getByRole('region', { name: '発言と提示時点の認識', exact: true }); await claims.locator('summary').filter({ hasText: cLine.name }).click(); await expect(claims).toContainText('この提示時点で人物が取得していない');
    await claims.locator('summary').filter({ hasText: bLine.name }).click(); await expect(claims).toContainText('意図した誤解'); for (const label of ['作者の真実', '証言', '人物の信念']) await expect(claims).toContainText(label);
    await page.getByRole('button', { name: f.withClue.name, exact: true }).click(); await expect(claims.locator('summary').filter({ hasText: cLine.name }).last()).toContainText('取得済み'); await record(page);
  });
  await clause('AT-F46', 'negative_or_edge', async () => {
    await openEntity(page, 'assertion', knowledge.name); await editData(page, { ...knowledge.data, sourceIds: [truth.id], evidenceLocation: null, validity: emptyValidity() }); await start(page, entry.id); await page.getByRole('button', { name: f.withClue.name, exact: true }).click(); await expect(page.locator('.reader-issue')).toContainText('本文位置または世界内の取得時点');
    const saved = (await backup(page)).project; expect(findEntity(saved, truth.id, 'assertion').data.truthKind).toBe('author_truth'); expect(findEntity(saved, hypothesis.id, 'assertion').status).toBe('provisional');
    expect(saved.entities.filter(row => row.kind === 'assertion' && row.data.truthKind === 'author_truth')).toHaveLength(1); await attachObservation(info, 'AT-F46-observed', { truthId: truth.id, lieId: lie.id, misunderstandingId: belief.id, unacquiredThenAcquiredC: knowledge.id, unconfirmedHypothesisId: hypothesis.id, missingAcquisitionPosition: 'unknown', sourceAndPositionRequired: true });
  });
});

test('AT-F47 今作・続編・意図した未回収・没の範囲を分けて未回収を抽出し、回収先変更後は再確認待ちにする', async ({ page }, info) => {
  const f = narrativeFixture('AT-F47 回収範囲と意図'), { p, question: q, entry, end, payoff, graph } = f;
  payoff.data.condition = { op: 'constant', value: false }; q.data.deadline = { projectId: p.projectId, graphId: graph.id };
  const r = entity(p, 'foreshadow', '続編で回収するR', { question: textToRichText('続編に残す謎。'), resolutionPolicy: 'sequel', intent: textToRichText('続編で回収するため今作に残す') }), s = entity(p, 'foreshadow', '意図した未回収S', { question: textToRichText('意図して答えを決めない謎。'), resolutionPolicy: 'intentional_open', intent: textToRichText('読み手の想像へ委ねる') }), t = entity(p, 'foreshadow', '没の問いT', { question: textToRichText('没案の謎。'), resolutionPolicy: 'rejected' }); t.status = 'rejected';
  await clause('AT-F47', 'given', async () => { await given(page, info, 'AT-F47', p); await start(page, entry.id); });
  let report!: AnalysisResult;
  await clause('AT-F47', 'when', async () => {
    await page.getByRole('button', { name: f.bypass.name, exact: true }).click(); await page.getByRole('button', { name: f.finish.name, exact: true }).click(); await record(page); report = await analyze(page);
    const qFinding = page.locator('.foreshadow-check .analysis-finding').filter({ hasText: '今作で予定した回収' }); await expect(qFinding).toContainText('確認候補'); await qFinding.getByRole('button', { name: '伏線を開く', exact: true }).click(); await expect(page.locator('#entity-name')).toHaveValue(q.name);
  });
  await clause('AT-F47', 'then', async () => {
    const candidates = report.findings.filter(row => row.status === 'candidate' && [q.id, r.id, s.id, t.id].includes(row.targetId ?? '')); expect(candidates.some(row => row.targetId === q.id)).toBe(true); expect(candidates.some(row => [r.id, s.id, t.id].includes(row.targetId ?? ''))).toBe(false);
    for (const id of [r.id, s.id]) expect(report.findings.some(row => row.targetId === id && row.status === 'intentional')).toBe(true); expect(report.findings.some(row => row.targetId === t.id)).toBe(false);
    await openEntity(page, 'disclosure', payoff.name); await editData(page, { ...payoff.data, anchor: { entityId: f.opening.id }, condition: { op: 'constant', value: true } }); await reader(page);
    const reconfirm = page.getByRole('region', { name: '開始版の移行と経路の再確認', exact: true }); await reconfirm.locator('summary').filter({ hasText: '保存した経路を改訂稿で再確認する' }).click(); await expect(reconfirm).toContainText('再確認待ち');
  });
  await clause('AT-F47', 'negative_or_edge', async () => {
    const saved = (await backup(page)).project; expect(findEntity(saved, q.id, 'foreshadow').data.deadline).toEqual({ projectId: p.projectId, graphId: graph.id }); expect(findEntity(saved, r.id, 'foreshadow').data.resolutionPolicy).toBe('sequel'); expect(findEntity(saved, s.id, 'foreshadow').data.resolutionPolicy).toBe('intentional_open'); expect(findEntity(saved, t.id, 'foreshadow').status).toBe('rejected');
    const oldTrace = saved.entities.find(row => row.kind === 'trace'); expect(oldTrace?.kind === 'trace' && saved.snapshots.some(pin => pin.id === oldTrace.data.contentVersionId)).toBe(true); await attachObservation(info, 'AT-F47-observed', { currentWorkScope: { projectId: p.projectId, graphId: graph.id }, witnessBranch: [entry.id, f.reveal.id, end.id], originalReport: report, candidateQuestionIds: [q.id], intentionalQuestionIds: [r.id, s.id], rejectedRetainedId: t.id, payoffChangedNeedsReconfirmation: true });
  });
});
