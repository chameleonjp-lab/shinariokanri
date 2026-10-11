import { expect, test } from '@playwright/test';
import { createProject, emptyValidity, textToRichText } from '../../src/domain/model';
import { dialogueContentHash } from '../../src/domain/production';
import { createWorldSnapshot } from '../../src/domain/world';
import type { Entity } from '../../src/domain/types';
import { jsonBytes, sha256 } from '../../src/storage/json';
import { add, attachObservation, authorFingerprint, backup, clause, editData, entity, findEntity, given, navigate, openEntity, production, reader, record, start } from './ap04-original-e-f37-50-helpers';

test('AT-F48 時期で変わる一人称と表記ゆれ・意図した例外を、台詞・字幕・翻訳の確認候補として検査する', async ({ page }, info) => {
  const p = createProject('AT-F48 成長と表記の期間'), person = entity(p, 'character', '成長する人物');
  const early = entity(p, 'dialogue_line', '成長前の台詞', { speakerId: person.id, text: textToRichText('僕は赤き扉を開く。') }), late = entity(p, 'dialogue_line', '成長後の台詞', { speakerId: person.id, text: textToRichText('私は赤き扉を開く。') });
  const earlyScene = entity(p, 'scene', '成長前の場面', { body: textToRichText('10tick以前の出来事。'), dialogueLineIds: [early.id] }), lateScene = entity(p, 'scene', '成長後の場面', { body: textToRichText('10tick以後の出来事。'), dialogueLineIds: [late.id] });
  const earlyEntry = entity(p, 'flow_node', '成長前の宣言入口', { nodeType: 'entry', sceneId: earlyScene.id }), lateEntry = entity(p, 'flow_node', '成長後の宣言入口', { nodeType: 'entry', sceneId: lateScene.id });
  const end = entity(p, 'flow_node', '時期別の提示を終える', { nodeType: 'terminal', terminalReason: 'この時期の台詞提示を終了' });
  for (const entry of [earlyEntry, lateEntry]) entity(p, 'flow_edge', `${entry.name}から終える`, { fromId: entry.id, toId: end.id, label: `${entry.name}から終える` });
  const exception = { reason: '成長前の語りでは昔の表記を意図して残す', targetScope: { projectId: p.projectId, routeCondition: { op: 'visited' as const, entityId: earlyEntry.id, count: 1 } }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } }, evidenceIds: [early.id] };
  const beforeRule = entity(p, 'voice_rule', '成長前の口調', { characterId: person.id, firstPerson: '僕', validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } } }), afterRule = entity(p, 'voice_rule', '成長後の口調', { characterId: person.id, firstPerson: '私', validity: { ...emptyValidity(), worldRange: { start: '10', end: '20' } } }), term = entity(p, 'terminology', '赤い扉の表記', { canonical: '赤い扉', reading: '', variants: ['赤き扉'], validity: { ...emptyValidity(), worldRange: { start: '0', end: '20' } }, exceptions: [exception] });
  const translation = entity(p, 'localization', '成長前の翻訳', { sourceLineId: early.id, language: 'en', sourceHash: await dialogueContentHash(p, early), text: textToRichText('僕 and 赤き扉 are retained intentionally.'), stage: 'draft' }), subtitle = entity(p, 'storyboard_frame', '成長後の字幕', { anchor: { entityId: late.id, lineId: late.id }, caption: textToRichText('私は赤き扉を開く。'), mediaStartMs: 0, mediaEndMs: 1000 });
  await clause('AT-F48', 'given', async () => { await given(page, info, 'AT-F48', p); });
  let earlyTraceId = '', lateTraceId = '';
  await clause('AT-F48', 'when', async () => {
    for (const [entry, tick] of [[earlyEntry, '9'], [lateEntry, '10']] as const) {
      await start(page, entry.id); await page.getByLabel('試読時点の世界内tick', { exact: true }).fill(tick); await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click(); await page.getByRole('button', { name: `${entry.name}から終える`, exact: true }).click(); await record(page);
      const saved = (await backup(page)).project, last = saved.entities.filter((row): row is Entity<'trace'> => row.kind === 'trace').at(-1)!;
      if (tick === '9') earlyTraceId = last.id; else lateTraceId = last.id;
    }
    await production(page); const review = page.locator('.production-review'), before = await authorFingerprint(page);
    await review.getByLabel('検査する経路の対象版', { exact: true }).selectOption(earlyTraceId); await review.getByLabel('検査時点の世界内tick', { exact: true }).fill('9'); await review.getByRole('button', { name: '口調・用語の候補を検査', exact: true }).click();
    await expect(review).toContainText('一人称「僕」'); await expect(review).not.toContainText('一人称「私」'); await expect(review).toContainText(`作者が宣言した例外: ${exception.reason}`); expect(await authorFingerprint(page)).toBe(before);
    await review.getByLabel('検査する経路の対象版', { exact: true }).selectOption(lateTraceId); await review.getByLabel('検査時点の世界内tick', { exact: true }).fill('10'); await review.getByRole('button', { name: '口調・用語の候補を検査', exact: true }).click();
  });
  await clause('AT-F48', 'then', async () => {
    const review = page.locator('.production-review'); await expect(review).toContainText('一人称「私」'); await expect(review).not.toContainText('一人称「僕」'); await expect(review).toContainText('表記候補「赤き扉」・標準「赤い扉」'); await expect(review).not.toContainText(`作者が宣言した例外: ${exception.reason}`);
    const candidateTargets: string[] = []; const buttons = review.getByRole('button', { name: '対象の本文位置を開く', exact: true });
    for (let index = 0; index < await buttons.count(); index++) { await buttons.nth(index).click(); const fixed = page.getByRole('dialog', { name: '固定版の参照先', exact: true }); await expect(fixed).toBeVisible(); candidateTargets.push(await fixed.getByRole('region', { name: '固定版の参照先', exact: true }).getByRole('heading', { level: 2 }).innerText()); await fixed.getByRole('button', { name: '閉じる', exact: true }).click(); await expect(fixed).toBeHidden(); }
    for (const row of [early, late, translation, subtitle]) expect(candidateTargets).toContain(row.name);
  });
  await clause('AT-F48', 'negative_or_edge', async () => {
    await page.reload(); const saved = (await backup(page)).project;
    for (const row of [early, late, translation, subtitle]) expect(saved.entities.find(entity => entity.id === row.id)?.data).toEqual(row.data);
    expect(findEntity(saved, beforeRule.id, 'voice_rule').data.validity).toEqual(beforeRule.data.validity); expect(findEntity(saved, afterRule.id, 'voice_rule').data.validity).toEqual(afterRule.data.validity); expect(findEntity(saved, term.id, 'terminology').data.exceptions).toEqual([exception]);
    await attachObservation(info, 'AT-F48-observed', { inspectedTicks: ['9', '10'], onePersonBefore: '僕', onePersonAfter: '私', intentionalException: exception, inspectedTextIds: [early.id, late.id, translation.id, subtitle.id], autoReplacedTextIds: [] });
  });
});

