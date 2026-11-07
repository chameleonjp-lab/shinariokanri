import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEntity, createProject, emptyValidity, textToRichText } from '../src/domain/model';
import { exportProject, renderReaderHtml, renderReaderMarkdown } from '../src/domain/exports';
import { ReaderProjectionPreview } from '../src/ui/ReaderProjectionPreview';
import { buildPublicReaderPages } from '../src/domain/publicCatalog';
import { projectContent } from '../src/domain/writingWorkspace';
import { jsonBytes, sha256 } from '../src/storage/json';
import type {PublicProjection} from '../src/domain/projection';

it('prepares every chapter and public-only reader surfaces from the selected recipient and fixed version', async () => {
  const project = createProject('SECRET_AUTHOR_TITLE');
  const chapters = Array.from({ length: 3 }, (_, index) => createEntity(project.projectId, 'chapter', `SECRET_CHAPTER_${index}`));
  const scenes = chapters.map(chapter => createEntity(project.projectId, 'scene', 'SECRET_SCENE', { chapterId: chapter.id, body: textToRichText('SECRET_AUTHOR_PHRASE') }));
  chapters.forEach((chapter, index) => { chapter.data.sceneIds = [scenes[index].id]; });
  const attachment = createEntity(project.projectId, 'attachment', 'SECRET_ATTACHMENT', { mediaType: 'text/plain', contentHash: 'a'.repeat(64), assetPath: 'assets/public.txt', byteSize: 0 });
  const secret = createEntity(project.projectId, 'note', 'SECRET_NOTE', { body: textToRichText('SECRET_AUTHOR_PHRASE') });
  const included = [...chapters, ...scenes, attachment];
  const policy = createEntity(project.projectId, 'projection_profile', 'SECRET_RECIPIENT_POLICY', {
    audience: 'reader', publicTitle: '公開作品', publicVersionLabel: '配布一版',
    includedIds: [...included.map(entity => entity.id), secret.id], allowedKinds: ['chapter', 'scene', 'attachment'], approvedAttachmentIds: [attachment.id],
    namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(included.map((entity, index) => [entity.id, { mode: 'replace' as const, replacement: `公開名${index}` }])) },
    publicTexts: Object.fromEntries(scenes.map((scene, index) => [scene.id, { body: textToRichText(index === 2 ? '末尾を超えた最後の章' : '公開文'.repeat(2500)) }])),
  });
  [...included, policy].forEach(entity => { entity.status = 'confirmed'; });
  project.entities = [...included, secret, policy];
  const relationId = crypto.randomUUID();
  project.relations = [{ id: relationId, projectId: project.projectId, revision: '0', fromId: scenes[0].id, toId: scenes[2].id, relationType: 'related', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' }];
  policy.data.allowedRelationIds = [relationId];
  policy.data.publicTexts![relationId] = { relationType: '公開されたつながり' };
  const content = projectContent(project), pin = { id: crypto.randomUUID(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: '固定稿', createdAt: new Date().toISOString() };
  project.snapshots.push(pin);
  policy.data.publicTexts![scenes[2].id].body = textToRichText('現在稿だけの変更');
  for (const readerFormat of ['markdown', 'html'] as const) {
    const result = await exportProject(project, { profile: 'reader', projectionProfileId: policy.id, targetVersionId: pin.id, readerFormat });
    expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
    if (!result.ok) throw new Error('Expected reader export');
    expect(result.readerOutput).toBeDefined();
    const output = result.readerOutput!;
    expect(JSON.stringify(output)).not.toContain('SECRET');
    expect(JSON.stringify(output)).not.toContain('omissions');
    expect(JSON.stringify(output)).not.toContain('現在稿だけの変更');
    expect(result.artifact.content).toBe(readerFormat === 'html' ? renderReaderHtml(output.projection, output.versionLabel) : renderReaderMarkdown(output.projection, output.versionLabel));
    expect(result.artifact.content).toContain('公開名6');
    expect(result.artifact.content.includes('公開されたつながり')).toBe(true);
    const html = renderToStaticMarkup(createElement(ReaderProjectionPreview, { output }));
    expect(html).toContain('読者用の章');
    expect(html).toContain('ここで迷った');
    expect(html).toContain('返さずに終了');
    expect(html).not.toContain('確認した控えをファイルに保存');
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('出力から除かれる内容');
    const pages = buildPublicReaderPages(output.projection);
    expect(pages.slice(0, 3).map(page => page.title)).toEqual(['公開名0', '公開名1', '公開名2']);
    expect(JSON.stringify(pages[2])).toContain('末尾を超えた最後の章');
    expect(pages.flatMap(page => page.projection.entities.map(entity => entity.id))).toEqual(expect.arrayContaining(output.projection.entities.map(entity => entity.id)));
    expect(result.preview.omissions.some(item => item.entityId === secret.id)).toBe(true);
  }
});

function publicMaterialFixture() {
  const project = createProject('SECRET_SOURCE');
  const group = createEntity(project.projectId, 'group', 'SECRET_GROUP');
  const place = createEntity(project.projectId, 'place', 'SECRET_PLACE');
  const map = createEntity(project.projectId, 'map', 'SECRET_MAP', { placeId: place.id });
  const attachment = createEntity(project.projectId, 'attachment', 'SECRET_FILE', { mediaType: 'audio/wav', contentHash: 'b'.repeat(64), assetPath: 'assets/secret.wav', byteSize: 0, displayName: 'SECRET_RAW_FILENAME.wav' });
  const entities = [group, place, map, attachment];
  const policy = createEntity(project.projectId, 'projection_profile', 'SECRET_POLICY', {
    audience: 'reader', publicTitle: 'Approved materials', includedIds: entities.map(entity => entity.id),
    allowedKinds: ['group', 'place', 'map', 'attachment'], approvedAttachmentIds: [attachment.id],
    namePolicy: { byEntityId: Object.fromEntries(entities.map((entity, index) => [entity.id, { mode: 'replace' as const, replacement: ['Approved empty group', 'Approved place', 'Approved map', 'Public attachment entity'][index] }])) },
    publicTexts: { [attachment.id]: { displayName: 'Approved filename.wav' } },
  });
  [...entities, policy].forEach(entity => { entity.status = 'confirmed'; });
  project.entities = [...entities, policy];
  return { project, policy };
}

it.each(['markdown', 'html'] as const)('keeps the preview catalog and %s artifact entries for approved kinds without prose', async readerFormat => {
  const { project, policy } = publicMaterialFixture();
  const result = await exportProject(project, { profile: 'reader', projectionProfileId: policy.id, targetRevision: project.revision, readerFormat });
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
  if (!result.ok || !result.readerOutput) throw new Error('Expected prepared reader output');
  const modal = renderToStaticMarkup(createElement(ReaderProjectionPreview, { output: result.readerOutput }));
  for (const term of ['Approved empty group', 'Approved map']) {
    expect(modal.includes(term)).toBe(true);
    expect(result.artifact.content.includes(term)).toBe(true);
    const entity = result.readerOutput.projection.entities.find(entity => entity.name === term)!;
    const indexLink = readerFormat === 'html' ? `<a href="#${entity.id}">${term}</a>` : `- [${term}](#${entity.id})`;
    expect(result.artifact.content.includes(indexLink)).toBe(true);
    const materialPage = buildPublicReaderPages(result.readerOutput.projection).find(page => page.projection.entities.some(item => item.id === entity.id))!;
    expect(renderReaderHtml(materialPage.projection).includes(`<section id="${entity.id}">`)).toBe(true);
    expect(result.artifact.content.includes(readerFormat === 'html' ? `<section id="${entity.id}">` : `<a id="${entity.id}"></a>`)).toBe(true);
  }
  expect(modal).not.toContain('SECRET');
  expect(result.artifact.content).not.toContain('SECRET');
});

it.each(['markdown', 'html'] as const)('shows the same approved attachment entity and filename in preview and %s artifact', async readerFormat => {
  const { project, policy } = publicMaterialFixture();
  const result = await exportProject(project, { profile: 'reader', projectionProfileId: policy.id, targetRevision: project.revision, readerFormat });
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
  if (!result.ok || !result.readerOutput) throw new Error('Expected prepared reader output');
  const modal = renderToStaticMarkup(createElement(ReaderProjectionPreview, { output: result.readerOutput }));
  expect(modal.includes('Public attachment entity · Approved filename.wav')).toBe(true);
  const savedLabel = readerFormat === 'html' ? 'Public attachment entity · Approved filename.wav' : 'Public attachment entity · Approved filename\\.wav';
  expect(result.artifact.content.includes(savedLabel)).toBe(true);
  expect(modal).not.toContain('SECRET_RAW_FILENAME');
  expect(result.artifact.content).not.toContain('SECRET_RAW_FILENAME');
});

it('keeps the declared scene order of the complete artifact when paging a chapter', () => {
  const projection: PublicProjection = {format: 'scenario-projection', formatVersion: '1.0.0', title: '並べた本文', calendars: [], relations: [], searchIndex: [], entities: [
    {id: 'chapter', kind: 'chapter', name: '章', status: 'confirmed', data: {sceneIds: ['second', 'first']}},
    {id: 'first', kind: 'scene', name: '先に作った場面', status: 'confirmed', data: {body: [{id: 'first-text', kind: 'paragraph', text: '後から読む本文'}]}},
    {id: 'second', kind: 'scene', name: '後で作った場面', status: 'confirmed', data: {body: [{id: 'second-text', kind: 'paragraph', text: '先に読む本文'}]}},
  ]};
  const page = buildPublicReaderPages(projection)[0];
  expect(page.projection.entities.map(entity => entity.id)).toEqual(['chapter', 'second', 'first']);
  for (const html of [renderReaderHtml(projection), renderReaderHtml(page.projection)]) {
    expect(html.indexOf('<p id="second-text">')).toBeLessThan(html.indexOf('<p id="first-text">'));
  }
});
