import { expect, test } from '@playwright/test';
import { createProject, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { attachObservation, authorFingerprint, backup, clause, editData, entity, findEntity, given, graph, openEntity, relation, timeline, timelineFixture } from './ap04-original-bm-helpers';

test('AT-B02 共通と二人の人物レーンから同じ出来事を編集し、共通表示だけでは人物や知識を増やさない', async ({ page }, info) => {
  const f = timelineFixture('AT-B02 共通と人物の年表');
  await clause('AT-B02', 'given', async () => { await given(page, info, 'AT-B02', f.p); await timeline(page); await page.getByRole('button', { name: '全体へ戻る', exact: true }).click(); });
  await clause('AT-B02', 'when', async () => {
    await page.locator('.common-lane').locator(`button[data-event-id="${f.shared.id}"]`).click();
    await expect(page.locator('#entity-name')).toHaveValue(f.shared.name);
    await editData(page, { ...f.shared.data, summary: textToRichText('共通レーンで編集した同一出来事') });
    await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  });
  await clause('AT-B02', 'then', async () => {
    for (const name of [f.a.name, f.b.name]) {
      const lane = page.locator('.timeline-lane').filter({ has: page.getByRole('button', { name, exact: true }) });
      await lane.locator(`button[data-event-id="${f.shared.id}"]`).click();
      await expect(page.locator('.detail-panel [data-field="summary"] textarea[data-rich-text-editor]')).toHaveValue('共通レーンで編集した同一出来事');
      await page.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
    }
  });
  await clause('AT-B02', 'negative_or_edge', async () => {
    await page.reload(); const saved = await backup(page);
    expect(findEntity(saved.project, f.common.id, 'event').data.participants).toEqual([]);
    expect(findEntity(saved.project, f.shared.id, 'event').data.participants).toEqual(f.shared.data.participants);
    expect(saved.project.entities.filter(e => e.kind === 'assertion')).toEqual([]);
    expect(saved.project.entities.filter(e => e.kind === 'character').map(e => e.id)).toEqual([f.a.id, f.b.id]);
    await attachObservation(info, 'AT-B02-observed', { eventId: f.shared.id, commonParticipants: [], unchangedRoles: f.shared.data.participants, assertionIds: [] });
  });
});

test('AT-B03 二重所属の同じ人物を折りたたみ・並替えし、削除影響を確認して人物と出来事を残す', async ({ page }, info) => {
  const f = timelineFixture('AT-B03 二重所属'), g1 = entity(f.p, 'group', '一つ目の所属', { groupType: 'display', members: [f.a.id] }), g2 = entity(f.p, 'group', '二つ目の所属', { groupType: 'display', members: [f.a.id, f.b.id] });
  await clause('AT-B03', 'given', async () => { expect(g1.data.members).toContain(f.a.id); expect(g2.data.members).toContain(f.a.id); await given(page, info, 'AT-B03', f.p); await timeline(page); });
  await clause('AT-B03', 'when', async () => {
    await page.getByRole('button', { name: 'グループ・人物レーン', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'グループ・人物レーンを編集' });
    await dialog.locator('.timeline-group-editor-row').filter({ hasText: g1.name }).getByRole('button', { name: '折りたたむ', exact: true }).click();
    await dialog.getByRole('button', { name: `${g1.name}を後へ`, exact: true }).click();
    await expect(dialog.locator('.timeline-group-editor-row').first()).toContainText(g2.name);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  });
  await clause('AT-B03', 'then', async () => {
    const reordered = await backup(page);
    expect(reordered.project.entities.filter(e => e.kind === 'group').map(e => e.id)).toEqual([g2.id, g1.id]);
    for (const record of [f.a, f.b, f.common, f.shared, g1, g2]) expect(findEntity(reordered.project, record.id, record.kind).data).toEqual(record.data);
  });
  await clause('AT-B03', 'negative_or_edge', async () => {
    await timeline(page); await page.getByRole('button', { name: 'グループ・人物レーン', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'グループ・人物レーンを編集' });
    await dialog.locator('.timeline-group-editor-row').filter({ hasText: g1.name }).getByRole('button', { name: '改名・階層・人物を編集', exact: true }).click();
    const before = await authorFingerprint(page);
    await dialog.getByRole('button', { name: 'グループを外す前に確認', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('人物と出来事の本体・IDは保持します。');
    expect(await authorFingerprint(page)).toBe(before);
    await dialog.getByRole('button', { name: '影響を確認してグループを外す', exact: true }).click();
    await expect(dialog.locator('.timeline-group-editor-row')).toHaveCount(1);
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.reload(); const saved = await backup(page);
    expect(saved.project.entities.map(e => e.id).sort()).toEqual(f.p.entities.map(e => e.id).sort());
    expect(findEntity(saved.project, g1.id, 'group').deletedAt).toBeTruthy();
    expect(findEntity(saved.project, g2.id, 'group').data.members).toContain(f.a.id);
    expect(findEntity(saved.project, g2.id, 'group').data).toEqual(g2.data);
    for (const record of [f.a, f.b, f.common, f.shared]) { expect(findEntity(saved.project, record.id, record.kind).deletedAt).toBeFalsy(); expect(findEntity(saved.project, record.id, record.kind).data).toEqual(record.data); expect(findEntity(saved.project, record.id, record.kind)).toEqual(record); }
    await attachObservation(info, 'AT-B03-observed', { orderedGroupIds: [g2.id, g1.id], archivedGroupId: g1.id, retainedPersonIds: [f.a.id, f.b.id], retainedEventIds: [f.common.id, f.shared.id] });
  });
});

test('AT-B04 横に長い年表を実スクロールし、固定レーン名と編集欄のスクロールを区別する', async ({ page }, info) => {
  const f = timelineFixture('AT-B04 過去と未来');
  f.common.data.time = { mode: 'instant', at: '-5000', calendarId: f.p.calendarId };
  f.shared.data.time = { mode: 'instant', at: '5000', calendarId: f.p.calendarId };
  await page.setViewportSize({ width: 390, height: 900 });
  await clause('AT-B04', 'given', async () => { await given(page, info, 'AT-B04', f.p); await timeline(page); await page.getByRole('button', { name: '全体へ戻る', exact: true }).click(); expect(await page.locator('.timeline-canvas').evaluate(n => n.scrollWidth > n.clientWidth)).toBe(true); });
  const canvas = page.locator('.timeline-canvas');
  await clause('AT-B04', 'when', async () => {
    await canvas.hover(); await page.mouse.wheel(1800, 0);
    await expect.poll(() => canvas.evaluate(n => n.scrollLeft)).toBeGreaterThan(0);
    const future = await canvas.evaluate(n => n.scrollLeft);
    await page.mouse.wheel(-1800, 0); await expect.poll(() => canvas.evaluate(n => n.scrollLeft)).toBeLessThan(future);
    await attachObservation(info, 'AT-B04-scroll', { futureScrollLeft: future, pastScrollLeft: await canvas.evaluate(n => n.scrollLeft) });
  });
  await clause('AT-B04', 'then', async () => {
    await canvas.hover(); await page.mouse.wheel(1800, 0); await expect.poll(() => canvas.evaluate(n => n.scrollLeft)).toBeGreaterThan(0);
    const bounds = (await canvas.boundingBox())!;
    for (const label of [page.locator('.timeline-axis .lane-label'), page.locator('.common-lane .lane-label'), page.locator('.timeline-lane').filter({ has: page.getByRole('button', { name: f.a.name, exact: true }) }).locator('.lane-label')]) {
      const box = (await label.boundingBox())!; expect(Math.abs(box.x - bounds.x)).toBeLessThan(4);
    }
    await page.locator('.common-lane').locator(`button[data-event-id="${f.shared.id}"]`).click();
    await editData(page, { ...f.shared.data, summary: textToRichText('未来の対象をスクロール後に編集') });
  });
  await clause('AT-B04', 'negative_or_edge', async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const before = await canvas.evaluate(n => n.scrollLeft);
    await page.locator('.editor-content').hover(); await page.mouse.wheel(0, 240);
    expect(await canvas.evaluate(n => n.scrollLeft)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.reload(); const saved = await backup(page); expect(findEntity(saved.project, f.shared.id, 'event').data.summary[0].text).toBe('未来の対象をスクロール後に編集');
  });
});

test('AT-B05 確定・不確定日時で表示単位と倍率だけを切替え、存在しない時単位は理由付き無効にする', async ({ page }, info) => {
  const f = timelineFixture('AT-B05 単位と倍率');
  const repeating = { id: 'fictional-days', name: '時を持たない独自暦', kind: 'repeating' as const, originLabel: '元日', ticksPerDay: '1', years: [{ months: [{ name: '一月', days: 30 }] }] };
  f.p.calendars.push(repeating); f.p.calendarId = repeating.id;
  f.common.data.time = { mode: 'instant', at: '-20', calendarId: repeating.id };
  f.shared.data.time = { mode: 'uncertain', earliest: '20', latest: '30', precision: '日程調整中', calendarId: repeating.id };
  const line = relation(f.p, f.common.id, f.shared.id, 'causes'); line.validity.routeCondition = { op: 'constant', value: true };
  await clause('AT-B05', 'given', async () => { await given(page, info, 'AT-B05', f.p); await timeline(page); });
  const before = await authorFingerprint(page);
  await clause('AT-B05', 'when', async () => {
    for (const unit of ['day', 'month', 'year', 'tick']) { await page.getByLabel('年表の表示単位', { exact: true }).selectOption(unit); await page.getByRole('button', { name: '年表を拡大', exact: true }).click(); await page.getByRole('button', { name: '年表を縮小', exact: true }).click(); }
  });
  await clause('AT-B05', 'then', async () => { expect(await authorFingerprint(page)).toBe(before); const saved = await backup(page); expect(saved.project.entities.filter(e => e.kind === 'event').map(e => e.data)).toEqual([f.common.data, f.shared.data]); expect(saved.project.relations[0]).toMatchObject({ ...line }); });
  await clause('AT-B05', 'negative_or_edge', async () => {
    await timeline(page); const hour = page.getByLabel('年表の表示単位', { exact: true }).locator('option[value="hour"]');
    await expect(hour).toHaveJSProperty('disabled', true); await expect(hour).toHaveAttribute('title', 'この暦には時の定義がありません。'); await expect(hour).toHaveText('時（この暦には時の定義がありません。）');
    expect(await authorFingerprint(page)).toBe(before);
  });
});

test('AT-B06 本編基準だけを変更し、前後出来事の絶対tickと内容を保持して相対表示を変える', async ({ page }, info) => {
  const f = timelineFixture('AT-B06 本編開始');
  await clause('AT-B06', 'given', async () => { await given(page, info, 'AT-B06', f.p); await timeline(page); });
  const beforeContext = await page.locator('.timeline-context').textContent();
  await clause('AT-B06', 'when', async () => {
    await page.getByRole('button', { name: '本編開始の基準を変更', exact: true }).click(); const dialog = page.getByRole('dialog', { name: '本編開始の基準を変更' });
    await dialog.getByLabel('本編開始の世界内tick', { exact: true }).fill('10'); await dialog.getByRole('button', { name: '本編の基準を保存', exact: true }).click(); await expect(dialog).toHaveCount(0);
  });
  await clause('AT-B06', 'then', async () => { await expect(page.locator('.timeline-context')).toContainText('本編開始 10 tick'); expect(await page.locator('.timeline-context').textContent()).not.toBe(beforeContext); });
  await clause('AT-B06', 'negative_or_edge', async () => { await page.reload(); const saved = await backup(page); expect(saved.project.mainStart).toBe('10'); for (const e of [f.common, f.shared]) expect(findEntity(saved.project, e.id, 'event').data).toEqual(e.data); await attachObservation(info, 'AT-B06-observed', { mainStart: saved.project.mainStart, retainedTimes: saved.project.entities.filter(e => e.kind === 'event').map(e => e.data.time) }); });
});

test('AT-B07 二つの出来事をタップで結び、同じ関係IDを一覧で再編集し型に合わない対象を選べない', async ({ page }, info) => {
  const f = timelineFixture('AT-B07 始点と終点');
  await clause('AT-B07', 'given', async () => { await given(page, info, 'AT-B07', f.p); await timeline(page); await page.getByRole('button', { name: '全体へ戻る', exact: true }).click(); });
  await clause('AT-B07', 'when', async () => {
    await page.getByRole('button', { name: '始点 → 終点をタップで結ぶ', exact: true }).click();
    await page.locator('.common-lane').locator(`button[data-event-id="${f.common.id}"]`).click();
    await expect(page.getByRole('status').filter({ hasText: '始点' }).first()).toBeVisible();
    await page.locator('.common-lane').locator(`button[data-event-id="${f.shared.id}"]`).click();
    const dialog = page.getByRole('dialog', { name: '年表の関係を編集' });
    await dialog.getByLabel('年表の関係の種類', { exact: true }).selectOption('causes'); await dialog.getByRole('button', { name: '関係を保存', exact: true }).click(); await expect(dialog).toHaveCount(0);
  });
  let id = '';
  const openRelationTable = async () => {
    await timeline(page);
    await page.getByRole('tab', { name: '関係表・図', exact: true }).click();
    await page.getByRole('button', { name: '関係表', exact: true }).click();
    const row = page.locator(`.world-relation-table article[data-relation-id="${id}"]`);
    await expect(row).toHaveCount(1);
    await row.locator('button.world-relation-meaning').click();
    const dialog = page.getByRole('dialog', { name: '意味付きの関係を編集', exact: true });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  await clause('AT-B07', 'then', async () => {
    const saved = await backup(page); expect(saved.project.relations).toHaveLength(1); id = saved.project.relations[0].id; expect(saved.project.relations[0]).toMatchObject({ fromId: f.common.id, toId: f.shared.id, relationType: 'causes' });
    await timeline(page); const timelineLine = page.locator(`button[data-relation-id="${id}"]`); await expect(timelineLine).toHaveCount(1); await timelineLine.click();
    const timelineDialog = page.getByRole('dialog', { name: '年表の関係を編集', exact: true });
    await expect(timelineDialog).toContainText(`関係ID ${id}`);
    await expect(timelineDialog.getByLabel('年表の関係の始点', { exact: true })).toHaveValue(f.common.id);
    await expect(timelineDialog.getByLabel('年表の関係の終点', { exact: true })).toHaveValue(f.shared.id);
    await expect(timelineDialog.getByLabel('年表の関係の種類', { exact: true })).toHaveValue('causes');
    await timelineDialog.getByLabel('年表の関係の種類', { exact: true }).selectOption('requires');
    await timelineDialog.getByRole('button', { name: '関係を保存', exact: true }).click(); await expect(timelineDialog).toHaveCount(0);
    const timelineUpdated = await backup(page); expect(timelineUpdated.project.relations).toHaveLength(1); expect(timelineUpdated.project.relations[0]).toMatchObject({ id, fromId: f.common.id, toId: f.shared.id, relationType: 'requires' }); expect(BigInt(timelineUpdated.project.revision)).toBeGreaterThan(BigInt(saved.project.revision));
    const dialog = await openRelationTable();
    await expect(dialog.getByLabel('関係の始点', { exact: true })).toHaveValue(f.common.id);
    await expect(dialog.getByLabel('関係の終点', { exact: true })).toHaveValue(f.shared.id);
    await expect(dialog.getByLabel('関係の種類', { exact: true })).toHaveValue('requires');
    await dialog.getByLabel('関係の種類', { exact: true }).selectOption('requires'); await dialog.getByLabel('関係の始点', { exact: true }).selectOption(f.common.id); await dialog.getByLabel('関係の終点', { exact: true }).selectOption(f.shared.id); await dialog.getByRole('button', { name: '関係を保存', exact: true }).click(); await expect(dialog).toHaveCount(0);
    const updated = await backup(page); expect(updated.project.relations).toHaveLength(1); expect(updated.project.relations[0]).toMatchObject({ id, relationType: 'requires' });
    expect(updated.project.relations[0]).toMatchObject({ fromId: f.common.id, toId: f.shared.id }); expect(BigInt(updated.project.revision)).toBeGreaterThan(BigInt(timelineUpdated.project.revision));
  });
  await clause('AT-B07', 'negative_or_edge', async () => {
    const dialog = await openRelationTable(); const before = await authorFingerprint(page);
    await dialog.getByLabel('関係の種類', { exact: true }).selectOption('trust');
    await expect(dialog.getByLabel('関係の始点', { exact: true }).locator(`option[value="${f.common.id}"]`)).toHaveCount(0);
    await expect(dialog.getByLabel('関係の終点', { exact: true }).locator('option[value="ffffffff-ffff-4fff-8fff-ffffffffffff"]')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '関係を保存', exact: true })).toBeDisabled();
    expect(await authorFingerprint(page)).toBe(before);
    // A disabled selector proves prevention, but this original clause also
    // Requires the computed rejection reason as well as the disabled action.
    await expect(dialog).toContainText(/人物.*人物|人物同士|人物間/);
    await expect(dialog.getByRole('status')).toHaveText('この関係は人物から人物へ結びます。存在する人物を始点に選んでください。');
  });
});

test('AT-B09 年表の二人の関係を図で更新し、配置だけは所属・時期・関係を変えず詳細の同IDへ戻る', async ({ page }, info) => {
  const f = timelineFixture('AT-B09 図と年表'), group = entity(f.p, 'group', '同じ所属', { groupType: 'faction', members: [f.a.id, f.b.id] }), row = relation(f.p, f.a.id, f.b.id, 'trust'); row.validity.worldRange = { start: '0', end: '100' };
  await clause('AT-B09', 'given', async () => { await given(page, info, 'AT-B09', await createWorldSnapshot(f.p, '元の関係')); await graph(page); });
  const before = await authorFingerprint(page);
  await clause('AT-B09', 'negative_or_edge', async () => { await page.getByRole('button', { name: `${f.a.name}を選択。矢印キーで配置を移動、Enterで詳細`, exact: true }).press('ArrowRight'); expect(await authorFingerprint(page)).toBe(before); });
  await clause('AT-B09', 'when', async () => {
    await page.getByRole('button', { name: `${f.a.name}から${f.b.name}へ、信頼、関係を編集`, exact: true }).click(); const dialog = page.getByRole('dialog', { name: '意味付きの関係を編集' });
    await dialog.getByLabel('関係の種類', { exact: true }).selectOption('related'); await dialog.getByLabel('関係の始点', { exact: true }).selectOption(f.a.id); await dialog.getByLabel('関係の終点', { exact: true }).selectOption(f.b.id); await dialog.getByRole('button', { name: '関係を保存', exact: true }).click(); await expect(dialog).toHaveCount(0);
    await timeline(page); await page.getByRole('button', { name: '全体へ戻る', exact: true }).click(); await page.getByRole('button', { name: f.a.name, exact: true }).click();
  });
  await clause('AT-B09', 'then', async () => {
    await expect(page.locator('#entity-name')).toHaveValue(f.a.name); await expect(page.locator('.detail-panel')).toContainText('関連');
    // The original then requires the relation's period at the opened detail.
    // A relation type alone does not establish that observation.
    await expect(page.locator('.detail-panel')).toContainText(/0\s*(?:tick|〜|～|→).*100/);
    const saved = await backup(page); expect(saved.project.relations[0]).toMatchObject({ id: row.id, relationType: 'related', validity: row.validity }); expect(findEntity(saved.project, group.id, 'group').data).toEqual(group.data); for (const e of [f.a, f.b, f.shared]) expect(findEntity(saved.project, e.id, e.kind).data).toEqual(e.data);
    await attachObservation(info, 'AT-B09-observed', { relationId: row.id, validity: saved.project.relations[0].validity, sourceIds: [f.a.id, f.b.id], placementOnlyPreservedDurableRecords: true });
  });
});
test('AT-B21 未定日時からの日数範囲を保存し、相対循環と存在しない暦日で正本を変更しない', async ({ page }, info) => {
  const p = createProject('AT-B21 未定と相対制約'), pending = entity(p, 'event', '日付が未定の先行出来事', { time: { mode: 'unknown', reason: '先行日付はまだ決めていない' }, laneRole: 'common' }), relative = entity(p, 'event', '先行から二日から四日後', { time: { mode: 'relative', anchorEventId: pending.id, anchorPoint: 'end', minOffset: '172800', maxOffset: '345600' }, laneRole: 'common' });
  const openTime = async (name: string, id: string) => { await timeline(page); await page.getByRole('button', { name: '出来事一覧', exact: true }).click(); await page.locator(`.event-table-row[data-event-id="${id}"]`).click(); await page.getByRole('button', { name: '選択した出来事の日時・制約', exact: true }).click(); return page.getByRole('dialog', { name: `日時・前後関係 · ${name}`, exact: true }); };
  await clause('AT-B21', 'given', async () => { expect(p.calendars[0]).toMatchObject({ kind: 'gregorian', ticksPerDay: '86400' }); await given(page, info, 'AT-B21', p); expect(pending.data.time.mode).toBe('unknown'); expect(relative.data.time.mode).toBe('relative'); });
  await clause('AT-B21', 'when', async () => {
    const modal = await openTime(pending.name, pending.id); await modal.getByRole('button', { name: '日時制約を追加', exact: true }).click(); await modal.getByLabel('日時制約1の種類', { exact: true }).selectOption('end_gap'); await modal.getByLabel('日時制約1の対象', { exact: true }).selectOption(relative.id); await modal.getByLabel('日時制約1の時間差の入力単位', { exact: true }).selectOption('day'); await modal.getByLabel('日時制約1の時間差の最小', { exact: true }).fill('2'); await modal.getByLabel('日時制約1の時間差の最大', { exact: true }).fill('4'); await modal.getByRole('button', { name: '変更前の影響を確認', exact: true }).click(); await modal.getByRole('button', { name: '差分を一括確定', exact: true }).click(); await expect(modal).toBeHidden();
  });
  await clause('AT-B21', 'then', async () => {
    const saved = await backup(page); expect(findEntity(saved.project, pending.id, 'event').data.time).toEqual(pending.data.time); expect(findEntity(saved.project, relative.id, 'event').data.time).toEqual(relative.data.time); expect(findEntity(saved.project, pending.id, 'event').data.constraints).toEqual([{ type: 'end_gap', targetEventId: relative.id, minimumTicks: '172800', maximumTicks: '345600' }]);
    let modal = await openTime(relative.name, relative.id); await expect(modal.getByLabel('相対日時の基準', { exact: true })).toHaveValue(pending.id); await expect(modal.getByLabel('相対日時の差の最小', { exact: true })).toHaveValue('172800'); await expect(modal.getByLabel('相対日時の差の最大', { exact: true })).toHaveValue('345600'); await modal.getByLabel('相対日時の差の入力単位', { exact: true }).selectOption('day'); await expect(modal.getByLabel('相対日時の差の最小', { exact: true })).toHaveValue('2'); await expect(modal.getByLabel('相対日時の差の最大', { exact: true })).toHaveValue('4'); await modal.getByRole('button', { name: '変更を中止', exact: true }).click(); modal = await openTime(pending.name, pending.id); await expect(modal.getByLabel('日時未定の理由', { exact: true })).toHaveValue('先行日付はまだ決めていない'); await modal.getByRole('button', { name: '変更を中止', exact: true }).click(); await attachObservation(info, 'AT-B21-range', { pending: findEntity(saved.project, pending.id, 'event').data, relative: findEntity(saved.project, relative.id, 'event').data });
  });
  await clause('AT-B21', 'negative_or_edge', async () => {
    const original = await authorFingerprint(page); let modal = await openTime(pending.name, pending.id); await modal.getByLabel('日時の種類', { exact: true }).selectOption('relative'); await modal.getByLabel('相対日時の基準', { exact: true }).selectOption(relative.id); await modal.getByRole('button', { name: '変更前の影響を確認', exact: true }).click(); await expect(modal).toContainText('循環'); await expect(modal.getByRole('button', { name: '差分を一括確定', exact: true })).toBeDisabled(); expect(await authorFingerprint(page)).toBe(original); await modal.getByRole('button', { name: '変更を中止', exact: true }).click();
    modal = await openTime(pending.name, pending.id); await modal.getByLabel('日時の種類', { exact: true }).selectOption('instant'); await modal.getByRole('button', { name: '暦の年月日', exact: true }).click(); await modal.getByLabel('出来事の世界内tickの年', { exact: true }).fill('2025'); await modal.getByLabel('出来事の世界内tickの月', { exact: true }).fill('2'); await modal.getByLabel('出来事の世界内tickの日', { exact: true }).fill('30'); await expect(modal.getByRole('alert')).toContainText('暦に存在しない日付'); await expect(modal.getByRole('button', { name: '変更前の影響を確認', exact: true })).toBeDisabled(); expect(await authorFingerprint(page)).toBe(original); await modal.getByRole('button', { name: '変更を中止', exact: true }).click();
  });
});
