import type { Condition, ConditionResult, EffectData, Entity, Expression, ID, ProjectData, ResetRule, RuntimeContext, RuntimeItem, RuntimeState, TruthValue, TypedValue, ValidationIssue } from './types';
import { emptyRuntimeState, validateCondition, validateEffectData, validateExpression, validateRuntimeState, validateTypedValue, validateVariableValue } from './model';
import { adoptedRecord } from './adoption';
import { evaluateScenarioException } from './stateRules';

export class DomainValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) { super(issues.map(issue => issue.message).join('、')); this.name = 'DomainValidationError'; this.issues = issues; }
}
const issue = (message: string, path = 'condition', code: ValidationIssue['code'] = 'VALIDATION_FAILED'): ValidationIssue => ({ code, path, message });
const unknown = (reason: string): TypedValue => ({ type: 'unknown', value: null, reason });
const result = (value: TruthValue, reasons: string[] = []): ConditionResult => ({ value, reasons: [...new Set(reasons)] });
const contextEntities = (context: RuntimeContext) => [...(context.entities ?? []), ...(context.referenceEntities ?? [])].filter(adoptedRecord);
const defs = (context: RuntimeContext): Entity<'variable'>[] => (context.variables ?? [...(context.entities ?? []), ...(context.referenceEntities ?? [])].filter((entity): entity is Entity<'variable'> => entity.kind === 'variable')).filter(adoptedRecord);
function variableValue(variableId: ID, context: RuntimeContext, stack: ID[]): TypedValue {
  const variable = defs(context).find(variable => variable.id === variableId);
  if (!variable) {
    if (context.variables || context.entities) return unknown('状態変数が定義されていません。');
    const value = context.state.variableValues[variableId]; if (!value) return unknown('状態変数の値がありません。');
    const validated = validateTypedValue(value); if (!validated.ok) throw new DomainValidationError(validated.issues);
    return value;
  }
  if (variable.data.derived) {
    if (stack.includes(variableId)) throw new DomainValidationError([issue('算出状態の参照が循環しています。', `variables.${variableId}.derived`)]);
    const value = expressionValue(variable.data.derived, context, [...stack, variableId]);
    const errors = validateVariableValue(variable, value, `variables.${variableId}.derived`); if (errors.length) throw new DomainValidationError(errors);
    return value;
  }
  if (variable.data.externalContractId) {
    const value = context.externalValues?.[variable.data.externalContractId];
    if (!value) return unknown('宣言した外部値をまだ取得していません。');
    const checked = validateTypedValue(value); if (!checked.ok) throw new DomainValidationError(checked.issues);
    const errors = validateVariableValue(variable, value); if (errors.length) throw new DomainValidationError(errors);
    return value;
  }
  const value = context.state.variableValues[variableId]; if (!value) return unknown('状態変数の値がありません。');
  const checked = validateTypedValue(value); if (!checked.ok) throw new DomainValidationError(checked.issues);
  const errors = validateVariableValue(variable, value); if (errors.length) throw new DomainValidationError(errors);
  return value;
}
function compare(left: TypedValue, right: TypedValue, comparator: string): ConditionResult {
  if (left.type === 'unknown' || right.type === 'unknown') return result('unknown', [left.type === 'unknown' ? left.reason : '', right.type === 'unknown' ? right.reason : ''].filter(Boolean));
  if (left.type !== right.type) throw new DomainValidationError([issue('比較する値の型が一致しません。')]);
  if (!['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(comparator)) throw new DomainValidationError([issue('未知の比較演算です。')]);
  if (comparator === 'eq' || comparator === 'ne') return result((comparator === 'eq' ? left.value === right.value : left.value !== right.value) ? 'true' : 'false');
  if (left.type !== 'integer' || right.type !== 'integer') throw new DomainValidationError([issue('順序比較はintegerにだけ使えます。')]);
  return result((comparator === 'lt' ? left.value < right.value : comparator === 'le' ? left.value <= right.value : comparator === 'gt' ? left.value > right.value : left.value >= right.value) ? 'true' : 'false');
}
function evaluate(condition: Condition, context: RuntimeContext, stack: ID[]): ConditionResult {
  switch (condition.op) {
    case 'constant': return result(condition.value ? 'true' : 'false');
    case 'all': case 'any': {
      // Inspect every child so a type error is not hidden behind short-circuiting.
      const children = condition.children.map(child => evaluate(child, context, stack)), reasons = children.flatMap(child => child.reasons);
      if (condition.op === 'all') return result(children.some(child => child.value === 'false') ? 'false' : children.every(child => child.value === 'true') ? 'true' : 'unknown', reasons);
      return result(children.some(child => child.value === 'true') ? 'true' : children.every(child => child.value === 'false') ? 'false' : 'unknown', reasons);
    }
    case 'not': { const child = evaluate(condition.child, context, stack); return result(child.value === 'unknown' ? 'unknown' : child.value === 'true' ? 'false' : 'true', child.reasons); }
    case 'compare': {
      const left = variableValue(condition.variableId, context, stack);
      if (condition.comparator !== 'in') return compare(left, condition.value as TypedValue, condition.comparator);
      const values = (condition.value as TypedValue[]).map(value => compare(left, value, 'eq'));
      return result(values.some(value => value.value === 'true') ? 'true' : values.some(value => value.value === 'unknown') ? 'unknown' : 'false', values.flatMap(value => value.reasons));
    }
    case 'item': {
      if (context.entities && !contextEntities(context).some(entity => entity.id === condition.itemId && entity.kind === 'item')) return result('unknown', ['指定した物品が定義されていません。']);
      const quantity = context.state.itemInstances.filter(item => !item.consumed && (item.instanceId === condition.itemId || item.typeId === condition.itemId)).reduce((sum, item) => sum + item.quantity, 0);
      return result(quantity >= condition.quantity ? 'true' : 'false');
    }
    case 'known': {
      if (context.entities && (!contextEntities(context).some(entity => entity.id === condition.assertionId && entity.kind === 'assertion') || !contextEntities(context).some(entity => entity.id === condition.holderId && entity.kind === 'character'))) return result('unknown', ['認識の対象または人物が定義されていません。']);
      const knowledge = context.state.assertions.find(assertion => assertion.assertionId === condition.assertionId && assertion.holderId === condition.holderId);
      return knowledge ? result(knowledge.truth, knowledge.truth === 'unknown' ? ['人物の認識が未確定です。'] : []) : result('false');
    }
    case 'visited': {
      if (context.entities && !contextEntities(context).some(entity => entity.id === condition.entityId)) return result('unknown', ['訪問先が定義されていません。']);
      return result((context.state.visitCounts[condition.entityId] ?? 0) >= condition.count ? 'true' : 'false');
    }
    case 'external': {
      if (context.entities && !contextEntities(context).some(entity => entity.id === condition.contractId && entity.kind === 'external_contract')) return result('unknown', ['外部契約が定義されていません。']);
      const value = context.externalValues?.[condition.contractId];
      if (!value) return result('unknown', ['外部値をまだ取得していません。']);
      const checked = validateTypedValue(value); if (!checked.ok) throw new DomainValidationError(checked.issues);
      if (value.type === 'unknown') return result('unknown', [value.reason]);
      if (value.type !== 'boolean') throw new DomainValidationError([issue('外部条件はbooleanの結果が必要です。')]);
      return result(value.value ? 'true' : 'false');
    }
  }
}
export function evaluateCondition(condition: Condition | null | undefined, context: RuntimeContext): ConditionResult {
  const normalized = condition ?? { op: 'constant', value: true }, checked = validateCondition(normalized);
  if (!checked.ok) throw new DomainValidationError(checked.issues);
  return evaluate(checked.value, context, []);
}
function expressionValue(expression: Expression, context: RuntimeContext, stack: ID[]): TypedValue {
  switch (expression.op) {
    case 'value': return expression.value;
    case 'variable': return variableValue(expression.variableId, context, stack);
    case 'if': {
      const condition = evaluate(expression.condition, context, stack);
      return condition.value === 'unknown' ? unknown(condition.reasons.join('、') || '分岐条件が未定です。') : expressionValue(condition.value === 'true' ? expression.then : expression.else, context, stack);
    }
    case 'add': case 'subtract': case 'multiply': {
      const left = expressionValue(expression.left, context, stack), right = expressionValue(expression.right, context, stack);
      if (left.type === 'unknown' || right.type === 'unknown') return unknown([left.type === 'unknown' ? left.reason : '', right.type === 'unknown' ? right.reason : ''].filter(Boolean).join('、'));
      if (left.type !== 'integer' || right.type !== 'integer') throw new DomainValidationError([issue('算術の入力はintegerです。', 'expression')]);
      const value = expression.op === 'add' ? left.value + right.value : expression.op === 'subtract' ? left.value - right.value : left.value * right.value;
      if (!Number.isSafeInteger(value)) throw new DomainValidationError([issue('算術結果が安全な整数の範囲を超えています。', 'expression')]);
      return { type: 'integer', value };
    }
    default: { const condition = evaluate(expression, context, stack); return condition.value === 'unknown' ? unknown(condition.reasons.join('、')) : { type: 'boolean', value: condition.value === 'true' }; }
  }
}
export function evaluateExpression(expression: Expression, context: RuntimeContext): TypedValue {
  const checked = validateExpression(expression); if (!checked.ok) throw new DomainValidationError(checked.issues);
  return expressionValue(checked.value, context, []);
}
export function initializeRuntimeState(project: ProjectData, contentVersionId: ID = project.projectId, referenceEntities: Entity[] = []): RuntimeState {
  const state = emptyRuntimeState(contentVersionId), variables = [...project.entities, ...referenceEntities].filter((entity): entity is Entity<'variable'> => entity.kind === 'variable' && adoptedRecord(entity));
  for (const variable of variables) state.variableValues[variable.id] = structuredClone(variable.data.initial);
  for (const variable of variables) if (variable.data.derived) state.variableValues[variable.id] = variableValue(variable.id, { state, variables, entities: project.entities, referenceEntities }, []);
  // Authors' world assertions and event participation never grant runtime knowledge.
  return state;
}
export function conditionToText(condition: Condition, names: Record<ID, string> = {}): string {
  const checked = validateCondition(condition); if (!checked.ok) throw new DomainValidationError(checked.issues);
  const name = (id: ID): string => names[id] ?? id;
  const value = (typed: TypedValue): string => typed.type === 'unknown' ? '未定' : typed.type === 'boolean' ? typed.value ? '真' : '偽' : String(typed.value);
  switch (condition.op) {
    case 'constant': return condition.value ? '真' : '偽';
    case 'all': case 'any': return `(${condition.children.map(child => conditionToText(child, names)).join(condition.op === 'all' ? ' かつ ' : ' または ')})`;
    case 'not': return `否定(${conditionToText(condition.child, names)})`;
    case 'compare': return `${name(condition.variableId)} ${condition.comparator} ${Array.isArray(condition.value) ? `[${condition.value.map(value).join(', ')}]` : value(condition.value)}`;
    case 'item': return `${name(condition.itemId)}を${condition.quantity}個以上所持`;
    case 'known': return `${name(condition.holderId)}が${name(condition.assertionId)}を知る`;
    case 'visited': return `${name(condition.entityId)}を${condition.count}回以上訪問`;
    case 'external': return `外部確認(${name(condition.contractId)})`;
  }
}

export type EffectsResult = { ok: true; state: RuntimeState } | { ok: false; state: RuntimeState; issues: ValidationIssue[] };
/** Exclusions are checked on the final working state so an atomic swap remains possible. */
export function runtimeExclusionIssues(context: RuntimeContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const variable of defs(context)) for (const [index, rule] of (variable.data.exclusions ?? []).entries()) {
    const result = evaluateCondition({ op: 'all', children: [{ op: 'compare', variableId: variable.id, comparator: 'eq', value: rule.value }, { op: 'compare', variableId: rule.variableId, comparator: 'eq', value: rule.otherValue }] }, context);
    if (result.value === 'false') continue;
    const exceptions = (rule.exceptions ?? []).map(exception => evaluateScenarioException(exception, context));
    if (result.value === 'true' && exceptions.some(exception => exception.value === 'true')) continue;
    const unknown = result.value === 'unknown' || exceptions.some(exception => exception.value === 'unknown');
    issues.push(issue(unknown ? `相互排他を評価できません。${rule.reason}` : `相互排他に反する状態です。${rule.reason}`, `${variable.id}.exclusions[${index}]`, unknown ? 'CONDITION_UNKNOWN' : 'TRANSITION_BLOCKED'));
  }
  return issues;
}
function sameValue(a: TypedValue, b: TypedValue): boolean { return a.type === b.type && a.value === b.value; }
function transitionAllowed(variable: Entity<'variable'>, before: TypedValue, after: TypedValue, effect: EffectData, context: RuntimeContext): void {
  if (effect.operation === 'reset' || sameValue(before, after)) return;
  const quests = contextEntities(context).filter((entity): entity is Entity<'quest'> => entity.kind === 'quest' && entity.data.stateVariableId === variable.id);
  const rules = [...(variable.data.transitionRules ?? []), ...quests.flatMap(quest => quest.data.transitionRules ?? [])];
  if (!rules.length && !quests.length) return;
  if (before.type === 'unknown') throw new DomainValidationError([issue('遷移前の状態が未定です。', `variables.${variable.id}`, 'CONDITION_UNKNOWN')]);
  const matching = rules.filter(rule => sameValue(rule.from, before) && sameValue(rule.to, after));
  if (matching.some(rule => !rule.exception && !rule.exceptionDetails)) return;
  const exceptions = [...matching.flatMap(rule => rule.exceptionDetails ? [rule.exceptionDetails] : []), ...(effect.exceptionDetails ? [effect.exceptionDetails] : [])];
  const checked = exceptions.map(exception => evaluateScenarioException(exception, context));
  if (checked.some(value => value.value === 'true')) return;
  throw new DomainValidationError([issue(checked.flatMap(value => value.reasons).join('、') || '許容遷移表にない状態更新です。明示resetまたは対象・期限・根拠付きの例外が必要です。', `variables.${variable.id}`, checked.some(value => value.value === 'unknown') ? 'CONDITION_UNKNOWN' : 'TRANSITION_BLOCKED')]);
}
function itemTargets(state: RuntimeState, targetId: ID, instanceId?: ID | null): RuntimeItem[] { return state.itemInstances.filter(item => instanceId ? item.instanceId === instanceId : item.instanceId === targetId || item.typeId === targetId); }
function applyOne(state: RuntimeState, effect: EffectData, context: RuntimeContext, effectId?: ID): void {
  const variables = defs(context), target = [...(context.entities ?? []), ...(context.referenceEntities ?? [])].find(entity => entity.id === effect.targetId && adoptedRecord(entity));
  const fail: (message: string, code?: ValidationIssue['code']) => never = (message, code = 'TRANSITION_BLOCKED') => { throw new DomainValidationError([issue(message, `effects.${effectId ?? effect.targetId}`, code)]); };
  if (['set', 'add', 'reset'].includes(effect.operation)) {
    const variable = variables.find(variable => variable.id === effect.targetId); if (!variable) fail('更新先の状態変数がありません。', 'REFERENCE_INVALID');
    if (variable.data.derived) fail('算出状態へ直接代入できません。', 'VALIDATION_FAILED');
    const before = variableValue(variable.id, { ...context, state }, []);
    let after = effect.operation === 'reset' ? structuredClone(effect.value ?? variable.data.initial) : effect.value;
    if (!after) fail('状態更新の入力値がありません。', 'VALIDATION_FAILED');
    if (effect.operation === 'add') {
      if (before.type === 'unknown') fail(before.reason || '加算元の状態が未定です。', 'CONDITION_UNKNOWN');
      if (before.type !== 'integer' || after.type !== 'integer' || variable.data.valueType !== 'integer') fail('addはinteger状態とinteger入力だけを使えます。', 'VALIDATION_FAILED');
      after = { type: 'integer', value: before.value + after.value };
    }
    const errors = validateVariableValue(variable, after, `effects.${effectId ?? effect.targetId}.value`, effect.operation === 'reset');
    if (errors.length) throw new DomainValidationError(errors.map(error => ({ ...error, code: error.code === 'CONDITION_UNKNOWN' ? error.code : 'TRANSITION_BLOCKED' })));
    transitionAllowed(variable, before, after, effect, context); state.variableValues[variable.id] = structuredClone(after); return;
  }
  if (effect.operation === 'mark_seen') {
    if (context.entities && !target) fail('既読対象が定義されていません。', 'REFERENCE_INVALID');
    if (!state.seenIds.includes(effect.targetId)) state.seenIds.push(effect.targetId); return;
  }
  if (effect.operation === 'assert') {
    if (!target || target.kind !== 'assertion') fail('認識効果の対象には事実・認識が必要です。', 'REFERENCE_INVALID');
    if (effect.value && effect.value.type !== 'boolean') fail('認識効果の入力はbooleanです。', 'VALIDATION_FAILED');
    const truth: TruthValue = effect.value?.type === 'boolean' && !effect.value.value ? 'false' : 'true', holderId = target.data.holderId ?? null;
    const existing = state.assertions.find(assertion => assertion.assertionId === target.id && assertion.holderId === holderId);
    if (existing) { existing.truth = truth; if (effectId) existing.sourceEffectId = effectId; }
    else state.assertions.push({ assertionId: target.id, holderId, truth, ...(effectId ? { sourceEffectId: effectId } : {}) });
    return;
  }
  if (!target || target.kind !== 'item') fail('物品効果の対象には宣言済みの物品が必要です。', 'REFERENCE_INVALID');
  if (effect.instanceId) {
    const individual = contextEntities(context).find(entity => entity.id === effect.instanceId);
    if (!individual || individual.kind !== 'item' || individual.data.itemMode !== 'instance') fail('指定した物品個体が定義されていません。', 'REFERENCE_INVALID');
    if ((target.data.itemMode === 'type' && individual.data.typeId !== target.id) || (target.data.itemMode === 'instance' && individual.id !== target.id)) fail('指定した個体が効果の対象物品に属していません。', 'REFERENCE_INVALID');
  }
  const quantity = effect.value?.type === 'integer' ? effect.value.value : 1;
  if (effect.operation === 'grant') {
    if (effect.value && effect.value.type !== 'integer') fail('取得数量はintegerです。', 'VALIDATION_FAILED');
    if (!Number.isSafeInteger(quantity) || quantity < 1) fail('取得数量は正の安全な整数です。', 'VALIDATION_FAILED');
    const individual = target.data.itemMode === 'instance' ? target : effect.instanceId ? contextEntities(context).find(entity => entity.id === effect.instanceId && entity.kind === 'item' && entity.data.itemMode === 'instance') as Entity<'item'> | undefined : undefined;
    if (effect.instanceId && !individual) fail('指定した物品個体がありません。', 'REFERENCE_INVALID');
    if (individual) {
      if (quantity !== 1) fail('物品個体の数量は1です。');
      if (target.data.itemMode === 'type' && individual.data.typeId !== target.id) fail('個体が指定した物品種類に属していません。', 'REFERENCE_INVALID');
      if (state.itemInstances.some(item => item.instanceId === individual.id)) fail('同じ物品個体を二重取得・復活させられません。');
      const typeId = individual.data.typeId; if (!typeId) fail('物品個体の種類が未定義です。', 'REFERENCE_INVALID');
      state.itemInstances.push({ instanceId: individual.id, typeId, quantity: 1, ownerId: null, locationId: null, consumed: false });
    } else {
      // A fungible type has a deterministic stack ID. Replaying the same input is identical.
      const existing = state.itemInstances.find(item => item.instanceId === target.id && item.typeId === target.id);
      if (existing) { if (!Number.isSafeInteger(existing.quantity + quantity)) fail('物品数量が安全な整数範囲を超えています。'); existing.quantity += quantity; existing.consumed = false; }
      else state.itemInstances.push({ instanceId: target.id, typeId: target.id, quantity, ownerId: null, locationId: null, consumed: false });
    }
    return;
  }
  const items = itemTargets(state, effect.targetId, effect.instanceId).filter(item => !item.consumed && item.quantity > 0);
  if (items.some(item => target.data.itemMode === 'type' ? item.typeId !== target.id : item.instanceId !== target.id || item.typeId !== target.data.typeId)) fail('実行状態の個体と効果の対象物品が一致しません。', 'REFERENCE_INVALID');
  if (effect.operation === 'consume') {
    if (!effect.reason?.trim()) fail('消費・破壊の理由を記録してください。', 'VALIDATION_FAILED');
    if (effect.value && effect.value.type !== 'integer') fail('消費数量はintegerです。', 'VALIDATION_FAILED');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || items.reduce((total, item) => total + item.quantity, 0) < quantity) fail('物品が不足しています。');
    let remaining = quantity;
    for (const item of items) { const take = Math.min(item.quantity, remaining); item.quantity -= take; remaining -= take; item.reason = effect.reason; item.consumed = item.quantity === 0; if (remaining === 0) break; }
    return;
  }
  if (effect.operation === 'move') {
    if (effect.value?.type !== 'ref') fail('移動先には人物・グループ・場所のrefが必要です。', 'VALIDATION_FAILED');
    const destination = contextEntities(context).find(entity => entity.id === effect.value?.value);
    if (!destination || !['character', 'group', 'place'].includes(destination.kind)) fail('物品の移動先がありません。', 'REFERENCE_INVALID');
    if (items.length !== 1) fail('移動する現存物品を一個体に特定してください。');
    const item = items[0]; item.ownerId = destination.kind === 'place' ? null : destination.id; item.locationId = destination.kind === 'place' ? destination.id : null;
    return;
  }
  fail('未対応の物品操作です。', 'VALIDATION_FAILED');
}
export function applyEffectsAtomic(state: RuntimeState, effects: (Entity<'effect'> | EffectData)[], context: RuntimeContext = { state }): EffectsResult {
  const checked = validateRuntimeState(state); if (!checked.ok) return { ok: false, state, issues: checked.issues };
  const working = structuredClone(state);
  try {
    for (const [index, input] of effects.entries()) {
      if ('data' in input && !adoptedRecord(input)) throw new DomainValidationError([issue('削除・不採用・別案の効果は実行できません。', `effects[${index}]`, 'REFERENCE_INVALID')]);
      const effect = 'data' in input ? input.data : input, effectId = 'id' in input ? input.id : undefined;
      const checkedEffect = validateEffectData(effect, `effects[${index}]`); if (!checkedEffect.ok) throw new DomainValidationError(checkedEffect.issues);
      const condition = evaluateCondition(effect.condition, { ...context, state: working });
      if (condition.value === 'unknown') throw new DomainValidationError([issue(condition.reasons.join('、') || '効果の条件が未定です。', `effects[${index}].condition`, 'CONDITION_UNKNOWN')]);
      if (condition.value === 'false') continue;
      applyOne(working, effect, { ...context, state: working }, effectId);
    }
    const instanceIds = new Set<ID>();
    for (const item of working.itemInstances) {
      if (instanceIds.has(item.instanceId) || (item.ownerId && item.locationId) || (item.consumed && item.quantity !== 0) || (!item.consumed && item.quantity < 1)) throw new DomainValidationError([issue('物品の個体ID・所在・数量が不整合です。', 'itemInstances', 'TRANSITION_BLOCKED')]);
      instanceIds.add(item.instanceId);
    }
    for (const variable of defs(context)) if (variable.data.derived) working.variableValues[variable.id] = variableValue(variable.id, { ...context, state: working }, []);
    const exclusions = runtimeExclusionIssues({ ...context, state: working }); if (exclusions.length) throw new DomainValidationError(exclusions);
    return { ok: true, state: working };
  } catch (error) {
    return { ok: false, state, issues: error instanceof DomainValidationError ? error.issues : [issue(error instanceof Error ? error.message : '効果を適用できません。', 'effects')] };
  }
}

