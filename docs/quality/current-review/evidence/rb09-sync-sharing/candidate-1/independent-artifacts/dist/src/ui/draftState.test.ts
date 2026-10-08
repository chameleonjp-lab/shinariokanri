import { expect, it } from 'vitest';
import { createEntity, createProject } from '../domain/model';
import { reconcileSavedDrafts, updateJsonBuffer } from './draftState';
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
