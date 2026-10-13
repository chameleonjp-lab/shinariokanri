import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { attachObservation, authorFingerprint, backup, clause, editData, entity, findEntity, given, navigate, openEntity, production, publicProfile, reader, record, rejectData, runtimeFixture, start, stub } from './ap04-original-e-f37-50-helpers';

test('AT-F37 新しい作品の下書きから一つの生存enum・integer好感度・未設定booleanを宣言し、不正代入を拒否する', async ({ page }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F37 新しい作品と下書き状態');
  const life = createEntity(p.projectId, 'variable', '生存', { key: 'life' }), affection = createEntity(p.projectId, 'variable', '好感度', { key: 'affection' }), unknown = createEntity(p.projectId, 'variable', '未設定の真偽', { key: 'unset' });
  p.entities.push(life, affection, unknown);
  const unknownEdge = entity(p, 'flow_edge', '未設定なら未確認', { fromId: entry.id, toId: end.id, label: '未設定なら未確認', condition: { op: 'compare', variableId: unknown.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  await clause('AT-F37', 'given', async () => { await given(page, info, 'AT-F37', p); for (const row of [life, affection, unknown]) expect(row.status).toBe('provisional'); });
  await clause('AT-F37', 'when', async () => {
    life.data = { ...life.data, valueType: 'enum', initial: { type: 'enum', value: '存命' }, allowed: { values: ['存命', '死亡'] } };
    affection.data = { ...affection.data, valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } };
    unknown.data = { ...unknown.data, valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '作者がまだ設定していない' }, allowed: {} };
    for (const row of [life, affection, unknown]) { await openEntity(page, 'variable', row.name); await editData(page, row.data); }
    await openEntity(page, 'variable', affection.name); await rejectData(page, { ...affection.data, initial: { type: 'boolean', value: false } }, /型|integer|整数/); await editData(page, affection.data);
  });
  await clause('AT-F37', 'then', async () => {
    await openEntity(page, 'variable', life.name); const meaning = page.getByRole('region', { name: '同義語・反対語の状態候補', exact: true });
    await expect(meaning).toContainText('存命／死亡'); await expect(meaning).toContainText('選択値');
    await start(page, entry.id); await expect(page.locator('.reader-trial-heading')).toContainText('未確認の条件');
    await expect(page.getByRole('button', { name: new RegExp(unknownEdge.name) })).toBeDisabled(); await expect(page.locator('.runtime-variable').filter({ hasText: unknown.name })).toContainText('作者がまだ設定していない');
  });
  await clause('AT-F37', 'negative_or_edge', async () => {
    await openEntity(page, 'variable', life.name); await rejectData(page, { ...life.data, initial: { type: 'enum', value: '蘇生中' } }, /許容集合|許容値/); await editData(page, life.data);
    await openEntity(page, 'flow_edge', unknownEdge.name);
    const beforeUndefinedReference = await authorFingerprint(page), undefinedVariableId = newId();
    const invalidData = { ...unknownEdge.data, condition: { op: 'compare', variableId: undefinedVariableId, comparator: 'eq', value: { type: 'boolean', value: true } } };
    const details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    const invalidJson = JSON.stringify(invalidData, null, 2);
    await details.getByRole('textbox', { name: '詳細データ', exact: true }).fill(invalidJson);
    // An undefined comparison is rejected before save; the original input stays editable.
    await expect(page.locator('.condition-editor').getByRole('alert')).toHaveText('比較する状態を選んでください。');
    await expect(page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
    const retainedInvalidData = JSON.parse(await details.getByRole('textbox', { name: '詳細データ', exact: true }).inputValue()); expect(retainedInvalidData).toEqual(invalidData);
    expect(p.entities.some(row => row.id === undefinedVariableId)).toBe(false);
    const afterUndefinedReference = await authorFingerprint(page); expect(afterUndefinedReference).toBe(beforeUndefinedReference);
    await editData(page, unknownEdge.data);
    expect(JSON.parse(await details.getByRole('textbox', { name: '詳細データ', exact: true }).inputValue())).toEqual(unknownEdge.data);
    const saved = (await backup(page)).project; expect(saved.entities.filter(row => row.kind === 'variable')).toHaveLength(3);
    expect(findEntity(saved, life.id, 'variable').data.allowed.values).toEqual(['存命', '死亡']); expect(findEntity(saved, unknown.id, 'variable').data.initial.type).toBe('unknown');
    expect(findEntity(saved, unknownEdge.id, 'flow_edge').data).toEqual(unknownEdge.data);
    await attachObservation(info, 'AT-F37-observed', { stateDefinitions: saved.entities.filter(row => row.kind === 'variable'), rejected: ['type_mismatch', 'outside_allowed_values', 'undefined_reference'], unknownIsFalse: false, undefinedReference: { undefinedVariableId, reason: '比較する状態を選んでください。', retainedInvalidData, authorBefore: beforeUndefinedReference, authorAfter: afterUndefinedReference, restoredData: findEntity(saved, unknownEdge.id, 'flow_edge').data } });
  });
});

test('AT-F38 run所持金と周回記憶を更新・周回・全初期化し、好感度から算出する好意への代入と循環を拒否する', async ({ page }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F38 周回と算出状態');
  const money = entity(p, 'variable', 'run所持金', { key: 'money', valueType: 'integer', scope: 'run', initial: { type: 'integer', value: 10 }, allowed: { min: 0, max: 100 } }), memory = entity(p, 'variable', 'across_runs記憶', { key: 'memory', valueType: 'boolean', scope: 'across_runs', initial: { type: 'boolean', value: false } }), affection = entity(p, 'variable', '好感度', { key: 'affection', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } }), favor = entity(p, 'variable', '好感度から算出する好意', { key: 'favor', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '好感度から計算' }, derived: { op: 'compare', variableId: affection.id, comparator: 'ge', value: { type: 'integer', value: 50 } } });
  const spend = entity(p, 'effect', '所持金を使う', { operation: 'add', targetId: money.id, value: { type: 'integer', value: -3 } }), remember = entity(p, 'effect', '記憶を持ち越す', { operation: 'set', targetId: memory.id, value: { type: 'boolean', value: true } }), like = entity(p, 'effect', '好感度を上げる', { operation: 'add', targetId: affection.id, value: { type: 'integer', value: 60 } }), path = entity(p, 'flow_edge', '値を更新して終わる', { fromId: entry.id, toId: end.id, label: '値を更新して終わる', effectIds: [spend.id, remember.id, like.id] });
  await clause('AT-F38', 'given', async () => { await given(page, info, 'AT-F38', p); await start(page, entry.id); });
  await clause('AT-F38', 'when', async () => {
    await page.getByRole('button', { name: path.name, exact: true }).click(); await expect(page.locator('.runtime-variable').filter({ hasText: money.name })).toContainText('7'); await expect(page.locator('.runtime-variable').filter({ hasText: favor.name })).toContainText('true'); await record(page);
    await page.getByRole('button', { name: '次の周回', exact: true }).click(); await expect(page.locator('.reader-trial-heading')).toContainText('周回 1');
    await expect(page.locator('.runtime-variable').filter({ hasText: money.name })).toContainText('10'); await expect(page.locator('.runtime-variable').filter({ hasText: memory.name })).toContainText('true');
    await page.getByRole('button', { name: 'すべて初期化', exact: true }).click(); await expect(page.locator('.runtime-variable').filter({ hasText: memory.name })).toContainText('false');
  });
  await clause('AT-F38', 'then', async () => {
    const saved = (await backup(page)).project, trace = saved.entities.find(row => row.kind === 'trace'); expect(trace?.kind).toBe('trace');
    if (!trace || trace.kind !== 'trace') throw Error('更新を保存した経路がありません');
    expect(trace.data.steps[0].after.variableValues[money.id]).toEqual({ type: 'integer', value: 7 }); expect(trace.data.steps[0].after.variableValues[memory.id]).toEqual({ type: 'boolean', value: true });
    expect(findEntity(saved, favor.id, 'variable').data.derived).toEqual(favor.data.derived); expect(saved.entities.filter(row => row.kind === 'effect' && row.data.targetId === favor.id)).toEqual([]);
    await start(page, entry.id); const usages = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: `${memory.name} · across_runs` }) }); await expect(usages).toBeVisible();
  });
  await clause('AT-F38', 'negative_or_edge', async () => {
    await openEntity(page, 'effect', spend.name); await rejectData(page, { ...spend.data, operation: 'set', targetId: favor.id, value: { type: 'boolean', value: true } }, /算出状態.*直接代入/); await editData(page, spend.data);
    await openEntity(page, 'variable', affection.name); await rejectData(page, { ...affection.data, derived: { op: 'if', condition: { op: 'compare', variableId: favor.id, comparator: 'eq', value: { type: 'boolean', value: true } }, then: { op: 'value', value: { type: 'integer', value: 60 } }, else: { op: 'value', value: { type: 'integer', value: 0 } } } }, /算出状態.*循環|循環/); await editData(page, affection.data);
    await attachObservation(info, 'AT-F38-observed', { nextRun: { money: 10, memory: true }, allReset: { money: 10, memory: false }, carriedVariableIds: [memory.id], derivedVariableId: favor.id, rejected: ['direct_derived_assignment', 'expression_cycle'] });
  });
});

