import { describe, expect, it } from 'vitest';
import type { Comparator, Entity, TypedValue } from '../src/domain/types';
import { createEntity, createProject, validateProject } from '../src/domain/model';
import { conditionToText, evaluateCondition, initializeRuntimeState } from '../src/domain/conditions';
import { conditionInputError, switchComparisonOperator, type ComparisonCondition } from '../src/domain/conditionDraft';
import { describeCondition } from '../src/ui/Fields';
import { exportScenario, inspectScenario } from '../src/storage/archive';

describe('RG-R05 typed comparison lists', () => {
  it.each([
    ['boolean', { type: 'boolean', value: true }, { type: 'boolean', value: false }],
    ['integer', { type: 'integer', value: 7 }, { type: 'integer', value: 3 }],
    ['enum', { type: 'enum', value: 'open' }, { type: 'enum', value: 'closed' }],
  ] as const)('preserves %s scalar/list values and evaluation through archive restoration', async (type, first, second) => {
    const project = createProject(), variable = createEntity(project.projectId, 'variable', '状態', { key: 'state', valueType: type, initial: first, allowed: type === 'integer' ? { min: 0, max: 10 } : { values: [first.value, second.value] as (boolean | string)[] } });
    const scalar: ComparisonCondition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: first };
    const wrapped = switchComparisonOperator(scalar, 'in')!;
    expect(wrapped.value).toEqual([first]);
    const list = { ...wrapped, value: [first, second] };
    const effect = createEntity(project.projectId, 'effect', '', { operation: 'mark_seen', targetId: variable.id, condition: list });
    project.entities = [variable, effect];
    expect(conditionInputError(list, project)).toBeUndefined();
    expect(validateProject(project).ok).toBe(true);
    expect(evaluateCondition(list, { state: initializeRuntimeState(project), entities: project.entities }).value).toBe('true');
    expect(describeCondition(list, project)).toContain('∈ （');
    expect(conditionToText(list, { [variable.id]: variable.name })).toContain(' in [');
    const restored = await inspectScenario(await exportScenario(project), { worker: false });
    const restoredCondition = (restored.project.entities[1] as Entity<'effect'>).data.condition!;
    expect(restoredCondition).toEqual(list);
    expect(evaluateCondition(restoredCondition, { state: initializeRuntimeState(restored.project), entities: restored.project.entities }).value).toBe('true');
  });

  it('requires an explicit survivor before switching multiple values to any scalar comparator', () => {
    const condition: ComparisonCondition = { op: 'compare', variableId: createProject().projectId, comparator: 'in', value: [{ type: 'integer', value: 2 }, { type: 'integer', value: 8 }] }, before = structuredClone(condition);
    for (const comparator of ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] as Comparator[]) {
      expect(switchComparisonOperator(condition, comparator)).toBeUndefined();
      expect(switchComparisonOperator(condition, comparator, 1)).toEqual({ ...condition, comparator, value: { type: 'integer', value: 8 } });
    }
    expect(condition).toEqual(before);
    expect(switchComparisonOperator({ ...condition, value: [{ type: 'integer', value: 2 }] }, 'eq')).toMatchObject({ value: { type: 'integer', value: 2 } });
  });

  it('preserves unknown values and distinguishes unknown membership from false', () => {
    const project = createProject(), variable = createEntity(project.projectId, 'variable', '状態', { key: 'state', initial: { type: 'boolean', value: false } }); project.entities = [variable];
    const condition: ComparisonCondition = { op: 'compare', variableId: variable.id, comparator: 'in', value: [{ type: 'boolean', value: true }, { type: 'unknown', value: null, reason: '未調査' }] };
    expect(conditionInputError(condition, project)).toBeUndefined();
    expect(evaluateCondition(condition, { state: initializeRuntimeState(project), entities: project.entities })).toMatchObject({ value: 'unknown', reasons: ['未調査'] });
    expect(describeCondition(condition, project)).toContain('（真、不明（未調査））');
  });

  it('keeps empty or mismatched drafts visible until corrected', () => {
    const project = createProject(), variable = createEntity(project.projectId, 'variable', '状態', { key: 'state', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } }); project.entities = [variable];
    const condition: ComparisonCondition = { op: 'compare', variableId: variable.id, comparator: 'in', value: [{ type: 'boolean', value: true }] }, before = structuredClone(condition);
    expect(conditionInputError(condition, project)).toContain('型');
    expect(condition).toEqual(before);
    expect(conditionInputError({ ...condition, value: [] }, project)).toBeTruthy();
    expect(conditionInputError({ ...condition, value: [{ type: 'integer', value: undefined } as unknown as TypedValue] }, project)).toBeTruthy();
    expect(conditionInputError({ ...condition, value: [{ type: 'integer', value: 5 }] }, project)).toBeUndefined();
  });
});
