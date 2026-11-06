import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEntity, createProject, emptyValidity, textToRichText } from '../src/domain/model';
import { exportProject, renderReaderHtml, renderReaderMarkdown } from '../src/domain/exports';
import { ReaderProjectionPreview } from '../src/ui/ReaderProjectionPreview';
import { buildPublicReaderPages } from '../src/domain/publicCatalog';
import { projectContent } from '../src/domain/writingWorkspace';
import { jsonBytes, sha256 } from '../src/storage/json';

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
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('出力から除かれる内容');
    const pages = buildPublicReaderPages(output.projection);
    expect(pages.slice(0, 3).map(page => page.title)).toEqual(['公開名0', '公開名1', '公開名2']);
    expect(JSON.stringify(pages[2])).toContain('末尾を超えた最後の章');
    expect(pages.flatMap(page => page.projection.entities.map(entity => entity.id))).toEqual(expect.arrayContaining(output.projection.entities.map(entity => entity.id)));
    expect(result.preview.omissions.some(item => item.entityId === secret.id)).toBe(true);
  }
});