test('AT-F39 Xの読取・更新・resetをIDで追い、外部利用を宣言した未使用Yを削除候補としてだけ示す', async ({ page }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F39 利用箇所と変更原因');
  const x = entity(p, 'variable', '利用する状態X', { key: 'x', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } }), y = entity(p, 'variable', '作品外で使う未使用Y', { key: 'y', valueType: 'boolean', initial: { type: 'boolean', value: false }, externalUseDeclared: true });
  const add = entity(p, 'effect', 'Xを更新する処理', { operation: 'add', targetId: x.id, value: { type: 'integer', value: 1 }, reason: '選択によってXを増やす' }), reset = entity(p, 'effect', 'Xをresetする処理', { operation: 'reset', targetId: x.id, value: { type: 'integer', value: 0 }, reason: '作者が指定した初期状態へ戻す' }), read = entity(p, 'flow_edge', 'Xを読む選択', { fromId: entry.id, toId: end.id, label: 'Xを読む選択', condition: { op: 'compare', variableId: x.id, comparator: 'eq', value: { type: 'integer', value: 0 } }, effectIds: [add.id] });
  let usageSourceVersionId = '', usageSourceVersionLabel = '', usageAuthorBefore = '', usageAuthorAfter = '';
  entity(p, 'flow_edge', 'Xを初期化する選択', { fromId: entry.id, toId: end.id, label: 'Xを初期化する選択', effectIds: [reset.id] });
  await clause('AT-F39', 'given', async () => { await given(page, info, 'AT-F39', p); await start(page, entry.id); });
  await clause('AT-F39', 'when', async () => {
    await page.getByRole('button', { name: new RegExp(read.name) }).click(); await expect(page.locator('.runtime-diff')).toContainText(x.name); await record(page);
    const usage = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: `${x.name} · run` }) }); await usage.locator('summary').click();
    for (const name of [read.name, add.name, reset.name]) await expect(usage).toContainText(name);
    usageSourceVersionId = await page.getByLabel('試読する作品版', { exact: true }).inputValue();
    usageSourceVersionLabel = await page.getByLabel('試読する作品版', { exact: true }).locator('option:checked').innerText();
    expect(usageSourceVersionId).not.toBe('');
    usageAuthorBefore = await authorFingerprint(page);
    await usage.getByRole('button', { name: add.name, exact: true }).click();
    const pinned = page.getByRole('dialog', { name: '固定版の参照先', exact: true }).getByRole('region', { name: '固定版の参照先', exact: true });
    await expect(pinned.getByRole('heading', { name: add.name, exact: true })).toBeVisible();
    await expect(pinned).toContainText(`固定版: ${usageSourceVersionLabel} · 保存日時:`);
    await expect(pinned.locator('#entity-name')).toHaveCount(0);
    await page.getByRole('dialog', { name: '固定版の参照先', exact: true }).getByRole('button', { name: '閉じる', exact: true }).click();
    usageAuthorAfter = await authorFingerprint(page); expect(usageAuthorAfter).toBe(usageAuthorBefore);
    await navigate(page, /^検索/); await page.getByRole('tab', { name: '見直しと統合', exact: true }).click();
  });
  await clause('AT-F39', 'then', async () => {
    const candidate = page.locator('.search-page article').filter({ hasText: y.name }); await expect(candidate).toContainText('作品外から使う状態として宣言'); await expect(candidate).not.toContainText('利用する状態X');
    await candidate.getByRole('button', { name: y.name, exact: true }).click(); await expect(page.locator('#entity-name')).toHaveValue(y.name);
  });
  await clause('AT-F39', 'negative_or_edge', async () => {
    await page.reload(); const saved = (await backup(page)).project; expect(findEntity(saved, y.id, 'variable').deletedAt).toBeFalsy(); expect(findEntity(saved, y.id, 'variable').data.externalUseDeclared).toBe(true);
    const trace = saved.entities.find(row => row.kind === 'trace'); if (!trace || trace.kind !== 'trace') throw Error('Xの変更履歴がありません');
    expect(trace.data.contentVersionId).toBe(usageSourceVersionId);
    const usageSnapshot = saved.snapshots.find(snapshot => snapshot.id === usageSourceVersionId); expect(usageSnapshot?.versionLabel).toBe(usageSourceVersionLabel);
    const pinnedEffect = usageSnapshot?.content.entities.find(row => row.id === add.id); expect(pinnedEffect?.kind).toBe('effect'); expect(pinnedEffect?.data).toEqual(add.data);
    expect(trace.data.steps[0].edgeIds).toEqual([read.id]); expect(findEntity(saved, read.id, 'flow_edge').data.effectIds).toEqual([add.id]); expect(trace.data.steps[0].before.variableValues[x.id].value).toBe(0); expect(trace.data.steps[0].after.variableValues[x.id].value).toBe(1);
    await attachObservation(info, 'AT-F39-observed', { readId: read.id, writeId: add.id, resetId: reset.id, savedStep: trace.data.steps[0], externalUnusedRetained: y.id, fixedUsageTarget: { sourceVersionId: usageSourceVersionId, sourceVersionLabel: usageSourceVersionLabel, entityId: add.id, data: pinnedEffect?.data, authorBefore: usageAuthorBefore, authorAfter: usageAuthorAfter } });
  });
});

