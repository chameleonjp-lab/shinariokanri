import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, seed } from './ap04-original-helpers';

async function timeline(page: Page) {
  await navigate(page, /^年表/); await page.getByRole('tab', { name: '世界内年表', exact: true }).click();
}
async function chapterReading(page: Page) {
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '章の試読', exact: true }).click();
}
async function timeEditor(page: Page, id: string, name: string) {
  await timeline(page); await page.getByRole('button', { name: '全体へ戻る', exact: true }).click();
  await page.locator('.common-lane').locator(`button[data-event-id="${id}"]`).click();
  const close = page.locator('.detail-panel').getByRole('button', { name: '詳細を閉じる', exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole('button', { name: '選択した出来事の日時・制約', exact: true }).click();
  return page.getByRole('dialog', { name: `日時・前後関係 · ${name}`, exact: true });
}

test('AT-E02 -10tickの後章回想を同じ作品で単位・基準・章順変更し、存在しない暦日と相対循環を拒否する', async ({ page }, info) => {
  const p = createProject('AT-E02 世界の時刻と後章の開示順');
  const past = createEntity(p.projectId, 'event', '世界tick-10の出来事', { laneRole: 'common', time: { mode: 'instant', at: '-10', calendarId: p.calendarId }, summary: textToRichText('本編以前に起きた秘密を後章で回想する。') });
  const relative = createEntity(p.projectId, 'event', '回想対象の翌tick', { laneRole: 'common', time: { mode: 'relative', anchorEventId: past.id, anchorPoint: 'start', minOffset: '1', maxOffset: '1' } });
  const present = createEntity(p.projectId, 'event', '本編現在の出来事', { laneRole: 'common', time: { mode: 'instant', at: '0', calendarId: p.calendarId } });
  const first = createEntity(p.projectId, 'chapter', '本編を先に提示する章');
  const flashback = createEntity(p.projectId, 'chapter', '過去を後から開示する回想章');
  const currentScene = createEntity(p.projectId, 'scene', '本編現在の提示', { chapterId: first.id, eventIds: [present.id], body: textToRichText('現在の出来事だけを先に示す。') });
  const memoryScene = createEntity(p.projectId, 'scene', 'tick-10の回想提示', { chapterId: flashback.id, eventIds: [past.id], body: textToRichText('ここで初めてtick-10の秘密を開示する。') });
  first.data.sceneIds = [currentScene.id]; flashback.data.sceneIds = [memoryScene.id];
  p.entities.push(past, relative, present, first, flashback, currentScene, memoryScene);
  p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await test.step('AT-E02 given: 世界tick -10の出来事を後章で回想する作品', async () => {
    await attachGiven(info, 'AT-E02', bytes, { pastId: past.id, worldTick: '-10', chapterOrder: [first.id, flashback.id], opening: currentScene.id, laterDisclosure: memoryScene.id, relativeAnchor: relative.data.time });
    await seed(page, bytes); await chapterReading(page);
    expect(await page.locator('.chapter-reading-sequence > li').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-scene-id')))).toEqual([currentScene.id, memoryScene.id]);
    await timeline(page); await page.getByLabel('年表の表示単位', { exact: true }).selectOption('tick');
    await expect(page.locator('.timeline-context')).toContainText('中心の本編基準 0 tick');
  });
  await test.step('AT-E02 when: 表示単位、本編基準点、回想章順をそれぞれ変更する', async () => {
    const before = await authorFingerprint(page);
    await page.getByLabel('年表の表示単位', { exact: true }).selectOption('day');
    await page.getByLabel('年表の表示単位', { exact: true }).selectOption('tick');
    expect(await authorFingerprint(page)).toBe(before);
    await page.getByRole('button', { name: '本編開始の基準を変更', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '本編開始の基準を変更', exact: true });
    await dialog.getByLabel('本編開始の世界内tick', { exact: true }).fill('10');
    await dialog.getByRole('button', { name: '本編の基準を保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.timeline-context')).toContainText('中心の本編基準 −10 tick');
    await navigate(page, /^構成/); await page.getByRole('tab', { name: '章・本文', exact: true }).click();
    await page.getByRole('button', { name: `${flashback.name}を上へ`, exact: true }).click();
    await chapterReading(page);
    expect(await page.locator('.chapter-reading-sequence > li').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-scene-id')))).toEqual([memoryScene.id, currentScene.id]);
  });
  await test.step('AT-E02 then: 世界tickは不変、相対表示と開示順だけが所定に変わる', async () => {
    const saved = await backup(page);
    expect(saved.project.mainStart).toBe('10');
    expect(saved.project.entities.filter(entity => entity.kind === 'chapter').map(entity => entity.id)).toEqual([flashback.id, first.id]);
    for (const original of [past, relative, present, currentScene, memoryScene]) expect(saved.project.entities.find(entity => entity.id === original.id)?.data).toEqual(original.data);
  });
  await test.step('AT-E02 negative_or_edge: 暦の存在しない日付と相対制約循環は拒否される', async () => {
    const before = await authorFingerprint(page);
    let dialog = await timeEditor(page, past.id, past.name);
    await dialog.getByRole('button', { name: '暦の年月日', exact: true }).click();
    await dialog.getByLabel('出来事の世界内tickの年', { exact: true }).fill('1');
    await dialog.getByLabel('出来事の世界内tickの月', { exact: true }).fill('2');
    await dialog.getByLabel('出来事の世界内tickの日', { exact: true }).fill('30');
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '変更前の影響を確認', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '変更を中止', exact: true }).click();
    expect(await authorFingerprint(page)).toBe(before);
    dialog = await timeEditor(page, past.id, past.name);
    await dialog.getByLabel('日時の種類', { exact: true }).selectOption('relative');
    await dialog.getByLabel('相対日時の基準', { exact: true }).selectOption(relative.id);
    await dialog.getByRole('button', { name: '変更前の影響を確認', exact: true }).click();
    await expect(dialog).toContainText('循環');
    await expect(dialog.getByRole('button', { name: '差分を一括確定', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '変更を中止', exact: true }).click();
    expect(await authorFingerprint(page)).toBe(before);
    await page.reload(); const saved = await backup(page);
    expect(saved.project.entities.find(entity => entity.id === past.id)).toMatchObject({ data: { time: { mode: 'instant', at: '-10' } } });
    await attachObservation(info, 'AT-E02-observed', { absoluteTicksUnchanged: true, mainStart: saved.project.mainStart, chapterOrder: saved.project.entities.filter(entity => entity.kind === 'chapter').map(entity => entity.id), retainedPast: saved.project.entities.find(entity => entity.id === past.id)?.data, rejectedInvalidCalendarDay: '0001-02-30', rejectedRelativeCycle: [past.id, relative.id, past.id] });
  });
});