test('AT-F49 企画目的と版1採用判断へ修正指摘を結び、却下理由・保留・版2の別判断を通常登録する', async ({ page }, info) => {
  let p = createProject('AT-F49 企画目的と対象版付き判断');
  const brief = entity(p, 'creative_brief', '企画の目的', { targetAudience: textToRichText('推理を楽しむ読者'), experience: textToRichText('手掛かりから真相を考える体験'), theme: textToRichText('信頼と証言'), tone: textToRichText('静かな不安'), scope: textToRichText('今作一章の範囲') });
  p = await createWorldSnapshot(p, '公開済み企画版1'); const v1 = p.snapshots.at(-1)!;
  const adopted = entity(p, 'decision', '版1で採用した判断', { subject: '主題の見せ方', reason: textToRichText('証言を先に提示して信頼の主題を見せる'), targetVersionId: v1.id, outcome: 'accepted' }); brief.data.decisionIds = [adopted.id];
  let review!: Entity<'review'>, rejected!: Entity<'decision'>, deferred!: Entity<'decision'>, v2id = '';
  await clause('AT-F49', 'given', async () => { await given(page, info, 'AT-F49', p); await production(page); await expect(page.locator('.production-planning')).toContainText('手掛かりから真相を考える体験'); });
  await clause('AT-F49', 'when', async () => {
    review = await add(page, 'review', '主題を読者へ伝える修正指摘', { target: { entityId: brief.id }, targetVersionId: v1.id, body: textToRichText('企画の信頼と証言という主題に関わる修正依頼。'), stage: 'open' });
    rejected = await add(page, 'decision', '却下した真相先出し案', { subject: '主題の見せ方', reason: textToRichText('推理体験を失うため真相を先に出す案は却下'), targetVersionId: v1.id, outcome: 'rejected', reviewIds: [review.id] });
    deferred = await add(page, 'decision', '保留した語り手変更案', { subject: '語り手', reason: textToRichText('読者の試読を待って判断する'), targetVersionId: v1.id, outcome: 'deferred', reviewIds: [review.id] });
    await navigate(page, /^年表/); await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click(); await page.getByRole('tab', { name: '共通世界の固定版', exact: true }).click(); await page.getByLabel('新しい共通世界版の名称', { exact: true }).fill('通常画面で作成する企画版2'); await page.getByRole('button', { name: 'この内容を確定版として保存', exact: true }).click(); await expect(page.getByLabel('新しい共通世界版の名称', { exact: true })).toHaveValue(''); v2id = (await backup(page)).project.snapshots.at(-1)!.id;
    const changed = await add(page, 'decision', '版2で変更した別判断', { subject: '主題の見せ方', reason: textToRichText('証言の出所を明示して推理体験を保つ'), targetVersionId: v2id, outcome: 'accepted', reviewIds: [review.id] });
    await openEntity(page, 'creative_brief', brief.name); await editData(page, { ...brief.data, decisionIds: [adopted.id, rejected.id, deferred.id, changed.id] });
  });
  await clause('AT-F49', 'then', async () => {
    await openEntity(page, 'review', review.name); await expect(page.locator('.detail-panel')).toContainText('信頼と証言');
    await production(page); const panel = page.locator('.production-planning'); await expect(panel).toContainText('推理体験を失うため'); await expect(panel).toContainText('読者の試読を待って判断する'); await expect(panel).toContainText('rejected'); await expect(panel).toContainText('deferred');
    const saved = (await backup(page)).project; expect(findEntity(saved, review.id, 'review').data).toMatchObject({ target: { entityId: brief.id }, targetVersionId: v1.id }); expect(findEntity(saved, rejected.id, 'decision').data.reviewIds).toEqual([review.id]); expect(saved.entities.some(row => row.kind === 'decision' && row.data.targetVersionId === v2id && row.data.outcome === 'accepted')).toBe(true);
  });
  await clause('AT-F49', 'negative_or_edge', async () => {
    await page.reload(); const saved = (await backup(page)).project; expect(saved.snapshots.find(pin => pin.id === v1.id)).toEqual(v1); expect(findEntity(saved, adopted.id, 'decision').data.targetVersionId).toBe(v1.id);
    for (const row of [rejected, deferred]) expect(findEntity(saved, row.id, 'decision').deletedAt).toBeFalsy();
    await attachObservation(info, 'AT-F49-observed', { briefId: brief.id, reviewId: review.id, originalPublishedVersion: v1.id, laterDecisionVersion: v2id, rejectedReason: rejected.data.reason, deferredReason: deferred.data.reason, oldPublishedContentUnchanged: true });
  });
});