test('AT-F40 括弧付きall/any条件の真・偽・不明を通常試読し、同じ優先値とfallback不足を明示する', async ({ page }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F40 三値と自動優先');
  const key = entity(p, 'variable', '鍵boolean', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: true } }), time = entity(p, 'variable', '時刻enum', { key: 'time', valueType: 'enum', initial: { type: 'enum', value: '昼' }, allowed: { values: ['昼', '夜'] } });
  const auto = entity(p, 'flow_node', '同時成立する自動候補', { nodeType: 'automatic', executionPolicy: 'first_match' }), blocked = entity(p, 'flow_node', 'fallbackなし', { nodeType: 'automatic', executionPolicy: 'first_match' });
  const c = { op: 'all' as const, children: [{ op: 'compare' as const, variableId: key.id, comparator: 'eq' as const, value: { type: 'boolean' as const, value: true } }, { op: 'any' as const, children: ['昼', '夜'].map(value => ({ op: 'compare' as const, variableId: time.id, comparator: 'eq' as const, value: { type: 'enum' as const, value } })) }] };
  const edge = entity(p, 'flow_edge', '括弧を持つ選択', { fromId: entry.id, toId: end.id, label: '括弧を持つ選択' });
  const autoA = entity(p, 'flow_edge', '同時成立自動A', { fromId: auto.id, toId: end.id, edgeType: 'automatic', priority: 1, condition: { op: 'constant', value: true } }), autoB = entity(p, 'flow_edge', '同時成立自動B', { fromId: auto.id, toId: end.id, edgeType: 'automatic', priority: 2, condition: { op: 'constant', value: true } });
  const unknownKeyData = { ...key.data, initial: { type: 'unknown' as const, value: null, reason: '鍵の取得は未設定' } };
  const evaluations: { result: 'true' | 'false' | 'unknown'; keyId: string; edgeId: string; entryId: string; stateText: string; choiceText: string; choiceClass: string | null }[] = [];
  let rejectedUnknownStubObservation: { code: string; issueText: string; stateBefore: string; stateAfter: string; choiceClass: string | null } | undefined;
  entity(p, 'flow_edge', '不成立の自動条件', { fromId: blocked.id, toId: end.id, edgeType: 'automatic', condition: { op: 'constant', value: false } });
  await clause('AT-F40', 'given', async () => { await given(page, info, 'AT-F40', p); });
  await clause('AT-F40', 'when', async () => {
    await openEntity(page, 'flow_edge', edge.name); edge.data.condition = c; await editData(page, edge.data);
    await start(page, entry.id);
    const choice = page.locator('.reader-choice').filter({ has: page.getByText(edge.name, { exact: true }) }), state = page.locator('.runtime-variable').filter({ hasText: key.name });
    await expect(choice).toBeEnabled(); await expect(choice).toHaveClass('reader-choice choice-true'); await expect(state).toContainText('true');
    evaluations.push({ result: 'true', keyId: key.id, edgeId: edge.id, entryId: entry.id, stateText: await state.innerText(), choiceText: await choice.innerText(), choiceClass: await choice.getAttribute('class') });
    await stub(page, key.name, 'boolean', 'false'); await expect(choice).toBeDisabled(); await expect(choice).toHaveClass('reader-choice choice-false'); await expect(choice).toContainText('条件を満たしていません'); await expect(state).toContainText('false');
    evaluations.push({ result: 'false', keyId: key.id, edgeId: edge.id, entryId: entry.id, stateText: await state.innerText(), choiceText: await choice.innerText(), choiceClass: await choice.getAttribute('class') });
    const beforeRejectedUnknown = await state.innerText();
    await stub(page, key.name, 'unknown', '鍵の取得は未設定');
    const rejectedUnknown = page.locator('.reader-issue').filter({ hasText: '未定の値はこの操作で使えません。' });
    await expect(rejectedUnknown.locator('code')).toHaveText('CONDITION_UNKNOWN'); await expect(rejectedUnknown).toContainText('未定の値はこの操作で使えません。'); await expect.poll(() => state.innerText()).toBe(beforeRejectedUnknown); await expect(choice).toHaveClass('reader-choice choice-false');
    rejectedUnknownStubObservation = { code: await rejectedUnknown.locator('code').innerText(), issueText: await rejectedUnknown.innerText(), stateBefore: beforeRejectedUnknown, stateAfter: await state.innerText(), choiceClass: await choice.getAttribute('class') };
    // Unknown assignment is rejected. Re-evaluate the same declarations from an
    // explicitly authored unknown initial state, rather than assuming it applied.
    await openEntity(page, 'variable', key.name); await editData(page, unknownKeyData); await start(page, entry.id);
    await expect(choice).toBeDisabled(); await expect(choice).toHaveClass('reader-choice choice-unknown'); await expect(choice).toContainText('未確認'); await expect(state).toContainText('鍵の取得は未設定');
    evaluations.push({ result: 'unknown', keyId: key.id, edgeId: edge.id, entryId: entry.id, stateText: await state.innerText(), choiceText: await choice.innerText(), choiceClass: await choice.getAttribute('class') });
    await openEntity(page, 'flow_edge', autoB.name); await rejectData(page, { ...autoB.data, priority: autoA.data.priority }, /優先順位が重複/); await editData(page, autoB.data);
    await start(page, blocked.id); await expect(page.locator('.reader-trial-heading')).toContainText('進行不可');
  });
  await clause('AT-F40', 'then', async () => {
    await navigate(page, /^構成/); await page.getByRole('tab', { name: '分岐', exact: true }).click();
    await expect(page.locator('.branch-edge').filter({ hasText: edge.name })).toContainText('（鍵boolean ＝ 真、かつ、（時刻enum ＝ 昼、または、時刻enum ＝ 夜））');
    await expect(page.locator('.branch-node').filter({ hasText: auto.name })).toContainText(autoA.name); await expect(page.locator('.branch-node').filter({ hasText: auto.name })).toContainText(autoB.name);
  });
  await clause('AT-F40', 'negative_or_edge', async () => {
    await openEntity(page, 'flow_edge', edge.name);
    const beforeArbitraryCode = await authorFingerprint(page), invalidData = { ...edge.data, condition: { op: 'javascript', code: 'globalThis.__shouldNeverExecute = true' } };
    const details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    await details.getByRole('textbox', { name: '詳細データ', exact: true }).fill(JSON.stringify(invalidData, null, 2));
    const invalidCondition = page.locator('.condition-editor').getByRole('alert'); await expect(invalidCondition).toContainText('未知の条件・式opです。'); await expect(invalidCondition.locator('code')).toHaveText('VALIDATION_FAILED');
    await expect(page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true })).toBeDisabled();
    expect(JSON.parse(await details.getByRole('textbox', { name: '詳細データ', exact: true }).inputValue())).toEqual(invalidData); expect(await authorFingerprint(page)).toBe(beforeArbitraryCode);
    await editData(page, edge.data);
    expect(await page.evaluate(() => Object.hasOwn(globalThis, '__shouldNeverExecute'))).toBe(false);
    const saved = (await backup(page)).project; expect(findEntity(saved, edge.id, 'flow_edge').data.condition).toEqual(c); expect(findEntity(saved, blocked.id, 'flow_node').data.fallbackId).toBeNull();
    expect(findEntity(saved, key.id, 'variable').data).toEqual(unknownKeyData); expect(findEntity(saved, time.id, 'variable').data).toEqual(time.data);
    for (const original of p.entities.filter(row => ![key.id, edge.id].includes(row.id))) expect(saved.entities.find(row => row.id === original.id)?.data).toEqual(original.data);
    await attachObservation(info, 'AT-F40-observed', { condition: c, evaluated: evaluations, originalKeyData: key.data, authoredUnknownKeyData: unknownKeyData, rejectedUnknownStub: rejectedUnknownStubObservation, equalPriority: 1, noFallbackBlocked: blocked.id, arbitraryCodeExecuted: false });
  });
});

