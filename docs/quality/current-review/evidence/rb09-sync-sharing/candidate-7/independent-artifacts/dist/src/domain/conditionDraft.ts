import type { Comparator, Condition, Entity, ProjectData, TypedValue } from './types';
import { validateCondition } from './model';

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

export function conditionInputError(value: unknown, project: ProjectData): string | undefined {
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
