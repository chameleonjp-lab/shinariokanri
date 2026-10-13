import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, emptyValidity, newId, textToRichText } from '../../src/domain/model';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, navigate, seed } from './ap04-original-helpers';

// The execution budget covers normal forms, two actual downloads and cold
// verification. It does not change any original acceptance limit.
test.setTimeout(180_000);

async function catalog(page: Page, tab: '複合検索・一覧' | '五十音・分類索引') {
  await navigate(page, /^検索/); await page.getByRole('tab', { name: tab, exact: true }).click(); return page.locator('.search-page');
}
async function readerArtifact(page: Page, profileId: string, format: 'html' | 'markdown') {
  await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profileId);
  await page.getByLabel('出力目的', { exact: true }).selectOption('reader');
  await page.getByLabel('本文の出力形式', { exact: true }).selectOption(format);
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-artifact')).toHaveCount(1);
  const pending = page.waitForEvent('download'); await page.locator('.export-artifact').getByRole('button', { name: 'この内容を保存', exact: true }).click();
  return await readFile((await (await pending).path())!, 'utf8');
}

test('AT-F57 読み/旧名/別名/同名を原文と別に探し、作者の分類索引から実段落へ移り、秘密の読み・別名・参照数を出さない公開索引を保存する', async ({ page }, info) => {
  const p = createProject('AT-F57 原文と作者索引');
  const oldName = { id: newId(), text: '旧青葉 光', reading: 'キュウアオバ ヒカル', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false };
  const alias = { id: newId(), text: '蒼い門番', reading: 'アオイモンバン', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false };
  const firstBody = textToRichText('青井光の原文🌸：全文だけの合言葉。\n検索の正規化で、この二段落を変更しない。');
  const sameBody = textToRichText('同じ漢字名でも別の固定IDを持つ人物。');
  const first = createEntity(p.projectId, 'character', '青井光', { reading: 'ｱｵｲ ﾋｶﾙ', aliases: [oldName, alias], body: firstBody, authorNotes: textToRichText('公開しない作者の補足。') });
  const same = createEntity(p.projectId, 'character', '青井光', { reading: 'アオイ ミツ', body: sameBody });
  const hiddenAlias = { id: newId(), text: '秘密の旧戸籍', reading: 'ヒミツノキュウコセキ', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false };
  const secretBody = textToRichText('秘密人物だけの本文。');
  const secret = createEntity(p.projectId, 'character', '夜蔭の真名', { reading: 'ヤインシンメイ', aliases: [hiddenAlias], body: secretBody });
  // Author-defined tags use an existing typed template field. A tag's value
  // participates in full text search; it does not become an index term or an
  // author-selected category merely because a text query matched it.
  const template = createEntity(p.projectId, 'template', '人物のタグ雛形', { targetKind: 'character', fields: [{ key: 'catalogTag', label: 'タグ', type: 'enum', required: false, nullable: false, default: '勇者', allowedValues: ['勇者', '学者'] }] });
  first.templateId = template.id; first.customValues.catalogTag = '勇者';
  const category = createEntity(p.projectId, 'group', '作者が選んだ人物索引', { groupType: 'category', members: [same.id, secret.id] });
  const hiddenReferences = Array.from({ length: 17 }, (_, i) => createEntity(p.projectId, 'event', `秘密人物への非公開参照${i + 1}`, { participants: [{ characterId: secret.id, role: 'actor' }] }));
  const publicFirst = structuredClone(firstBody), publicSame = structuredClone(sameBody), blockSources: Record<string, string> = {};
  for (const block of [...publicFirst, ...publicSame]) { const source = block.id; block.id = newId(); blockSources[block.id] = source; }
  const profile = createEntity(p.projectId, 'projection_profile', '秘密を除く公開索引', {
    audience: 'reader', publicTitle: '公開の人物索引', includedIds: [first.id, same.id, secret.id, category.id], allowedKinds: ['character', 'group'], idPolicy: 'preserve',
    namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: { [first.id]: { mode: 'replace', replacement: first.name }, [same.id]: { mode: 'replace', replacement: same.name }, [category.id]: { mode: 'replace', replacement: category.name } } },
    publicTexts: { [first.id]: { reading: 'あおいひかる', body: publicFirst }, [same.id]: { reading: 'あおいみつ', body: publicSame }, [category.id]: {} }, blockSources,
  });
  p.entities.push(first, same, secret, template, category, ...hiddenReferences, profile); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  const bytes = await exportScenario(p);
  await attachGiven(info, 'AT-F57', bytes, { sameNameIds: [first.id, same.id], originalReading: first.data.reading, oldNameId: oldName.id, aliasId: alias.id, secretId: secret.id, secretAliasId: hiddenAlias.id, secretReferenceIds: hiddenReferences.map(entity => entity.id), authorCategoryId: category.id, tagTemplateId: template.id, tagField: 'catalogTag', sourceBlockIds: firstBody.map(block => block.id), publicBlockIds: publicFirst.map(block => block.id), profileId: profile.id });
  await seed(page, bytes); const initial = await authorFingerprint(page), panel = await catalog(page, '複合検索・一覧');
  for (const query of ['あおいひかる', 'アオイ ヒカル', 'ｱｵｲ ﾋｶﾙ', 'きゅうあおばひかる', '蒼い門番']) {
    await panel.getByLabel('作品内を検索', { exact: true }).fill(query);
    await expect(panel.locator('.entity-card').filter({ has: page.getByRole('heading', { name: first.name, exact: true }) })).toHaveCount(1);
  }
  await panel.getByLabel('作品内を検索', { exact: true }).fill('全文だけの合言葉');
  await expect(panel.getByRole('region', { name: '本文の検索位置', exact: true })).toContainText(firstBody[0].text);
  await panel.getByLabel('作品内を検索', { exact: true }).fill('勇者');
  // All-kind full text also searches the author's enum definition: both the
  // character's tag value and its template's default/allowed value match.
  // Identify the complete result set through normal detail navigation.
  const tagTextMatches = [first, template], tagTextMatchIds: string[] = [];
  await expect(panel.locator('.entity-card')).toHaveCount(tagTextMatches.length);
  expect((await panel.locator('.entity-card').getByRole('heading', { level: 3 }).allTextContents()).sort())
    .toEqual(tagTextMatches.map(entity => entity.name).sort());
  for (const expected of tagTextMatches) {
    const card = panel.locator('.entity-card').filter({ has: page.getByRole('heading', { name: expected.name, exact: true }) });
    await expect(card).toHaveCount(1);
    await card.click();
    const detail = page.locator('.detail-panel');
    const identity = detail.locator('details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: /^IDと履歴情報$/ }) });
    if ((await identity.getAttribute('open')) === null) await identity.locator('summary').click();
    const fixedId = identity.locator('dl.record-meta dd').first();
    await expect(fixedId).toBeVisible(); await expect(fixedId).toHaveText(expected.id);
    tagTextMatchIds.push(await fixedId.innerText());
    await detail.getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  }
  expect(tagTextMatchIds.sort()).toEqual([first.id, template.id].sort());
  expect(tagTextMatchIds).not.toContain(same.id); expect(tagTextMatchIds).not.toContain(secret.id);
  expect(await authorFingerprint(page)).toBe(initial);
  await catalog(page, '五十音・分類索引'); await expect(panel.locator('button.reference-link')).toHaveCount(0);
  await panel.getByLabel('作品内を検索', { exact: true }).fill('全文だけの合言葉'); await expect(panel.locator('button.reference-link')).toHaveCount(0);
  await panel.getByLabel('作品内を検索', { exact: true }).fill('アオイ');
  const sameNameRows = panel.locator('button.reference-link').filter({ hasText: /^青井光/ });
  await expect(sameNameRows).toHaveCount(2); await expect(sameNameRows.filter({ hasText: first.id.slice(0, 8) })).toHaveCount(1); await expect(sameNameRows.filter({ hasText: same.id.slice(0, 8) })).toHaveCount(1);
  expect(await authorFingerprint(page)).toBe(initial);
  await sameNameRows.filter({ hasText: first.id.slice(0, 8) }).click();
  const index = page.getByRole('dialog', { name: '索引の項目を編集', exact: true });
  await expect(index.getByLabel('読み', { exact: true })).toHaveValue(first.data.reading!);
  await index.getByRole('checkbox', { name: /作者が選んだ人物索引/ }).check();
  await index.getByRole('button', { name: '索引項目を保存', exact: true }).click(); await expect(index).toHaveCount(0);
  await panel.getByLabel('索引の分類', { exact: true }).selectOption(category.name);
  await sameNameRows.filter({ hasText: first.id.slice(0, 8) }).click();
  const beforeNavigation = await authorFingerprint(page);
  await page.evaluate(() => {
    const events: unknown[] = [];
    Reflect.set(window, '__ap04F57Focus', events);
    const describe = (element: Element | null) => element && { tag: element.tagName, id: element.id, connected: element.isConnected, field: element.closest<HTMLElement>('[data-field]')?.dataset.field ?? null, ...(element instanceof HTMLTextAreaElement ? { selectionStart: element.selectionStart, selectionEnd: element.selectionEnd } : {}) };
    events.push({ event: 'armed', at: performance.now(), documentHasFocus: document.hasFocus(), active: describe(document.activeElement) });
    for (const type of ['focus', 'blur', 'focusin', 'focusout', 'select']) document.addEventListener(type, event => {
      if (events.length < 500) events.push({ event: type, at: performance.now(), documentHasFocus: document.hasFocus(), target: describe(event.target instanceof Element ? event.target : null), active: describe(document.activeElement) });
    }, true);
    for (const type of ['focus', 'blur']) window.addEventListener(type, event => {
      if (event.target !== window) return;
      if (events.length < 500) events.push({ event: `window-${type}`, at: performance.now(), documentHasFocus: document.hasFocus(), target: { kind: 'window' }, active: describe(document.activeElement) });
    });
  });
  try {
    await index.getByRole('button', { name: 'この項目の本文を開く', exact: true }).click(); await expect(index).toHaveCount(0);
    const body = page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true });
    await expect(body).toBeFocused(); await expect(body).toHaveValue(firstBody.map(block => block.text).join('\n'));
    expect(await body.evaluate((input: HTMLTextAreaElement) => input.value.slice(input.selectionStart, input.selectionEnd))).toBe(firstBody[0].text);
  } finally {
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const events: unknown = Reflect.get(window, '__ap04F57Focus');
      if (!Array.isArray(events)) throw new Error('AT-F57 focus observation is unavailable');
      return { events, documentHasFocus: document.hasFocus(), finalActive: active && { tag: active.tagName, id: active.id, connected: active.isConnected, field: active.closest<HTMLElement>('[data-field]')?.dataset.field ?? null, ...(active instanceof HTMLTextAreaElement ? { selectionStart: active.selectionStart, selectionEnd: active.selectionEnd } : {}) }, navigationAlerts: [...document.querySelectorAll('.detail-panel > .error-notice')].map(element => element.textContent), dialogs: [...document.querySelectorAll('dialog[open]')].map(element => element.getAttribute('aria-labelledby')) };
    });
    await info.attach('AT-F57-body-focus-observation.json', { body: Buffer.from(JSON.stringify(focus, null, 2)), contentType: 'application/json' });
  }
  expect(await authorFingerprint(page)).toBe(beforeNavigation);
  await page.locator('.detail-panel').getByRole('button', { name: '詳細を閉じる', exact: true }).click();
  const html = await readerArtifact(page, profile.id, 'html'), markdown = await readerArtifact(page, profile.id, 'markdown');
  await info.attach('AT-F57-public-index.html', { body: Buffer.from(html), contentType: 'text/html' }); await info.attach('AT-F57-public-index.md', { body: Buffer.from(markdown), contentType: 'text/markdown' });
  expect(html).toContain('<nav aria-label="五十音・分類索引">'); expect(markdown).toContain('## 五十音・分類索引');
  for (const [document, format] of [[html, 'html'], [markdown, 'markdown']] as const) {
    expect(document).toContain('青井光'); expect(document).toContain('あおいひかる'); expect(document).toContain(category.name);
    for (const excluded of [secret.name, secret.id, secret.data.reading!, hiddenAlias.text, hiddenAlias.reading, hiddenAlias.id, secretBody[0].id, oldName.text, oldName.id, alias.text, alias.id, '公開しない作者の補足。', '秘密人物だけの本文。', '参照数', 'referenceCount', '17件', 'catalogTag', '勇者']) expect(document).not.toContain(excluded);
    const links = format === 'html' ? [...document.matchAll(/href="#([^"]+)"/g)].map(match => match[1]) : [...document.matchAll(/\]\(#([^\)]+)\)/g)].map(match => decodeURIComponent(match[1]));
    expect(links).toContain(publicFirst[0].id); expect(links).toContain(publicSame[0].id);
    for (const target of links) expect(document).toContain(`id="${target}"`);
    for (const block of publicFirst) expect(document).toContain(block.text);
    expect(document).not.toContain(`href="#${category.id}"`);
  }
  expect(await authorFingerprint(page)).toBe(beforeNavigation);
  await page.reload(); const saved = await backup(page);
  for (const original of [first, same, secret, template, ...hiddenReferences, profile]) {
    const retained = saved.project.entities.find(entity => entity.id === original.id); expect(retained?.data).toEqual(original.data); expect(retained?.customValues).toEqual(original.customValues); expect(retained?.name).toBe(original.name);
  }
  const savedCategory = saved.project.entities.find(entity => entity.id === category.id);
  expect(savedCategory?.kind === 'group' ? savedCategory.data.members : undefined).toEqual([same.id, secret.id, first.id]);
  await catalog(page, '五十音・分類索引'); await panel.getByLabel('作品内を検索', { exact: true }).fill('ｱｵｲ ﾋｶﾙ');
  await expect(panel.locator('button.reference-link').filter({ hasText: /^青井光/ }).filter({ hasText: first.id.slice(0, 8) })).toContainText('青井光');
  await attachObservation(info, 'AT-F57-observed', { originalIds: [first.id, same.id, secret.id], originalReadingUnchanged: true, sourceBlockIds: firstBody.map(block => block.id), authorClassificationId: category.id, authorTagField: 'catalogTag', tagAndFullTextNotIndexTerms: true, actualParagraphSelected: firstBody[0].id, indexModalClosedBeforeBodyNavigation: true, publicIndexBlockTargets: [publicFirst[0].id, publicSame[0].id], actualFormats: ['html', 'markdown'], excludedSecretReferenceCount: hiddenReferences.length, revision: saved.project.revision });
});