test('AT-F50 危険と書いた場面と無条件通過の仕様を探索・戦闘・報酬・導入・実装作業へ結び、意図付き確認候補にする', async ({ page }, info) => {
  const p = createProject('AT-F50 物語と遊びの差'), scene = entity(p, 'scene', '危険な場所を説明する場面', { summary: textToRichText('危険な城門であり、守護者との戦いが待つ。'), body: textToRichText('危険な城門を通り抜ける。') }), spec = entity(p, 'gameplay_spec', '無条件通過する実装仕様', { sceneId: scene.id, action: textToRichText('条件を調べず無条件に城門を通過する。'), mechanic: '無条件通過', intentionalDifference: '' });
  const writing = entity(p, 'production_task', '場面本文の執筆済み', { targetIds: [scene.id], stage: 'writing', progress: 'done' }), implementation = entity(p, 'production_task', 'ゲーム機能の実装未完了', { targetIds: [scene.id], stage: 'implementation', progress: 'todo', dependsOn: [writing.id] });
  const nativeRecords = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'views', 'commands', 'outbox', 'recordParts'];
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      })));
      return { fingerprint: JSON.stringify(rows), historyIds: rows[0][0].historyIds as string[], commandIds: rows[6].map(row => row.operationId as string), outboxIds: rows[7].map(row => row.operationId as string) };
    } finally { db.close(); }
  });
  let beforeReview!: Awaited<ReturnType<typeof backup>>, persistedProject!: Awaited<ReturnType<typeof backup>>['project'], nativeBefore!: Awaited<ReturnType<typeof nativeRecords>>, nativeSaved!: Awaited<ReturnType<typeof nativeRecords>>;
  await clause('AT-F50', 'given', async () => { await given(page, info, 'AT-F50', p); await production(page); const comparison = page.locator('.production-planning article.settings-card').filter({ has: page.getByRole('button', { name: spec.name, exact: true }) }); await expect(comparison).toContainText('危険な城門'); await expect(comparison).toContainText('無条件に城門を通過'); });
  await clause('AT-F50', 'when', async () => {
    await openEntity(page, 'gameplay_spec', spec.name); await editData(page, { ...spec.data, action: textToRichText('城門を探索し、守護者との戦闘を経て通過する。'), mechanic: '探索と戦闘の機能', reward: { type: 'integer', value: 5 }, tutorial: textToRichText('城門を調べ、戦闘の操作を確認してから進む。'), taskIds: [implementation.id], intentionalDifference: '導入区間では危険を演出しつつ、失敗による足止めを避けて通過を保証する意図' });
    beforeReview = await backup(page); nativeBefore = await nativeRecords(); expect(beforeReview.project.history).toHaveLength(1);
    await production(page); const comparison = page.locator('.production-planning article.settings-card').filter({ has: page.getByRole('button', { name: spec.name, exact: true }) }); await expect(comparison).toContainText('探索と戦闘の機能'); await expect(comparison).toContainText('チュートリアル'); await expect(comparison).toContainText('"value":5'); await comparison.getByRole('button', { name: '遊びと物語の差を確認候補へ保存', exact: true }).click(); await expect(comparison.getByRole('button', { name: '遊びと物語の差を確認候補へ保存', exact: true })).toBeEnabled(); await expect(page.locator('.production-planning').getByRole('alert')).toHaveCount(0);
  });
  await clause('AT-F50', 'then', async () => {
    const saved = (await backup(page)).project, candidate = saved.entities.find((row): row is Entity<'review'> => row.kind === 'review' && row.data.target === spec.id); expect(candidate).toBeDefined();
    const text = candidate!.data.body.map(block => block.text).join('\n'); expect(text).toContain('危険な城門'); expect(text).toContain('城門を探索し'); expect(text).toContain('通過を保証する意図'); expect(candidate!.data.stage).toBe('open'); expect(saved.snapshots.some(pin => pin.id === candidate!.data.targetVersionId)).toBe(true);
    expect(findEntity(saved, spec.id, 'gameplay_spec').data.taskIds).toEqual([implementation.id]); await attachObservation(info, 'AT-F50-intentional-difference-candidate', candidate);
    expect(saved.entities.filter(row => row.kind === 'review')).toHaveLength(1); expect(candidate!.visibility).toBe('private');
    const pin = saved.snapshots.find(pin => pin.id === candidate!.data.targetVersionId)!;
    const { history: _history, snapshots: _snapshots, authorAlternatives: _authorAlternatives, ...pinnedContent } = beforeReview.project;
    expect(pin.content).toEqual(pinnedContent); expect(pin.contentHash).toBe(await sha256(jsonBytes(pin.content)));
    expect(saved.snapshots).toEqual([...beforeReview.project.snapshots, pin]);
    expect(saved.entities.map(row => row.id)).toEqual([...beforeReview.project.entities.map(row => row.id), pin.id, candidate!.id]);
    for (const row of beforeReview.project.entities) expect(saved.entities.find(entity => entity.id === row.id)).toEqual(row);
    expect(findEntity(saved, pin.id, 'snapshot').data).toMatchObject({ immutable: true, contentHash: pin.contentHash, versionLabel: pin.versionLabel });
    expect(saved.history.slice(0, -1)).toEqual(beforeReview.project.history); expect(saved.history).toHaveLength(beforeReview.project.history.length + 1);
    const command = saved.history.at(-1)!; expect(command.baseRevision).toBe(beforeReview.project.revision); expect(command.revision).toBe(saved.revision);
    nativeSaved = await nativeRecords(); expect(nativeSaved.historyIds).toEqual(saved.history.map(command => command.operationId));
    expect(nativeSaved.commandIds).toEqual([...nativeBefore.commandIds, command.operationId].sort()); expect(nativeSaved.outboxIds).toEqual([...nativeBefore.outboxIds, command.operationId].sort());
    persistedProject = saved; await attachObservation(info, 'AT-F50-committed-history-and-native', { historyIds: nativeSaved.historyIds, commandIds: nativeSaved.commandIds, outboxIds: nativeSaved.outboxIds, pin });

  });
  await clause('AT-F50', 'negative_or_edge', async () => {
    await production(page); await expect(page.locator('.production-planning article').filter({ hasText: writing.name })).toContainText('writing · done'); await expect(page.locator('.production-planning article').filter({ hasText: implementation.name })).toContainText('implementation · todo');
    await page.reload(); const saved = (await backup(page)).project; expect(findEntity(saved, scene.id, 'scene').data).toEqual(scene.data); expect(findEntity(saved, writing.id, 'production_task').data.progress).toBe('done'); expect(findEntity(saved, implementation.id, 'production_task').data.progress).toBe('todo');
    expect(saved).toEqual(persistedProject); expect((await nativeRecords()).fingerprint).toBe(nativeSaved.fingerprint);
    await attachObservation(info, 'AT-F50-observed', { storySceneId: scene.id, gameplaySpecificationId: spec.id, authoredTaskDone: writing.id, implementationTaskPending: implementation.id, automaticallyRewrittenStory: false, differenceRequiresAuthorReview: true });
  });
});
