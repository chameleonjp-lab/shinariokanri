import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText, validateProject } from '../domain/model';
import { addChangeReviews } from '../domain/changeReviews';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { appendAlternativeVersion, applyAlternativeChanges, diffAuthorAlternative, forkAuthorAlternative, headAlternativeContent, recordAlternativeApplication } from '../domain/writingWorkspace';
import type { Entity, ProjectData } from '../domain/types';
import { ScenarioStore } from './store';

const stores: ScenarioStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });

it('rejects unrelated adoption content and forged generated-review metadata atomically, then persists the exact derived review', async () => {
  const databaseName = `independent-adoption-guard-${newId()}`;
  const store = new ScenarioStore({ databaseName }); stores.push(store);
  let project = createProject('独立した採用保存の確認');
  const first = createEntity(project.projectId, 'character', '最初の視点');
  const second = createEntity(project.projectId, 'character', '別案の視点');
  const scene = createEntity(project.projectId, 'scene', '視点を変える場面', { povId: first.id });
  const chapter = createEntity(project.projectId, 'chapter', '参照する章', { sceneIds: [scene.id] });
  scene.data.chapterId = chapter.id; project.entities = [chapter, scene, first, second];
  project = (await store.saveProject(project, { reason: '正本を保存', includeHistory: false })).project;

  let alternative = forkAuthorAlternative(project, '視点を変える案');
  const content = headAlternativeContent(alternative);
  (content.entities.find(entity => entity.id === scene.id) as Entity<'scene'>).data.povId = second.id;
  alternative = await sealAuthorAlternative(appendAlternativeVersion(alternative, content, '視点を変更'));
  project = (await store.saveProject({ ...project, authorAlternatives: [alternative] }, { reason: '別案を保存', includeHistory: false })).project;
  alternative = project.authorAlternatives![0]!;
  const changes = diffAuthorAlternative(alternative, project);
  const pov = changes.find(change => change.itemId === scene.id && change.path.join('.') === 'data.povId')!;
  const application = applyAlternativeChanges(project, alternative, changes, new Set([pov.key]));
  expect(application.project.history).toBe(project.history);
  application.project.authorAlternatives = [await sealAuthorAlternative(recordAlternativeApplication(alternative, application.receipt, (BigInt(project.revision) + 1n).toString()))];
  const reviewed = addChangeReviews(project, application.project);
  const generated = reviewed.entities.find((entity): entity is Entity<'review'> => entity.kind === 'review' && entity.customValues['changeReview.generatedBy'] === 'semantic-change-review/v1')!;
  expect(generated).toBeDefined();
  expect(generated.revision).toBe('0');

  const mutations: Array<[string, (draft: ProjectData, review: Entity<'review'>) => void]> = [
    ['unrelated note', draft => draft.entities.push(createEntity(project.projectId, 'note', '未選択の情報'))],
    ['unrelated review', draft => draft.entities.push(createEntity(project.projectId, 'review', '任意のレビュー', { target: { entityId: scene.id }, targetVersionId: project.projectId, body: textToRichText('採用から生成していない内容') }))],
    ['review body', (_draft, review) => { review.data.body[0]!.text += ' 改ざん'; }],
    ['review name', (_draft, review) => { review.name = '任意の題名'; }],
    ['review status', (_draft, review) => { review.status = 'confirmed'; }],
    ['review visibility', (_draft, review) => { review.visibility = 'team'; }],
    ['review source metadata', (_draft, review) => { review.customValues['changeReview.sourceIds'] = '任意の元情報'; }],
    ['review revision', (_draft, review) => { review.revision = '9'; }],
  ];
  const before = (await store.getProject(project.projectId))!;
  const pendingBefore = await store.listOutbox(project.projectId);
  for (const [label, mutate] of mutations) {
    const draft: ProjectData = structuredClone({ ...reviewed, history: [] });
    draft.history = reviewed.history;
    mutate(draft, draft.entities.find(entity => entity.id === generated.id) as Entity<'review'>);
    expect(validateProject(draft).ok, `${label} must be structurally valid so rejection verifies the adoption guard`).toBe(true);
    await expect(store.saveProject(draft, { reason: `混入を拒否: ${label}`, includeHistory: false })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await store.getProject(project.projectId), `${label} must not change canonical content or history`).toEqual(before);
    expect(await store.listOutbox(project.projectId), `${label} must not append an outbox operation`).toEqual(pendingBefore);
  }

  const saved = (await store.saveProject(reviewed, { reason: '選んだ変更と生成レビューを保存', includeHistory: false })).project;
  expect(saved.entities.find(entity => entity.id === scene.id && entity.kind === 'scene')?.data).toMatchObject({ povId: second.id });
  expect(saved.entities.find(entity => entity.id === generated.id)?.revision).toBe('0');
  expect(saved.authorAlternatives![0]!.applyReceipts).toHaveLength(1);
  store.close();
  const reopened = new ScenarioStore({ databaseName }); stores.push(reopened);
  const loaded = (await reopened.getProject(project.projectId))!;
  expect(loaded.entities.find(entity => entity.id === generated.id)?.revision).toBe('0');
  expect(await validateProjectIntegrity(loaded)).toEqual([]);
});
