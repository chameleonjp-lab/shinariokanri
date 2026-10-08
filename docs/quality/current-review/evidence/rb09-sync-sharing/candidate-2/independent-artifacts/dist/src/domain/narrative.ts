import type { ContentAnchor, Entity, ID, PresentationConditionResult, ProjectData, RuntimeState, TypedValue, ValidationIssue } from './types';
import type { AnalysisFinding } from './runtime';
import { adoptedRecord } from './adoption';
import { presentationAnchorApplies, presentationAnchorOrder, presentationRuleContext, presentationLineIds, type PresentationTarget } from './presentation';
import { reuseExecutionAnchor, reuseRuleContexts } from './reuse';
import { evaluateScenarioException, evaluateTargetScope } from './stateRules';
import { assessWorldValidity } from './world';
import { applyEffectsAtomic } from './conditions';
import { canonicalJson } from '../storage/json';

export interface NarrativeOccurrence {
  state: RuntimeState; observationState?: RuntimeState; conditions: PresentationConditionResult[];
  target: PresentationTarget; edgeIds?: ID[]; worldTick?: string; externalValues: Record<ID, TypedValue>;
}
const activeKind = <K extends Entity['kind']>(project: ProjectData, kind: K): Entity<K>[] => project.entities.filter((entity): entity is Entity<K> => entity.kind === kind && adoptedRecord(entity));
const getEntity = (project: ProjectData, id: ID) => project.entities.find(entity => entity.id === id);
const variables = (project: ProjectData) => activeKind(project, 'variable');
const runtimeEntities = (project: ProjectData) => project.entities.filter(adoptedRecord);
const clone = structuredClone;

