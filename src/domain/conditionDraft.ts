import type { Comparator, Condition, Entity, ProjectData, TypedValue, ValidationIssue } from './types';
import { emptyRuntimeState, validateCondition } from './model';
import { DomainValidationError, evaluateCondition } from './conditions';
import { adoptedRecord } from './adoption';

export type ComparisonCondition = Extract<Condition, { op: 'compare' }>;

/** Switching away from several values requires an explicit choice by the author. */
export function switchComparisonOperator(condition: ComparisonCondition, comparator: Comparator, selectedIndex?: number): ComparisonCondition | undefined {
  if (comparator === 'in') return { ...condition, comparator, value: Array.isArray(condition.value) ? condition.value : [condition.value] };
  if (!Array.isArray(condition.value)) return { ...condition, comparator };
  if (!condition.value.length || condition.value.length > 1 && selectedIndex === undefined) return undefined;
  const value = condition.value[selectedIndex ?? 0];
  return value ? { ...condition, comparator, value } : undefined;
}

export function defaultComparisonValue(variable?: Entity<'variable'>): TypedValue {
  if (variable?.data.valueType === 'integer') return { type: 'integer', value: 0 };
  if (variable?.data.valueType === 'enum') return { type: 'enum', value: String(variable.data.allowed.values?.[0] ?? '') };
  return { type: 'boolean', value: true };
}

function conditionInputMessage(value: unknown, project: ProjectData): string | undefined {
  const checked = validateCondition(value);
  if (!checked.ok) return checked.issues[0]?.message;
  const inspect = (condition: Condition): string | undefined => {
    if (condition.op === 'all' || condition.op === 'any') return condition.children.map(inspect).find(Boolean);
    if (condition.op === 'not') return inspect(condition.child);
    if (condition.op !== 'compare') return undefined;
    const variable = project.entities.find((entity): entity is Entity<'variable'> => entity.kind === 'variable' && entity.id === condition.variableId && !entity.deletedAt);
    if (!variable) return '比較する状態を選んでください。';
    if (['lt', 'le', 'gt', 'ge'].includes(condition.comparator) && variable.data.valueType !== 'integer') return '大小の比較には整数の状態を選んでください。';
    for (const typed of Array.isArray(condition.value) ? condition.value : [condition.value]) {
      if (typed.type === 'unknown') continue;
      if (typed.type !== variable.data.valueType) return '値の型が比較する状態と一致しません。入力を保持しています。値の型を選び直してください。';
      if (typed.type === 'enum' && !typed.value.trim()) return '列挙値が空です。値を入力するか、不明・未設定を選んでください。';
    }
    return undefined;
  };
  return inspect(checked.value);
}

/** Retain the existing input guidance for callers that need only its text. */
export function conditionInputError(value: unknown, project: ProjectData): string | undefined {
  return conditionInputMessage(value, project);
}

/** Expose an actual shared-domain issue, never invent a code for UI guidance. */
export function conditionInputIssue(value: unknown, project: ProjectData): ValidationIssue | undefined {
  const checked = validateCondition(value);
  if (!checked.ok) return checked.issues[0];
  const message = conditionInputMessage(value, project);
  if (!message) return;
  const firstInputCondition = (condition: Condition): Condition | undefined => {
    if (condition.op === 'all' || condition.op === 'any') return condition.children.map(firstInputCondition).find(Boolean);
    if (condition.op === 'not') return firstInputCondition(condition.child);
    return conditionInputMessage(condition, project) ? condition : undefined;
  };
  const target = firstInputCondition(checked.value);
  if (!target) return;
  // The shared evaluator resolves the target's derived/external declarations.
  // Eagerly evaluating unrelated variables would hide this input's own issue.
  const state = emptyRuntimeState(project.projectId);
  for (const entity of project.entities) if (entity.kind === 'variable' && adoptedRecord(entity)) state.variableValues[entity.id] = structuredClone(entity.data.initial);
  try {
    evaluateCondition(target, { state, entities: project.entities });
  } catch (error) {
    if (error instanceof DomainValidationError && error.issues[0]) return { ...error.issues[0], message };
  }
  // Incomplete selection/blank-input guidance can coexist with a valid unknown
  // or false evaluation. Such guidance has no evaluator error code to display.
}
