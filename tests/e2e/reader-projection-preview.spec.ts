import { expect, test } from '@playwright/test';
import { readFile } from './downloadEvidence';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { projectContent } from '../../src/domain/writingWorkspace';
import { jsonBytes, sha256 } from '../../src/storage/json';

test('reader preview opens the last fixed chapter and matches the saved recipient output without author secrets', async ({ page }) => {
  const project = createProject('SECRET_AUTHOR_TITLE');
  const chapters = Array.from({ length: 3 }, (_, index) => createEntity(project.projectId, 'chapter', `章${index + 1}`));
  const scenes = chapters.map(chapter => createEntity(project.projectId, 'scene', 'SECRET_SCENE', { chapterId: chapter.id, authorNotes: textToRichText('SECRET_AUTHOR_PHRASE') }));
  chapters.forEach((chapter, index) => { chapter.data.sceneIds = [scenes[index].id]; });
  const included = [...chapters, ...scenes];
  const profiles = ['甲', '乙'].map(recipient => createEntity(project.projectId, 'projection_profile', `${recipient}さんに渡す範囲`, {
    audience: recipient, publicTitle: '公開作品', publicVersionLabel: `${recipient}さん用一版`, includedIds: included.map(entity => entity.id), allowedKinds: ['chapter', 'scene'],
    namePolicy: { byEntityId: Object.fromEntries(included.map((entity, index) => [entity.id, { mode: 'replace' as const, replacement: index < 3 ? entity.name : `公開場面${index - 2}` }])) },
    publicTexts: Object.fromEntries(scenes.map((scene, index) => [scene.id, { body: textToRichText(index === 2 ? `${recipient}さんだけの最後の本文` : '公開文'.repeat(2200)) }])),
  }));
  [...included, ...profiles].forEach(entity => { entity.status = 'confirmed'; });
  project.entities = [...included, ...profiles];
  const content = projectContent(project), pin = { id: crypto.randomUUID(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: '固定した旧稿', createdAt: new Date().toISOString() };
  project.snapshots.push(pin);
  profiles[1].data.publicTexts![scenes[2].id].body = textToRichText('現在稿だけの新しい本文');
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'reader.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await page.locator('.app-shell').waitFor();
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name: /^作品・保存/ }).first().click();
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
  await page.getByLabel('出力する作品版', { exact: true }).selectOption(pin.id);
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profiles[1].id);
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await page.getByRole('button', { name: '読者として読む', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('読者用の章', { exact: true }).selectOption({ label: '章3' });
  const body = page.frameLocator('iframe[title="読者用の本文"]').locator('body');
  await expect(body).toContainText('乙さんだけの最後の本文');
  await expect(body).not.toContainText('SECRET');
  await expect(body).not.toContainText('現在稿だけ');
  await expect(dialog).not.toContainText('出力から除かれる内容');
  await expect(dialog).toContainText('乙さん用一版');
  await dialog.getByRole('button', { name: '前の章', exact: true }).click();
  await expect(dialog.getByLabel('読者用の章', { exact: true }).locator('option:checked')).toHaveText('章2');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.locator('.export-artifact').getByRole('button', { name: 'この内容を保存', exact: true }).click();
  const saved = await readFile((await (await download).path())!, 'utf8');
  expect(saved).toContain('乙さんだけの最後の本文');
  expect(saved).not.toContain('甲さんだけ');
  expect(saved).not.toContain('SECRET');
  expect(saved).not.toContain('現在稿だけ');
});

test('reader preview follows approved paragraph and selection links across pages without exposing author data', async ({page}) => {
  const project = createProject('SECRET_AUTHOR_TITLE');
  const first = createEntity(project.projectId, 'chapter', '公開章1'), second = createEntity(project.projectId, 'chapter', '公開章2');
  const person = createEntity(project.projectId, 'character', 'SECRET_PERSON', {
    body: textToRichText('公開した人物本文 <script>window.previewNavigationInjected=1</script>'), authorNotes: textToRichText('SECRET_PERSON_NOTES')});
  const a = createEntity(project.projectId, 'scene', 'SECRET_FIRST', {chapterId: first.id, body: textToRichText('人物と次の章を読む'), authorNotes: textToRichText('SECRET_FIRST_NOTES')});
  const b = createEntity(project.projectId, 'scene', 'SECRET_SECOND', {chapterId: second.id, body: textToRichText('公開した次の章本文')});
  first.data.sceneIds = [a.id]; second.data.sceneIds = [b.id];
  a.data.body[0].links = [
    {start: 0, end: 2, target: {entityId: person.id, blockId: person.data.body![0].id, start: 0, end: 2}},
    {start: 3, end: 5, target: {entityId: b.id, blockId: b.data.body[0].id}},
  ];
  const included = [first, second, person, a, b];
  const profile = createEntity(project.projectId, 'projection_profile', '読者用の範囲', {
    audience: 'reader', publicTitle: '公開した本', publicVersionLabel: '公開一版', includedIds: included.map(entity => entity.id),
    allowedKinds: ['chapter', 'scene', 'character'],
    namePolicy: {byEntityId: Object.fromEntries(included.map((entity, index) => [entity.id, {mode: 'replace' as const, replacement: ['公開章1', '公開章2', '公開人物', '公開場面1', '公開場面2'][index]}]))},
    publicTexts: {[person.id]: {body: structuredClone(person.data.body!)}, [a.id]: {body: structuredClone(a.data.body)}, [b.id]: {body: structuredClone(b.data.body)}},
  });
  [...included, profile].forEach(entity => {entity.status = 'confirmed';});
  project.entities = [...included, profile];
  await page.goto('./');
  await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name: 'preview-links.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(project))});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click();
  await page.locator('.app-shell').waitFor();
  const menu = page.getByRole('button', {name: 'メニューを開く', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', {name: /^作品・保存/}).first().click();
  await page.getByRole('tab', {name: '目的別出力', exact: true}).click();
  await page.getByLabel('出力する公開範囲', {exact: true}).selectOption(profile.id);
  await page.getByRole('button', {name: '内容を検査・プレビュー', exact: true}).click();
  await page.getByRole('button', {name: '読者として読む', exact: true}).click();
  const dialog = page.getByRole('dialog'), picker = dialog.getByLabel('読者用の章', {exact: true});
  const frame = page.frameLocator('iframe[title="読者用の本文"]');
  const links = frame.getByRole('link', {name: /^関連/});
  const href = (await links.nth(0).getAttribute('href'))!, personTarget = href.slice(href.indexOf('#') + 1);
  const frameNavigations: string[] = [];
  page.on('request', request => {if (request.isNavigationRequest() && request.frame().parentFrame()) frameNavigations.push(request.url());});
  await links.nth(0).click();
  await expect(picker.locator('option:checked')).toHaveText('人物・資料・引用版');
  const selection = frame.locator(`[id="${personTarget}"]`);
  await expect(selection).toHaveText('公開');
  await expect(selection).toBeFocused();
  await expect(frame.locator('script')).toHaveCount(0);
  expect(await frame.locator('body').evaluate(() => (window as unknown as {previewNavigationInjected?: number}).previewNavigationInjected)).toBeUndefined();
  await expect(frame.locator('body')).not.toContainText('SECRET');
  await picker.selectOption({label: '公開章1'});
  await links.nth(1).click();
  await expect(picker.locator('option:checked')).toHaveText('公開章2');
  await expect(frame.getByText('公開した次の章本文', {exact: true})).toBeFocused();
  await expect(frame.locator('body')).not.toContainText('SECRET');
  await expect(dialog).not.toContainText('SECRET');
  expect(frameNavigations).toEqual([]);
});
