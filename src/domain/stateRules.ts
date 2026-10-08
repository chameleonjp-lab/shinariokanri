import type { Entity, RuntimeContext, ScenarioException, TargetScope } from './types';
import { presentationAnchorOrder } from './presentation';
import { adoptedRecord } from './adoption';
import { evaluateCondition } from './conditions';
import { isTick, compareTicks } from './time';

/** Fail closed when a restricted dimension is absent, rather than expanding its scope. */
export function evaluateTargetScope(scope: TargetScope, context: RuntimeContext) {
  const rule = context.ruleContext;
  if (!rule) return { value: 'unknown' as const, reasons: ['対象作品・章・経路の実行情報がありません。'] };
  if (scope.projectId !== rule.projectId || scope.targetSnapshotId && ![rule.projectId, context.state.contentVersionId, rule.sourceVersionId].includes(scope.targetSnapshotId)) return { value: 'false' as const, reasons: ['対象作品版の範囲外です。'] };
  if (scope.graphId && rule.graphId && scope.graphId !== rule.graphId || scope.chapterId && rule.chapterId && scope.chapterId !== rule.chapterId) return { value: 'false' as const, reasons: ['対象グラフまたは章の範囲外です。'] };
  const route = evaluateCondition(scope.routeCondition, context);
  if (route.value === 'false') return route;
  if (scope.graphId && !rule.graphId || scope.chapterId && !rule.chapterId) return { value: 'unknown' as const, reasons: ['対象グラフまたは章を確認できません。', ...route.reasons] };
  return route;
}

export function evaluateScenarioException(exception: ScenarioException, context: RuntimeContext) {
  const fail = (value: 'false' | 'unknown', reason: string) => ({ value, reasons: [reason] });
  if (!exception.reason.trim() || !exception.evidenceIds.length) return fail('false', '例外には理由と根拠が必要です。');
  const entities = [...(context.entities ?? []), ...(context.referenceEntities ?? [])];
  if (exception.evidenceIds.some(id => !entities.some(entity => entity.id === id && !entity.deletedAt && entity.status === 'confirmed'))) return fail('unknown', '例外の根拠が存在しないか、採用確定していません。');
  const scope = evaluateTargetScope(exception.targetScope, context); if (scope.value !== 'true') return scope;
  const range = exception.validity.worldRange, at = context.ruleContext?.worldTick;
  // An unrestricted free-text exception does not silently become permanent.
  if (!range || range.end === null) return fail('unknown', '例外の有効期限を指定してください。');
  if (!isTick(at)) return fail('unknown', '例外の期限を評価する現在の世界時点がありません。');
  if (range.start !== null && compareTicks(at, range.start) < 0 || compareTicks(at, range.end) >= 0) return fail('false', '例外の有効期間外です。');
  const route = evaluateCondition(exception.validity.routeCondition, context); if (route.value !== 'true') return route;
  const original = exception.validity.presentationAnchor, bindings = context.ruleContext?.anchorBindings;
  const anchor = original && bindings && original.sourceVersionId === context.ruleContext?.sourceVersionId ? { ...original, entityId: bindings[original.entityId] ?? original.entityId, ...(original.blockId ? { blockId: bindings[original.blockId] ?? original.blockId } : {}), ...(original.lineId ? { lineId: bindings[original.lineId] ?? original.lineId } : {}) } : original;
  if (anchor && (anchor.positionStatus === 'unresolved' || anchor.sourceVersionId && ![context.ruleContext!.projectId, context.state.contentVersionId, context.ruleContext!.sourceVersionId].includes(anchor.sourceVersionId))) return fail('unknown', '例外の提示位置または版を確認できません。');
  if (anchor && ![anchor.entityId, anchor.blockId, anchor.lineId].filter(Boolean).every(id => context.state.seenIds.includes(id!))) return fail('false', '例外の提示位置に到達していません。');
  return { value: 'true' as const, reasons: [] };
}

/** Knowing/believing is an authored acquisition with an explicit source and point, never presence alone. */
export function knowledgeAcquisitionIssue(assertion: Entity<'assertion'>, context: RuntimeContext): { code: 'REFERENCE_INVALID' | 'CONDITION_UNKNOWN' | 'TRANSITION_BLOCKED'; message: string } | undefined {
  if (!assertion.data.holderId) return;
  if (typeof assertion.data.value !== 'string' && assertion.data.value.type === 'unknown') return { code: 'CONDITION_UNKNOWN', message: '人物が取得する認識の内容が未確定です。' };
  const sources = assertion.data.sourceIds ?? [], entities = [...(context.entities ?? []), ...(context.referenceEntities ?? [])];
  if (!sources.length || sources.some(id => !entities.some(entity => entity.id === id && adoptedRecord(entity)))) return { code: 'REFERENCE_INVALID', message: '人物の認識取得には採用中の出所が必要です。' };
  const validity = assertion.data.validity, original = assertion.data.evidenceLocation ?? validity?.presentationAnchor, rule = context.ruleContexts?.[assertion.id] ?? context.ruleContext;
  const bindings = rule?.anchorBindings;
  const anchor = original && bindings && original.sourceVersionId === rule?.sourceVersionId ? { ...original, entityId: bindings[original.entityId] ?? original.entityId, ...(original.blockId ? { blockId: bindings[original.blockId] ?? original.blockId } : {}), ...(original.lineId ? { lineId: bindings[original.lineId] ?? original.lineId } : {}) } : original;
  const range = validity?.worldRange;
  if (!anchor && (!range || range.start === null)) return { code: 'CONDITION_UNKNOWN', message: '人物の認識取得には本文位置または世界内の取得時点が必要です。' };
  if (anchor) {
    if (anchor.positionStatus === 'unresolved' || anchor.sourceVersionId && ![rule?.projectId, rule?.sourceVersionId, context.state.contentVersionId].includes(anchor.sourceVersionId)) return { code: 'CONDITION_UNKNOWN', message: '認識を取得する本文位置または固定版が未確認です。' };
    if (![anchor.entityId, anchor.blockId, anchor.lineId].filter(Boolean).every(id => context.state.seenIds.includes(id!))) return { code: 'CONDITION_UNKNOWN', message: '認識を取得する本文位置へ到達していません。' };
    const current = context.currentPresentation;
    if (current) {
      const samePoint = anchor.entityId === current.anchor.entityId && anchor.blockId === current.anchor.blockId && anchor.lineId === current.anchor.lineId && anchor.start === current.anchor.start;
      const before = presentationAnchorOrder(current.project, anchor, current.anchor, current.target);
      if (!samePoint && before !== true) return { code: before === false ? 'TRANSITION_BLOCKED' : 'CONDITION_UNKNOWN', message: '認識取得の位置が、この効果の提示位置より後か、順序を確認できません。' };
    }
  }
  if (range) {
    if (!isTick(rule?.worldTick)) return { code: 'CONDITION_UNKNOWN', message: '認識の取得時点を照合する世界内tickが未入力です。' };
    if (range.start !== null && compareTicks(rule.worldTick!, range.start) < 0 || range.end !== null && compareTicks(rule!.worldTick!, range.end) >= 0) return { code: 'TRANSITION_BLOCKED', message: '認識の取得時点が宣言した有効期間外です。' };
  }
  const route = evaluateCondition(validity?.routeCondition, { ...context, ruleContext: rule });
  if (route.value !== 'true') return { code: route.value === 'unknown' ? 'CONDITION_UNKNOWN' : 'TRANSITION_BLOCKED', message: '認識を取得する経路条件が成立していません。' };
}