/** The same pre-effect presentation evidence is used by chapters, branching paths and finite analysis. */
export function checkPresentationForeshadows(project: ProjectData, states: NarrativeOccurrence[], startState: RuntimeState, terminal: boolean, referenceEntities: Entity[] = [], issues: ValidationIssue[] = []): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const disclosures = activeKind(project, 'disclosure');
  const seen = new Set<ID>();
  const uncertain = new Set<ID>();
  const found = new Set<ID>();
  const path: ID[] = [];
  const edgePath: ID[][] = [];
  for (const disclosure of disclosures) if (disclosure.data.anchor.positionStatus === 'unresolved' && issues.some(failure => failure.code === 'CONDITION_UNKNOWN' && failure.path === `${disclosure.id}.anchor`)) {
    uncertain.add(disclosure.id);
    findings.push({ status: 'unknown', code: 'CONDITION_UNKNOWN', message: '提示位置が不明です。本文へ再リンクしてから伏線を確認してください。', targetId: disclosure.id, path: states.at(-1)?.state.presentationPosition ? [states.at(-1)!.state.presentationPosition!] : [], startState: clone(startState) });
  }
  for (const { state, observationState, conditions, edgeIds, worldTick, externalValues, target } of states) {
    const anchorIsPresented = (project: ProjectData, state: RuntimeState, anchor: ContentAnchor, declarationId?: ID) => presentationAnchorApplies(project, state, anchor, target, declarationId);
    const anchorPrecedes = (project: ProjectData, _state: RuntimeState, left: ContentAnchor, right: ContentAnchor) => presentationAnchorOrder(project, left, right, target);
    // A pending initial disclosure is not a presentation until its arrival commits.
    const position = target.nodeId ?? target.sceneId;
    if (!position || !state.seenIds.includes(position)) continue;
    path.push(position);
    if (edgeIds) edgePath.push([...edgeIds]);
    const recorded = new Map((conditions ?? []).map(condition => [condition.targetId, condition]));
    for (const disclosure of disclosures) if (disclosure.data.anchor.positionStatus === 'unresolved' && recorded.has(disclosure.id)) {
      uncertain.add(disclosure.id);
      findings.push({ status: 'unknown', code: 'CONDITION_UNKNOWN', message: '提示位置が不明です。本文へ再リンクしてから伏線を確認してください。', targetId: disclosure.id, path: [...path], startState: clone(startState) });
    }
    // Legacy checkpoints have no observations. Only recorded presentation IDs can
    // establish a disclosure; never re-evaluate its condition using later values.
    const presentationCondition = (id: ID): PresentationConditionResult => recorded.get(id)
      ?? { targetId: id, value: state.seenIds.includes(id) ? 'true' : 'false', reasons: [] };
    for (const id of state.seenIds) {
      const disclosure = disclosures.find(disclosure => disclosure.id === id);
      if (disclosure?.data.anchor.positionStatus === 'unresolved') { uncertain.add(id); continue; }
      if (!disclosure || !anchorIsPresented(project, state, reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id), disclosure.id)) seen.add(id);
    }
    const currentClues = disclosures.filter(disclosure => disclosure.data.role === 'clue' && anchorIsPresented(project, state, reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id), disclosure.id))
      .map(disclosure => ({ disclosure, condition: presentationCondition(disclosure.id) }));
    for (const payoff of disclosures.filter(disclosure => disclosure.data.role === 'payoff')) {
      if (!anchorIsPresented(project, state, reuseExecutionAnchor(project, payoff.data.anchor, payoff.id), payoff.id) || !state.seenIds.includes(payoff.id) || found.has(payoff.id)) continue;
      // A supplied false observation cannot erase an actual presentation ID,
      // including evidence from legacy checkpoints without initial observations.
      const observedCondition = presentationCondition(payoff.id);
      const condition = observedCondition.value === 'false' ? { ...observedCondition, value: 'true' as const } : observedCondition;
      if (condition.value === 'false') continue;
      const foreshadow = getEntity(project, payoff.data.foreshadowId);
      if (!foreshadow || foreshadow.kind !== 'foreshadow' || !adoptedRecord(foreshadow)) continue;
      let uncertainOrder = false;
      const presentedBefore = (id: ID) => {
        if (seen.has(id)) return true;
        const clue = currentClues.find(clue => clue.disclosure.id === id);
        if (!clue || clue.condition.value === 'false') return false;
        const before = anchorPrecedes(project, state, reuseExecutionAnchor(project, clue.disclosure.data.anchor, clue.disclosure.id), reuseExecutionAnchor(project, payoff.data.anchor, payoff.id));
        if (before === undefined || before === true && clue.condition.value === 'unknown') uncertainOrder = true;
        return before === true && clue.condition.value === 'true';
      };
      const missing = (foreshadow.data.requiredInfo ?? []).filter(id => ![id, ...(foreshadow.data.alternativeInfo?.[id] ?? [])].some(presentedBefore));
      const ruleContext = presentationRuleContext(project, { ...target, worldTick });
      const contexts = reuseRuleContexts(project, ruleContext);
      const context = { state: observationState ?? state, variables: [...variables(project), ...referenceEntities.filter((entity): entity is Entity<'variable'> => entity.kind === 'variable')], entities: runtimeEntities(project), referenceEntities, externalValues, ruleContext: contexts[foreshadow.id] ?? ruleContext, ruleContexts: contexts };
      const scope = foreshadow.data.deadline ? !observationState && foreshadow.data.deadline.routeCondition ? { value: 'unknown' } : evaluateTargetScope(foreshadow.data.deadline, context) : { value: 'true' };
      if (scope.value === 'false') continue;
      found.add(payoff.id);
      const exceptions = (foreshadow.data.exceptions ?? []).map(exception => !observationState && (exception.targetScope.routeCondition || exception.validity.routeCondition) ? { value: 'unknown' } : evaluateScenarioException(exception, context));
      if (exceptions.some(exception => exception.value === 'true')) continue;
      if (missing.length === 0 && condition.value === 'true') continue;
      const policy = foreshadow.data.resolutionPolicy;
      const intentional = policy === 'sequel' || policy === 'intentional_open' || policy === 'red_herring' || policy === 'rejected';
      const unknown = scope.value === 'unknown' || exceptions.some(exception => exception.value === 'unknown') || condition.value === 'unknown' || uncertainOrder || missing.some(id => uncertain.has(id)) || state.provenance !== 'full_play';
      findings.push({
        status: intentional ? 'intentional' : unknown ? 'unknown' : 'candidate',
        code: condition.value === 'unknown' ? 'CONDITION_UNKNOWN' : 'REQUIRED_INFO_MISSING',
        message: intentional ? `回収方針「${policy}」として区別した未提示情報があります。`
          : unknown ? '回収前の必須情報について未確認の値または途中開始・仮値があり、確認が必要です。'
          : '回収へ至るこの経路で、作者が必須にした情報の提示が不足しています。',
        targetId: foreshadow.id, payoffId: payoff.id, missingInfoIds: missing,
        path: [...path], edgePath: edgePath.map(ids => [...ids]), startState: clone(startState),
      });
    }
    for (const { disclosure, condition } of currentClues) {
      if (condition.value === 'true') seen.add(disclosure.id);
      if (condition.value === 'unknown') uncertain.add(disclosure.id);
    }
  }
  return [...findings, ...unresolvedForeshadows(project, states, startState, terminal, referenceEntities)];
}

