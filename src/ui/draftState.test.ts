import { expect, it } from 'vitest';
import { createEntity, createProject } from '../domain/model';
import { reconcileSavedDrafts, removeCommittedDraftDuplicates, updateJsonBuffer } from './draftState';
it('completes an unmounted editor save without dropping another project or later input', () => {
  const a = createProject('A'), b = createProject('B');
  const submitted = createEntity(a.projectId, 'character', '保存した名前');
  const other = { ...submitted, projectId: b.projectId, name: '別作品の入力' };
  const saved = { ...submitted, revision: '1' };
  const key = a.projectId + ':' + submitted.id, otherKey = b.projectId + ':' + submitted.id;
  const result = reconcileSavedDrafts({ [key]: submitted, [otherKey]: other }, submitted, saved);
  expect(result[key]).toBeUndefined(); expect(result[otherKey]).toEqual(other);
  const later = { ...submitted, name: '保存待ちの間の追加入力' };
  expect(reconcileSavedDrafts({ [key]: later }, submitted, saved)[key]).toEqual({ ...later, revision: '1' });
  const newer = { ...later, revision: '2' }, state = { [key]: newer };
  expect(reconcileSavedDrafts(state, submitted, saved)).toBe(state);
});

it('clears only the submitted capture after its editor was remounted with later input', () => {
  const key = 'project:note', otherKey = 'other-project:note';
  const original = { [key]: { _noteCapture: 'submitted', invalidField: '{' }, [otherKey]: { _noteCapture: 'other' } };
  const later = updateJsonBuffer(original, key, '_noteCapture', 'later');
  expect(updateJsonBuffer(later, key, '_noteCapture', undefined, 'submitted')).toBe(later);
  const completed = updateJsonBuffer(original, key, '_noteCapture', undefined, 'submitted');
  expect(completed[key]).toEqual({ invalidField: '{' });
  expect(completed[otherKey]).toEqual({ _noteCapture: 'other' });
  const removed = updateJsonBuffer({ [key]: { _noteCapture: 'submitted' } }, key, '_noteCapture', undefined, 'submitted');
  expect(removed).toEqual({});
});

it('reload discards a stale revision-0 workspace draft only when all authored fields match saved revision 1', () => {
  const project = createProject('recovery');
  const base = createEntity(project.projectId, 'flow_edge', 'saved condition');
  const saved = { ...base, revision: '1', updatedAt: '2026-10-19T00:00:01.000Z' };
  const stale = { ...saved, revision: '0', updatedAt: '2026-10-18T00:00:00.000Z' };
  const key = project.projectId + ':' + base.id;
  const another = createEntity(project.projectId, 'note', 'other unsaved');
  const otherKey = another.projectId + ':' + another.id;
  const fromDifferentProject = { ...base, projectId: 'other-project' };
  const unrelatedKey = 'other-project:' + base.id;
  const drafts = { [key]: stale, [otherKey]: another, [unrelatedKey]: fromDifferentProject };
  expect(removeCommittedDraftDuplicates(drafts, { ...project, entities: [saved] })).toEqual({
    [otherKey]: another,
    [unrelatedKey]: fromDifferentProject,
  });
});

it('does not erase newer, different, malformed or uncommitted input at reload', () => {
  const project = createProject('recovery');
  const old = createEntity(project.projectId, 'character', 'initial');
  const saved = { ...old, name: 'saved name', revision: '1' };
  const key = project.projectId + ':' + old.id;
  const working = [
    { ...old, name: 'later unsaved', revision: '0' },
    { ...saved, revision: '2' },
    { ...saved, revision: 'invalid' },
    { ...old, name: 'other author update', revision: '1' },
  ];
  for (const draft of working) {
    const drafts = { [key]: draft };
    expect(removeCommittedDraftDuplicates(drafts, { ...project, entities: [saved] })).toBe(drafts);
  }
  const empty = {};
  expect(removeCommittedDraftDuplicates(empty, { ...project, entities: [saved] })).toBe(empty);
  const unmodified = { [key]: saved };
  expect(removeCommittedDraftDuplicates(unmodified, { ...project, entities: [] })).toBe(unmodified);
});
