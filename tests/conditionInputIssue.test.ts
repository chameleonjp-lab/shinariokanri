import { describe, expect, it } from 'vitest';
import type { Condition } from '../src/domain/types';
import { createEntity, createProject, validateCondition } from '../src/domain/model';
import { DomainValidationError, evaluateCondition, initializeRuntimeState } from '../src/domain/conditions';
import { conditionInputError, conditionInputIssue } from '../src/domain/conditionDraft';

describe('condition input diagnostic codes', () => {
  it('retains the shared structural issue including its code, path and existing message', () => {
    const project = createProject(), invalid = { op: 'javascript', source: 'never executed' };
    const shared = validateCondition(invalid);
    if (shared.ok) throw new Error('The invalid AST was accepted');
    expect(conditionInputIssue(invalid, project)).toEqual(shared.issues[0]);
    expect(conditionInputError(invalid, project)).toBe(shared.issues[0].message);
  });

  it('uses the evaluator issue code for a comparison mismatch while preserving author guidance', () => {
    const project = createProject();
    const variable = createEntity(project.projectId, 'variable', '整数', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 2 } });
    project.entities.push(variable);
    const condition: Condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } };
    let domain: DomainValidationError | undefined;
    try { evaluateCondition(condition, { state: initializeRuntimeState(project), entities: project.entities }); }
    catch (error) { if (error instanceof DomainValidationError) domain = error; else throw error; }
    expect(domain).toBeDefined();
    expect(conditionInputIssue(condition, project)).toMatchObject({ code: domain!.issues[0].code, path: domain!.issues[0].path });
    expect(conditionInputError(condition, project)).toBe('値の型が比較する状態と一致しません。入力を保持しています。値の型を選び直してください。');
    expect(conditionInputIssue(condition, project)?.message).toBe(conditionInputError(condition, project));
  });

  it('does not invent an evaluator error code for incomplete selection guidance with an unknown result', () => {
    const project = createProject();
    const condition: Condition = { op: 'compare', variableId: project.projectId, comparator: 'eq', value: { type: 'integer', value: 0 } };
    expect(conditionInputError(condition, project)).toBe('比較する状態を選んでください。');
    expect(evaluateCondition(condition, { state: initializeRuntimeState(project), entities: project.entities }).value).toBe('unknown');
    expect(conditionInputIssue(condition, project)).toBeUndefined();
  });

  it('does not attach a later sibling error code to the first missing-selection message', () => {
    const project = createProject();
    const variable = createEntity(project.projectId, 'variable', '整数', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 2 } });
    project.entities.push(variable);
    const condition: Condition = { op: 'all', children: [
      { op: 'compare', variableId: project.projectId, comparator: 'eq', value: { type: 'integer', value: 0 } },
      { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } },
    ] };
    expect(conditionInputError(condition, project)).toBe('比較する状態を選んでください。');
    expect(() => evaluateCondition(condition, { state: initializeRuntimeState(project), entities: project.entities })).toThrow(DomainValidationError);
    expect(conditionInputIssue(condition, project)).toBeUndefined();
  });

  it.each(['overflow', 'cycle'] as const)('preserves the target comparison issue despite an unrelated derived %s', failure => {
    const project = createProject();
    const variable = createEntity(project.projectId, 'variable', '整数', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 2 } });
    project.entities.push(variable);
    const condition: Condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } };
    let actual: DomainValidationError | undefined;
    try { evaluateCondition(condition, { state: initializeRuntimeState(project), entities: project.entities }); }
    catch (error) { if (error instanceof DomainValidationError) actual = error; else throw error; }
    expect(actual).toBeDefined();
    const first = createEntity(project.projectId, 'variable', '無関係な算出値', { key: 'unrelated_first', valueType: 'integer', initial: { type: 'integer', value: 0 } });
    if (failure === 'overflow') {
      first.data.derived = { op: 'add', left: { op: 'value', value: { type: 'integer', value: Number.MAX_SAFE_INTEGER } }, right: { op: 'value', value: { type: 'integer', value: 1 } } };
      project.entities.push(first);
    } else {
      const second = createEntity(project.projectId, 'variable', '無関係な循環相手', { key: 'unrelated_second', valueType: 'integer', initial: { type: 'integer', value: 0 }, derived: { op: 'variable', variableId: first.id } });
      first.data.derived = { op: 'variable', variableId: second.id };
      project.entities.push(first, second);
    }
    expect(() => initializeRuntimeState(project)).toThrow(DomainValidationError);
    expect(conditionInputIssue(condition, project)).toEqual({ ...actual!.issues[0], message: conditionInputError(condition, project) });

    const missingSelection: Condition = { op: 'compare', variableId: project.projectId, comparator: 'eq', value: { type: 'integer', value: 0 } };
    expect(conditionInputError(missingSelection, project)).toBe('比較する状態を選んでください。');
    expect(conditionInputIssue(missingSelection, project)).toBeUndefined();
    const unknownFlag = createEntity(project.projectId, 'variable', '未設定の真偽値', { key: 'unknown_flag', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未設定' } });
    project.entities.push(unknownFlag);
    const orderingGuidance: Condition = { op: 'compare', variableId: unknownFlag.id, comparator: 'lt', value: { type: 'boolean', value: true } };
    expect(conditionInputError(orderingGuidance, project)).toBe('大小の比較には整数の状態を選んでください。');
    expect(conditionInputIssue(orderingGuidance, project)).toBeUndefined();
  });
});