function occurrenceContext(project: ProjectData, occurrence: NarrativeOccurrence, referenceEntities: Entity[], declarationId?: ID) {
  const ruleContext = presentationRuleContext(project, { ...occurrence.target, worldTick: occurrence.worldTick });
  const ruleContexts = reuseRuleContexts(project, ruleContext);
  return { state: occurrence.observationState ?? occurrence.state, variables: [...variables(project), ...referenceEntities.filter((entity): entity is Entity<'variable'> => entity.kind === 'variable')], entities: runtimeEntities(project), referenceEntities, externalValues: occurrence.externalValues, ruleContext: declarationId ? ruleContexts[declarationId] ?? ruleContext : ruleContext, ruleContexts };
}

function unresolvedForeshadows(project: ProjectData, supplied: NarrativeOccurrence[], startState: RuntimeState, terminal: boolean, referenceEntities: Entity[]): AnalysisFinding[] {
  const states = supplied.filter(occurrence => { const id = occurrence.target.nodeId ?? occurrence.target.sceneId; return !!id && occurrence.state.seenIds.includes(id); });
  const findings: AnalysisFinding[] = [], disclosures = activeKind(project, 'disclosure');
  for (const foreshadow of activeKind(project, 'foreshadow')) {
    const reported = new Set<string>();
    for (let index = 0; index < states.length; index++) {
      const occurrence = states[index], context = occurrenceContext(project, occurrence, referenceEntities, foreshadow.id), scope = foreshadow.data.deadline;
      const applies = scope ? evaluateTargetScope(scope, context) : { value: 'true' as const, reasons: [] };
      if (applies.value === 'false') continue;
      const next = states[index + 1], nextRule = next ? presentationRuleContext(project, next.target) : undefined;
      const explicit = foreshadow.data.presentationDeadline ? reuseExecutionAnchor(project, foreshadow.data.presentationDeadline, foreshadow.id) : undefined;
      const reached = !!explicit && presentationAnchorApplies(project, occurrence.state, explicit, occurrence.target, foreshadow.id);
      const chapterEnd = !!scope?.chapterId && context.ruleContext.chapterId === scope.chapterId && (nextRule ? nextRule.chapterId !== scope.chapterId : terminal && index === states.length - 1);
      const exit = occurrence.target.nodeId ? activeKind(project, 'flow_node').find(node => node.id === occurrence.target.nodeId)?.data.nodeType === 'exit' : false;
      const graphEnd = !!scope?.graphId && context.ruleContext.graphId === scope.graphId && exit;
      const ending = terminal && index === states.length - 1;
      if (!reached && !chapterEnd && !graphEnd && !ending) continue;
      const boundary = reached ? 'presentation' : chapterEnd ? `chapter:${scope!.chapterId}` : graphEnd ? `graph:${scope!.graphId}` : 'terminal';
      if (reported.has(boundary)) continue;
      reported.add(boundary);
      let orderUnknown = !!explicit && (explicit.positionStatus === 'unresolved' || !!explicit.sourceVersionId && ![project.projectId, occurrence.state.contentVersionId, context.ruleContext.sourceVersionId].includes(explicit.sourceVersionId));
      const paid = states.slice(0, index + 1).some((prior, offset) => disclosures.some(payoff => {
        if (payoff.data.foreshadowId !== foreshadow.id || payoff.data.role !== 'payoff' || !prior.state.seenIds.includes(payoff.id)) return false;
        const result = prior.conditions.find(result => result.targetId === payoff.id);
        if (result?.value !== 'true') { if (!result) orderUnknown = true; return false; }
        const anchor = reuseExecutionAnchor(project, payoff.data.anchor, payoff.id);
        if (!presentationAnchorApplies(project, prior.state, anchor, prior.target, payoff.id)) return false;
        if (reached && offset === index && explicit) {
          const before = presentationAnchorOrder(project, anchor, explicit, prior.target);
          if (before === undefined) orderUnknown = true;
          return before === true;
        }
        return true;
      }));
      if (paid && !orderUnknown) continue;
      const exceptions = (foreshadow.data.exceptions ?? []).map(exception => evaluateScenarioException(exception, context));
      if (exceptions.some(exception => exception.value === 'true')) continue;
      const policy = foreshadow.data.resolutionPolicy, intentional = ['sequel', 'intentional_open', 'red_herring', 'rejected'].includes(policy);
      const unknown = applies.value === 'unknown' || exceptions.some(exception => exception.value === 'unknown') || orderUnknown || policy === 'undecided' || startState.provenance !== 'full_play' || occurrence.state.provenance !== 'full_play';
      const seen = new Set(occurrence.state.seenIds), missing = (foreshadow.data.requiredInfo ?? []).filter(id => ![id, ...(foreshadow.data.alternativeInfo?.[id] ?? [])].some(candidate => seen.has(candidate)));
      findings.push({ status: intentional ? 'intentional' : unknown ? 'unknown' : 'candidate', code: 'REQUIRED_INFO_MISSING', targetId: foreshadow.id, missingInfoIds: missing,
        message: intentional ? `回収方針「${policy}」により、この範囲での未回収を区別しました。` : unknown ? '期限・対象範囲または途中開始の未回収が未確認です。' : reached ? '体験上の指定提示位置までに回収が提示されていません。' : '対象の章・経路の終わりまでに、今作で予定した回収が提示されていません。',
        path: states.slice(0, index + 1).map(item => (item.target.nodeId ?? item.target.sceneId)!), edgePath: states.slice(0, index + 1).flatMap(item => item.edgeIds ? [[...item.edgeIds]] : []), startState: clone(startState) });
    }
  }
  return findings;
}

