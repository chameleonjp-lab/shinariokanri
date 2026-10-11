import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario, inspectScenario } from '../../src/storage/archive';
import type { Entity, ProjectData } from '../../src/domain/types';

async function nav(page: Page, name: RegExp) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function seed(page: Page, bytes: Uint8Array, mode: 'new' | 'clone' = 'new') {
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'candidate-ignore.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  if (mode === 'clone') await page.getByLabel('復元方法', { exact: true }).selectOption('clone');
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.import-preview')).toBeHidden();
  await expect(page.locator('.app-shell')).toBeVisible();
}
async function openScene(page: Page, name: string) {
  await nav(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
  await page.getByRole('tab', { name: '本文', exact: true }).click();
}
async function backup(page: Page) {
  await nav(page, /^作品・保存/);
  await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '完全保存ファイルを作成', exact: true }).click();
  const bytes = new Uint8Array(await readFile((await (await pending).path())!));
  await test.info().attach('candidate-ignore-complete.scenario', { body: Buffer.from(bytes), contentType: 'application/zip' });
  return { bytes, project: (await inspectScenario(bytes, { worker: false })).project };
}
async function fresh(browser: Browser, bytes: Uint8Array, mode: 'new' | 'clone') {
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); await seed(page, bytes, mode); await page.reload();
    return (await backup(page)).project;
  } finally { await context.close(); }
}

test('通常本文で同名人物と一般語を選び分け、候補の除外をcold保持して実リンクと旧版を完全復元する', async ({ page, browser, browserName }) => {
  test.setTimeout(240000);
  await test.info().attach('browser-environment.json', { body: JSON.stringify({ browserName, actualVersion: browser.version(), viewport: page.viewportSize(), physicalDevice: false, actualAuthRlsStorage: false }), contentType: 'application/json' });
  let project = createProject('原B10/F27 二人の葵と一般語');
  const first = createEntity(project.projectId, 'character', '葵', { reading: 'あおい', summary: textToRichText('門番の葵'), aliases: [{ id: newId(), text: '青い子', reading: 'あおいこ', validity: { worldRange: null, routeCondition: null, presentationAnchor: null }, audienceHolderIds: [], isPublicDefault: false }] });
  const second = createEntity(project.projectId, 'character', '葵', { reading: 'あおい', summary: textToRichText('旅人の葵') });
  const body = textToRichText('😀葵が葵の花を持ち、青い子と会う。');
  const scene = createEntity(project.projectId, 'scene', '葵と普通の葵を選び分ける本文', { body });
  project.entities.push(first, second, scene); project.entities.forEach(entity => { entity.status = 'confirmed'; });
  project = await createWorldSnapshot(project, 'リンク前の固定版');
  const pin = project.snapshots.at(-1)!, input = await exportScenario(project);
  await test.info().attach('candidate-ignore-fixture.scenario', { body: Buffer.from(input), contentType: 'application/zip' });
  await seed(page, input); await openScene(page, scene.name);
  const annotations = page.getByRole('region', { name: '本文のルビとリンク', exact: true });
  const candidates = annotations.getByLabel('本文に見つかった候補', { exact: true });
  const options = () => candidates.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: (node as HTMLOptionElement).value, label: node.textContent ?? '' })));
  const initial = await options(), aoi = initial.filter(option => option.label.includes('「葵」'));
  expect(aoi.length).toBeGreaterThanOrEqual(4);
  for (const person of [first, second]) expect(aoi.some(option => option.label.includes(person.id.slice(-6)))).toBe(true);
  const unlinked = await backup(page);
  expect((unlinked.project.entities.find(entity => entity.id === scene.id) as Entity<'scene'>).data.body[0].links ?? []).toEqual([]);
  await openScene(page, scene.name);
  const selected = aoi.find(option => option.label.includes(first.id.slice(-6)) && option.label.includes('2〜2文字目'))!;
  expect(selected).toBeTruthy(); await candidates.selectOption(selected.value);
  await annotations.getByRole('button', { name: 'リンクを付ける', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const alias = (await options()).find(option => option.label.includes('「青い子」'))!;
  expect(alias).toBeTruthy(); await candidates.selectOption(alias.value);
  await annotations.getByRole('button', { name: 'リンクを付ける', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  for (const person of [first, second]) {
    const common = (await options()).find(option => option.label.includes(person.id.slice(-6)) && option.label.includes('「葵」') && option.label.includes('4〜4文字目'))!;
    expect(common).toBeTruthy(); await candidates.selectOption(common.value);
    await annotations.getByRole('button', { name: 'この語句とリンク先の候補を表示しない', exact: true }).click();
  }
  await annotations.getByRole('button', { name: /参照元/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText(scene.name);
  await page.getByRole('dialog').getByRole('button', { name: /閉じる/ }).first().click();
  await page.reload(); await openScene(page, scene.name);
  const coldOptions = await options();
  expect(coldOptions.some(option => option.label.includes('「葵」'))).toBe(false);
  expect(coldOptions.some(option => option.label.includes('「青い子」'))).toBe(true);
  const cold = await backup(page), saved = cold.project.entities.find((entity): entity is Entity<'scene'> => entity.id === scene.id && entity.kind === 'scene')!;
  expect(saved.data.body[0].id).toBe(body[0].id); expect(saved.data.body[0].text).toBe(body[0].text);
  expect(saved.data.body[0].links?.map(link => ({ start: link.start, end: link.end, entityId: link.target.entityId }))).toEqual([{ start: 1, end: 2, entityId: first.id }, { start: 10, end: 13, entityId: first.id }]);
  expect(cold.project.snapshots.find(snapshot => snapshot.id === pin.id)).toEqual(pin);
  expect(await fresh(browser, cold.bytes, 'new')).toEqual(cold.project);
  const clone = await fresh(browser, cold.bytes, 'clone'), people = clone.entities.filter((entity): entity is Entity<'character'> => entity.kind === 'character');
  expect(people).toHaveLength(2); expect(clone.projectId).not.toBe(cold.project.projectId);
  const clonedFirst = people.find(person => person.data.summary?.[0].text === '門番の葵')!, clonedScene = clone.entities.find((entity): entity is Entity<'scene'> => entity.kind === 'scene')!;
  expect(clonedFirst.id).not.toBe(first.id); expect(clonedScene.data.body[0].text).toBe(body[0].text);
  expect(clonedScene.data.body[0].links?.map(link => link.target.entityId)).toEqual([clonedFirst.id, clonedFirst.id]);
  await test.info().attach('candidate-ignore-observations.json', { body: JSON.stringify({ initialCandidates: initial, coldCandidates: coldOptions, selectedID: first.id, blockID: body[0].id, authoredLinks: saved.data.body[0].links, oldPinID: pin.id, preferenceScope: 'Same local account/project/source on this device. No transfer of local preferences through the complete file or actual Auth claim.' }), contentType: 'application/json' });
});