test('AT-F41 クエスト禁止遷移と所持金加算を原子的に拒否し、理由付きresetと対象・期限付き例外を記録する', async ({ page }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F41 クエスト許容遷移');
  const state = entity(p, 'variable', 'クエスト状態', { key: 'quest_state', valueType: 'enum', initial: { type: 'enum', value: '完了' }, allowed: { values: ['未受注', '進行中', '完了', '失敗'] } }), money = entity(p, 'variable', '所持金', { key: 'money', valueType: 'integer', initial: { type: 'integer', value: 10 }, allowed: { min: 0, max: 100 } });
  const rules = [['未受注', '進行中'], ['進行中', '完了'], ['進行中', '失敗']].map(([from, to]) => ({ from: { type: 'enum' as const, value: from }, to: { type: 'enum' as const, value: to } }));
  const quest = entity(p, 'quest', '未受注から始まるクエスト', { key: 'quest', stateVariableId: state.id, transitionRules: rules }), evidence = entity(p, 'note', '例外を認めた作者の根拠', { body: textToRichText('この検証経路と0から10tickの期間だけ、完了の取り消しを許可する。') });
  const add = entity(p, 'effect', '禁止更新より先に加算', { operation: 'add', targetId: money.id, value: { type: 'integer', value: 5 } }), illegal = entity(p, 'effect', '完了を未受注へ戻す', { operation: 'set', targetId: state.id, value: { type: 'enum', value: '未受注' } }), reset = entity(p, 'effect', '理由付きの明示reset', { operation: 'reset', targetId: state.id, value: { type: 'enum', value: '未受注' }, reason: '作者が初期状態から検査し直すため' });
  const batch = entity(p, 'flow_edge', '禁止遷移と加算を試す', { fromId: entry.id, toId: end.id, label: '禁止遷移と加算を試す', effectIds: [add.id, illegal.id] }), resetPath = entity(p, 'flow_edge', '明示resetを試す', { fromId: entry.id, toId: end.id, label: '明示resetを試す', effectIds: [reset.id] });
  const graph = entity(p, 'flow_graph', '例外の対象経路', { nodeIds: [entry.id, end.id], edgeIds: [batch.id, resetPath.id], entryIds: [entry.id], exitIds: [end.id] });
  await clause('AT-F41', 'given', async () => { await given(page, info, 'AT-F41', p); await start(page, entry.id); });
  await clause('AT-F41', 'when', async () => {
    const before = await page.locator('.runtime-variables').innerText(); await page.getByRole('button', { name: batch.name, exact: true }).click(); await expect(page.locator('.reader-issue')).toContainText('許容遷移'); expect(await page.locator('.runtime-variables').innerText()).toBe(before); await expect(page.locator('.reader-sheet h2')).toHaveText(entry.name);
    await page.getByRole('button', { name: resetPath.name, exact: true }).click(); await expect(page.locator('.runtime-variable').filter({ hasText: state.name })).toContainText('未受注'); await record(page);
  });
  await clause('AT-F41', 'then', async () => {
    const saved = (await backup(page)).project, trace = saved.entities.find(row => row.kind === 'trace'); if (!trace || trace.kind !== 'trace') throw Error('resetの以前状態を保存した経路がありません');
    expect(trace.data.steps[0].before.variableValues[state.id]).toEqual({ type: 'enum', value: '完了' }); expect(trace.data.steps[0].after.variableValues[state.id]).toEqual({ type: 'enum', value: '未受注' }); expect(trace.data.steps[0].after.variableValues[money.id].value).toBe(10);
    expect(findEntity(saved, quest.id, 'quest').data.transitionRules).toEqual(rules); await attachObservation(info, 'AT-F41-reset-before-after', trace.data.steps[0]);
  });
  await clause('AT-F41', 'negative_or_edge', async () => {
    const exception = { reason: '根拠に従ったこの経路限定の完了解除', targetScope: { projectId: p.projectId, graphId: graph.id }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } }, evidenceIds: [evidence.id] };
    await openEntity(page, 'effect', illegal.name); await editData(page, { ...illegal.data, exceptionDetails: exception }); await start(page, entry.id); await page.getByLabel('試読時点の世界内tick', { exact: true }).fill('5'); await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click();
    await page.getByRole('button', { name: batch.name, exact: true }).click(); await expect(page.locator('.runtime-variable').filter({ hasText: money.name })).toContainText('15'); await record(page);
    await start(page, entry.id); await page.getByLabel('試読時点の世界内tick', { exact: true }).fill('10'); await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click(); await page.getByRole('button', { name: batch.name, exact: true }).click(); await expect(page.locator('.reader-issue')).toContainText(/期限|期間|成立|遷移/); await expect(page.locator('.runtime-variable').filter({ hasText: money.name })).toContainText('10');
    await attachObservation(info, 'AT-F41-observed', { atomicRejection: { money: 10, state: '完了' }, resetReason: reset.data.reason, explicitException: exception, allowedWorldTick: '5', expiredWorldTick: '10' });
  });
});