export interface NarrativeClaimAssessment {
  lineId: ID; assertionId: ID; occurrenceIndex: number; positionId: ID; speakerId?: ID;
  status: 'candidate' | 'unknown' | 'intentional' | 'passed_for_checked_scope'; message: string;
  knowledge: 'acquired' | 'not_acquired' | 'unknown'; counterpartIds: ID[]; evidenceIds: ID[];
  observationState: RuntimeState;
}

function stateAtLine(project: ProjectData, occurrence: NarrativeOccurrence, line: Entity<'dialogue_line'>, referenceEntities: Entity[]) {
  let state = clone(occurrence.observationState ?? occurrence.state), uncertain = !occurrence.observationState;
  const declarations = activeKind(project, 'disclosure').filter(disclosure => occurrence.conditions.some(result => result.targetId === disclosure.id && result.value === 'true') && !!disclosure.data.knowledgeEffects?.length);
  const target: ContentAnchor = { entityId: line.id, lineId: line.id, ...(line.data.text[0] ? { blockId: line.data.text[0].id, start: 0, end: 0 } : {}) };
  const earlier: Entity<'disclosure'>[] = [];
  for (const disclosure of declarations) {
    const before = presentationAnchorOrder(project, reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id), target, occurrence.target);
    if (before === undefined) uncertain = true;
    if (before === true) earlier.push(disclosure);
  }
  earlier.sort((a, b) => presentationAnchorOrder(project, reuseExecutionAnchor(project, a.data.anchor, a.id), reuseExecutionAnchor(project, b.data.anchor, b.id), occurrence.target) ? -1 : 1);
  if (earlier.length && occurrence.observationState) {
    const context = occurrenceContext(project, occurrence, referenceEntities, line.id), entities = [...runtimeEntities(project), ...referenceEntities];
    const effects = earlier.flatMap(disclosure => (disclosure.data.knowledgeEffects ?? []).map(id => entities.find((entity): entity is Entity<'effect'> => entity.kind === 'effect' && entity.id === id))).filter((entity): entity is Entity<'effect'> => !!entity);
    const effectPresentations = earlier.flatMap(disclosure => (disclosure.data.knowledgeEffects ?? []).map(() => ({ project, target: occurrence.target, anchor: reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id) })));
    const applied = applyEffectsAtomic(state, effects, { ...context, state, effectPresentations });
    if (applied.ok) state = applied.state; else uncertain = true;
  }
  return { state, uncertain };
}

