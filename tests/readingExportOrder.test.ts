import { expect, it } from 'vitest';
import { createEntity, createProject, textToRichText } from '../src/domain/model';
import { exportProject } from '../src/domain/exports';
import { moveChapterPresentation, projectContent } from '../src/domain/writingWorkspace';
import { jsonBytes, sha256 } from '../src/storage/json';

it('reader Markdown and HTML follow the chosen version chapter order rather than inclusion-list order', async () => {
  let project = createProject('章の順序');
  const first = createEntity(project.projectId, 'chapter', '第一章');
  const second = createEntity(project.projectId, 'chapter', '第二章');
  const sceneA = createEntity(project.projectId, 'scene', '場面A', { chapterId: first.id });
  const sceneB = createEntity(project.projectId, 'scene', '場面B', { chapterId: second.id });
  first.data.sceneIds = [sceneA.id]; second.data.sceneIds = [sceneB.id];
  const selected = [first, second, sceneA, sceneB];
  selected.forEach(entity => { entity.status = 'confirmed'; });
  const profile = createEntity(project.projectId, 'projection_profile', '読者版', {
    audience: 'reader', includedIds: selected.map(entity => entity.id), allowedKinds: ['chapter', 'scene'],
    namePolicy: { byEntityId: Object.fromEntries(selected.map(entity => [entity.id, { mode: 'replace' as const, replacement: entity.name }])) }, publicTitle: '公開作品',
    publicTexts: { [sceneA.id]: { body: textToRichText('公開本文A') }, [sceneB.id]: { body: textToRichText('公開本文B') } },
  });
  project.entities = [...selected, profile];
  const content = projectContent(project);
  const snapshot = { id: crypto.randomUUID(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: '元の章順', createdAt: new Date().toISOString() };
  project.snapshots = [snapshot];
  project = moveChapterPresentation(project, second.id, -1);
  for (const readerFormat of ['markdown', 'html'] as const) {
    for (const fixed of [false, true]) {
      const result = await exportProject(project, { profile: 'reader', projectionProfileId: profile.id, readerFormat, ...(fixed ? { targetVersionId: snapshot.id } : { targetRevision: project.revision }) });
      expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
      const output = result.artifact.content;
      expect(output.indexOf(fixed ? '公開本文A' : '公開本文B')).toBeLessThan(output.indexOf(fixed ? '公開本文B' : '公開本文A'));
    }
  }
  expect(profile.data.includedIds).toEqual(selected.map(entity => entity.id));
});