test('AT-F42 戦闘enum契約のstub経路とLinux受取例のactual証跡をID付きで分離する（実ゲーム実機は未実行）', async ({ page, context }, info) => {
  const { p, entry, end } = runtimeFixture('AT-F42 外部戦闘の管理契約'); entry.data.executionPolicy = 'first_match'; entry.data.nodeType = 'automatic';
  const line = entity(p, 'dialogue_line', '勝利後の台詞', { text: textToRichText('戦闘結果を確認した。') }), scene = entity(p, 'scene', '勝利後の場面', { body: textToRichText('ゲーム側の勝利結果によって提示する。'), dialogueLineIds: [line.id] }); end.data.sceneId = scene.id;
  const contract = entity(p, 'external_contract', 'ゲーム管理の戦闘結果enum', { key: 'battle_result', owner: 'game', inputType: 'enum', outputType: 'enum', missingPolicy: 'unknown', version: '1.0.0', stubValues: [{ type: 'enum', value: '勝利' }] });
  const result = entity(p, 'variable', 'ゲーム契約から取得する戦闘結果', { key: 'battle_enum', valueType: 'enum', initial: { type: 'enum', value: '未取得' }, allowed: { values: ['未取得', '勝利', '敗北'] }, externalContractId: contract.id });
  entry.data.gate = { op: 'compare', variableId: result.id, comparator: 'eq', value: { type: 'enum', value: '勝利' } }; const edge = entity(p, 'flow_edge', '勝利結果で進む', { fromId: entry.id, toId: end.id, edgeType: 'automatic', label: '勝利結果で進む', condition: entry.data.gate });
  entity(p, 'flow_graph', '戦闘結果の宣言経路', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] }); const profile = publicProfile(p); profile.data.publicValues = Object.fromEntries([result.id, contract.id].map(id => [id, { 未取得: '未取得', 勝利: '勝利', 敗北: '敗北' }]));
  await clause('AT-F42', 'given', async () => { await given(page, info, 'AT-F42', p); await start(page, entry.id); await expect(page.locator('.reader-trial-heading')).toContainText('未確認'); });
  let runtime!: Buffer, receipt!: Buffer;
  await clause('AT-F42', 'when', async () => {
    await stub(page, contract.name, 'enum', '勝利'); await page.getByRole('button', { name: '進行規則に従って次へ', exact: true }).click(); await record(page);
    await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '目的別出力', exact: true }).click(); await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id); await page.getByLabel('出力目的', { exact: true }).selectOption('runtime_json'); await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click(); await expect(page.locator('.export-result')).toContainText('runtime.json');
    const download = page.waitForEvent('download'); await page.locator('.export-artifact').getByRole('button', { name: 'この内容を保存', exact: true }).click(); runtime = await readFile((await (await download).path())!);
    const pkg = JSON.parse(runtime.toString()), game = await context.newPage(); await game.goto(new URL('examples/browser-game/index.html', page.url()).href); await game.getByLabel('ゲームが受け取るruntime.json', { exact: true }).setInputFiles({ name: 'runtime.json', mimeType: 'application/json', buffer: runtime });
    await game.getByLabel('ゲーム開始入口', { exact: true }).selectOption(pkg.publicToRuntime[entry.id]); await game.getByRole('button', { name: `ゲームで勝利 (${contract.id})`, exact: true }).click(); await game.getByRole('button', { name: '測定結果でゲームの物語を開始', exact: true }).click(); await game.getByRole('button', { name: 'ゲームの規則で次へ', exact: true }).click();
    const actual = game.waitForEvent('download'); await game.getByRole('button', { name: '受領hash・実結果の証跡を保存', exact: true }).click(); receipt = await readFile((await (await actual).path())!); await game.close();
    await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
    const handoff = page.locator('.game-handoff'); await handoff.locator('summary').click(); await handoff.getByLabel('受渡しの公開範囲', { exact: true }).selectOption(profile.id); await handoff.getByLabel('ゲームの受領証跡', { exact: true }).setInputFiles({ name: 'receipt.json', mimeType: 'application/json', buffer: receipt }); await handoff.getByRole('button', { name: '受領hash・ID対応・実結果を検証', exact: true }).click(); await expect(handoff).toContainText('実行証跡による分類 actual'); await handoff.getByRole('button', { name: '検証したゲーム受領を保存', exact: true }).click();
  });
  await clause('AT-F42', 'then', async () => {
    const saved = (await backup(page)).project, trace = saved.entities.find(row => row.kind === 'trace'), handoff = saved.entities.find(row => row.kind === 'note' && row.data.handoffReceipt);
    expect(trace).toMatchObject({ data: { externalMode: 'stub' } }); expect(handoff?.kind === 'note' && handoff.data.handoffReceipt).toMatchObject({ mode: 'actual' });
    const mapping = handoff?.kind === 'note' ? handoff.data.handoffReceipt?.idMappings : []; expect(mapping).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: line.id }), expect.objectContaining({ entityId: entry.id })]));
  });
  await clause('AT-F42', 'negative_or_edge', async () => {
    const saved = (await backup(page)).project; expect(findEntity(saved, contract.id, 'external_contract').data).toMatchObject({ owner: 'game', inputType: 'enum', outputType: 'enum', missingPolicy: 'unknown', version: '1.0.0' });
    await attachObservation(info, 'AT-F42-local-and-external-boundary', { localReceiver: 'Linux Chromium generic browser-game receiver', stubEvidence: 'trace.externalMode=stub', localReceipt: 'handoffReceipt.mode=actual', originalActualGameVerification: { result: 'not_run', missing: ['target engine and version', 'physical game device', 'game adapter and actual battle result evidence'], genericReceiverDoesNotSatisfyActualGameClause: true } });
  });
});