/** A true authored fact never propagates to a character. Claims use the state at their actual presentation. */
export function assessPresentationClaims(project: ProjectData, occurrences: NarrativeOccurrence[], referenceEntities: Entity[] = []): NarrativeClaimAssessment[] {
  const entities = [...new Map([...runtimeEntities(project), ...referenceEntities.filter(adoptedRecord)].map(entity => [entity.id, entity])).values()], assertions = entities.filter((entity): entity is Entity<'assertion'> => entity.kind === 'assertion');
  const assessments: NarrativeClaimAssessment[] = [];
  for (const [index, occurrence] of occurrences.entries()) {
    for (const id of presentationLineIds(project, occurrence.target)) {
      const line = entities.find((entity): entity is Entity<'dialogue_line'> => entity.id === id && entity.kind === 'dialogue_line');
      if (!line || !occurrence.state.seenIds.includes(id)) continue;
      const { state, uncertain } = stateAtLine(project, occurrence, line, referenceEntities);
      for (const claimId of line.data.claimAssertionIds ?? []) {
        const claim = assertions.find(assertion => assertion.id === claimId), relevant = claim ? assertions.filter(other => other.data.subjectId === claim.data.subjectId && other.data.predicate === claim.data.predicate) : [];
        const applicable = relevant.map(assertion => {
          const rule = occurrenceContext(project, occurrence, referenceEntities, assertion.id), validity = assertion.data.validity;
          const value = assessWorldValidity(validity ? { ...validity, presentationAnchor: null } : validity, { at: occurrence.worldTick, context: rule });
          if (validity?.presentationAnchor) {
            const anchor = reuseExecutionAnchor(project, validity.presentationAnchor, assertion.id);
            if (anchor.positionStatus === 'unresolved' || anchor.sourceVersionId && ![project.projectId, state.contentVersionId, rule.ruleContext.sourceVersionId].includes(anchor.sourceVersionId)) return { assertion, value: 'unknown' as const };
            if (![anchor.entityId, anchor.blockId, anchor.lineId].filter(Boolean).every(id => state.seenIds.includes(id!))) return { assertion, value: 'false' as const };
          }
          return { assertion, value: assertion.status === 'confirmed' ? value.value : value.value === 'false' ? 'false' as const : 'unknown' as const };
        }).filter(item => item.value !== 'false');
        const normalized = (value: Entity<'assertion'>['data']['value']) => typeof value === 'string' ? { type: 'ref', value } : value;
        const known = state.assertions.filter(value => value.holderId === line.data.speakerId && applicable.some(item => item.assertion.id === value.assertionId && claim && canonicalJson(normalized(item.assertion.data.value)) === canonicalJson(normalized(claim.data.value))));
        const acquired = known.some(value => value.truth === 'true'), unknown = uncertain || !claim || !line.data.speakerId || applicable.some(item => item.value === 'unknown') || known.some(value => value.truth === 'unknown');
        const intent = line.data.assertionIntent ?? 'statement', intentional = intent !== 'statement' && !!line.data.assertionReason?.trim();
        const evidenceIds = [...new Set(applicable.flatMap(item => [item.assertion.id, ...(item.assertion.data.sourceIds ?? []), ...(item.assertion.data.evidenceLocation ? [item.assertion.data.evidenceLocation.entityId] : [])]))];
        assessments.push({ lineId: id, assertionId: claimId, occurrenceIndex: index, positionId: occurrence.target.nodeId ?? occurrence.target.sceneId!, speakerId: line.data.speakerId ?? undefined,
          status: intentional ? 'intentional' : unknown ? 'unknown' : acquired ? 'passed_for_checked_scope' : 'candidate', knowledge: uncertain ? 'unknown' : acquired ? 'acquired' : unknown ? 'unknown' : 'not_acquired',
          message: intentional ? `意図した${intent === 'lie' ? '嘘' : intent === 'misunderstanding' ? '誤解' : '引用'}：${line.data.assertionReason}` : unknown ? '人物・主張・適用時期または知識が未確認です。' : acquired ? 'この提示時点で人物が取得した認識を確認しました。読者の理解は判定しません。' : 'この提示時点で人物が取得していない情報を発言しています。出所と意図を確認してください。',
          counterpartIds: applicable.map(item => item.assertion.id), evidenceIds, observationState: clone(state) });
      }
    }
  }
  return assessments;
}
