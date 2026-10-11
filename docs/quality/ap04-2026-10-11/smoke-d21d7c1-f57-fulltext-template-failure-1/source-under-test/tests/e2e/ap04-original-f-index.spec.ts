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
  await panel.getByLabel('作品内を検索', { exact: true }).fill('勇者'); await expect(panel.locator('.entity-card')).toHaveCount(1);
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
  await index.getByRole('button', { name: 'この項目の本文を開く', exact: true }).click(); await expect(index).toHaveCount(0);
  const body = page.locator('.detail-panel').getByRole('textbox', { name: '本文', exact: true });
  await expect(body).toBeFocused(); await expect(body).toHaveValue(firstBody.map(block => block.text).join('\n'));
  expect(await body.evaluate((input: HTMLTextAreaElement) => input.value.slice(input.selectionStart, input.selectionEnd))).toBe(firstBody[0].text);
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