/** Lifecycle resets are explicit effects with the same validation and atomicity as a choice. */
export function resetRuntimeLifecycle(state: RuntimeState, events: ResetRule['on'][], context: RuntimeContext): EffectsResult {
  if (!events.length) return { ok: true, state: structuredClone(state) };
  const working = structuredClone(state), effects: EffectData[] = [];
  const causes: NonNullable<RuntimeState['resetCauses']> = [];
  for (const on of events) {
    for (const variable of defs(context)) {
      if (variable.data.derived || variable.data.externalContractId) continue;
      const rule = variable.data.resetRules?.find(rule => rule.on === on);
      const resetScope = on === 'full_reset' || on === 'new_loop' && ['scene', 'chapter', 'run'].includes(variable.data.scope);
      if (!rule && !resetScope) continue;
      const value = rule?.value ?? variable.data.initial;
      effects.push({ operation: 'reset', targetId: variable.id, value });
      causes.push({ variableId: variable.id, on, before: structuredClone(working.variableValues[variable.id] ?? { type: 'unknown', value: null, reason: '途中開始時の値が未指定です。' }), after: structuredClone(value), reason: rule?.reason || (rule ? '宣言した初期化規則' : `有効範囲 ${variable.data.scope} の初期化`) });
      working.variableValues[variable.id] = structuredClone(value);
    }
  }
  const applied = applyEffectsAtomic(state, effects, context);
  if (!applied.ok) return applied;
  if (events.length && (causes.length || state.resetCauses)) applied.state.resetCauses = causes;
  return applied;
}
