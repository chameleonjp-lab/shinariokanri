import { expect, it } from 'vitest';
import { createEntity, createProject, textToRichText } from '../domain/model';
import { appendAlternativeVersion, forkAuthorAlternative, headAlternativeContent } from '../domain/writingWorkspace';
import { acknowledgeAlternativeWorkspaceDraft, hasUnsavedAlternativeWorkspaceDraft, type AuthorAlternativeWorkspaceDraft } from './AuthorAlternativeStudio';

it('acknowledges an unmounted append without clearing newer retained input and leaves foreign updates conflicting', () => {
  const project = createProject('下書き');
  project.entities.push(createEntity(project.projectId, 'scene', '場面', { body: textToRichText('元の本文') }));
  const before = forkAuthorAlternative(project, '別案');
  const submitted = headAlternativeContent(before);
  const after = appendAlternativeVersion(before, submitted, '保存');
  const newer = headAlternativeContent(before);
  const scene = newer.entities[0]!;
  if (scene.kind !== 'scene') throw new Error('fixture');
  scene.data.body = textToRichText('保存中に入力した新しい本文');
  const draft: AuthorAlternativeWorkspaceDraft = { selectedAlternativeId: before.id, newBranchName: '', sourceSnapshotId: '', branches: {
    [before.id]: { headVersionId: before.headVersionId, content: newer, branchName: before.name, selectedEntityId: scene.id, newSceneChapterId: '', versionLabel: '編集' },
  } };
  const acknowledged = acknowledgeAlternativeWorkspaceDraft(draft, [before], [after]);
  expect(acknowledged.branches[before.id]!.headVersionId).toBe(after.headVersionId);
  expect(acknowledged.branches[before.id]!.content).toBe(newer);
  expect(hasUnsavedAlternativeWorkspaceDraft(acknowledged, [after])).toBe(true);
  expect(hasUnsavedAlternativeWorkspaceDraft(draft, [after])).toBe(true);
  expect(acknowledgeAlternativeWorkspaceDraft(acknowledged, [before], [after])).toBe(acknowledged);
});

it('does not warn for acknowledged saved content or mere selection, but detects edited body and branch creation input', () => {
  const project = createProject('下書き'), alternative = forkAuthorAlternative(project, '別案');
  const draft: AuthorAlternativeWorkspaceDraft = { selectedAlternativeId: alternative.id, newBranchName: '', sourceSnapshotId: '', branches: {
    [alternative.id]: { headVersionId: alternative.headVersionId, content: headAlternativeContent(alternative), branchName: alternative.name, selectedEntityId: '', newSceneChapterId: '', versionLabel: '別案の編集' },
  } };
  expect(hasUnsavedAlternativeWorkspaceDraft(draft, [alternative])).toBe(false);
  expect(hasUnsavedAlternativeWorkspaceDraft({ ...draft, newBranchName: '新しい別案' }, [alternative])).toBe(true);
  draft.branches[alternative.id]!.branchName = '変更した名前';
  expect(hasUnsavedAlternativeWorkspaceDraft(draft, [alternative])).toBe(true);
});
