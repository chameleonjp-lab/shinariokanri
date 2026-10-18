import { expect, it } from 'vitest';
import { createEntity, createProject, ENTITY_KINDS } from '../../src/domain/model';
import { fieldSemanticInventory, indexedFormalReferencePaths } from '../../scripts/optimization/semanticStudy';

it('distinguishes kind-specific rich text, references and intentionally narrower public definitions', () => {
  const rows = fieldSemanticInventory(), find = (kind: string, field: string) => rows.find(row => row.kind === kind && row.field === field);
  expect(new Set(rows.map(row => row.kind))).toEqual(new Set(ENTITY_KINDS));
  expect(find('character', 'goals')).toMatchObject({ model: 'array', item: 'ref', ui: 'refs', public: null, reference: { scope: 'entity', kinds: ['goal'] } });
  expect(find('scene', 'goals')).toMatchObject({ model: 'richtext', ui: 'rich', public: null, reference: null });
  expect(find('collection', 'mode')).toMatchObject({ values: ['dynamic', 'fixed'], publicValues: ['fixed'] });
});

it('keeps live formal-reference leaves out of search while retaining the archived discrepancy evidence', () => {
  const project = createProject(), goal = createEntity(project.projectId, 'goal', '目的'), character = createEntity(project.projectId, 'character', '人物', { goals: [goal.id] });
  const group = createEntity(project.projectId, 'group', '分類', { members: [character.id] });
  const scene = createEntity(project.projectId, 'scene', '場面', { goals: [{ id: goal.id, kind: 'paragraph', text: '目的の本文' }] });
  expect(indexedFormalReferencePaths(character)).toEqual([]);
  expect(indexedFormalReferencePaths(group)).toEqual([]);
  expect(indexedFormalReferencePaths(scene)).toEqual([]);
  expect(JSON.stringify(indexedFormalReferencePaths(character))).not.toContain(goal.id);
  // Historical source and the original discrepancy remain sealed in the prior evidence archive.
});
