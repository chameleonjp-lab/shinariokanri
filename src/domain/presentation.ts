import type { CheckpointData, ContentAnchor, Entity, ID, PresentationConditionResult, ProjectContent, ProjectData, RuntimeContext, RuntimeState, TraceData, TypedValue, ValidationIssue } from './types';
import { validateRuntimeState } from './model';
import { applyEffectsAtomic, DomainValidationError, evaluateCondition, initializeRuntimeState, resetRuntimeLifecycle, runtimeExclusionIssues } from './conditions';
import { buildChapterReadingSequence } from './writingWorkspace';
import { captureRuntimeContent, capturedVersionIssue } from './runtimeVersions';
import type { PresentationOccurrence, ReadingPath, RuntimeTraceExtensions } from './runtimeContracts';
import { canonicalJson } from '../storage/json';
import { validateExternalInput } from './externalInputs';
import { resolvePinnedWorlds } from './pinnedWorlds';
import type { ProjectValidationOptions } from './model';
import { adoptedRecord } from './adoption';
import { evaluateTargetScope } from './stateRules';
import { declaredRegressionPaths, regressionPathCoverage } from './regressionPaths';
import { isTick } from './time';
import { resolveReuseContent, reuseAuthorContent, reuseOrigin, reuseRuleContexts, reuseExecutionAnchor } from './reuse';
import { checkPresentationForeshadows, type NarrativeOccurrence } from './narrative';

export interface PresentationTarget { nodeId?: ID; sceneId?: ID; worldTick?: string; externalValues?: Record<ID, TypedValue>; referenceEntities?: Entity[] }
export type ContentPresentation = { ok: true; state: RuntimeState; observationState: RuntimeState; conditions: PresentationConditionResult[] } | { ok: false; issues: ValidationIssue[] };
const active = <K extends Entity['kind']>(project: ProjectData, kind: K): Entity<K>[] => project.entities.filter((entity): entity is Entity<K> => entity.kind === kind && adoptedRecord(entity));
const problem = (path: string, message: string, code: ValidationIssue['code'] = 'REFERENCE_INVALID'): ContentPresentation => ({ ok: false, issues: [{ code, path, message }] });

export function presentationRuleContext(project: ProjectData, target: PresentationTarget): NonNullable<RuntimeContext['ruleContext']> {
  const node = active(project, 'flow_node').find(item => item.id === target.nodeId);
  const scene = active(project, 'scene').find(item => item.id === (target.sceneId ?? node?.data.sceneId));
  return { projectId: project.projectId, worldTick: target.worldTick, graphId: node ? active(project, 'flow_graph').find(graph => graph.data.nodeIds.includes(node.id))?.id : undefined, chapterId: scene?.data.chapterId ?? (scene ? active(project, 'chapter').find(chapter => chapter.data.sceneIds.includes(scene.id))?.id : undefined) };
}

/** Choice text is presented only by a manual choice, including disabled candidates shown to the author. */
export function presentationLineIds(project: ProjectData, target: PresentationTarget): ID[] {
  const node = active(project, 'flow_node').find(item => item.id === target.nodeId);
  const scene = active(project, 'scene').find(item => item.id === (target.sceneId ?? node?.data.sceneId));
  const policy = node?.data.executionPolicy ?? (node?.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
  return [...new Set([...(scene?.data.dialogueLineIds ?? []), ...(node && policy === 'manual_choice' ? active(project, 'flow_edge').filter(edge => edge.data.fromId === node.id).flatMap(edge => edge.data.choiceLineId ? [edge.data.choiceLineId] : []) : [])])];
}

export function presentationAnchorApplies(project: ProjectData, state: RuntimeState, anchor: ContentAnchor, target: PresentationTarget, declarationId?: ID): boolean {
  if (anchor.positionStatus === 'unresolved') return false;
  const declaration = declarationId ? reuseOrigin(project, declarationId) : undefined;
  if (anchor.sourceVersionId && ![project.projectId, state.contentVersionId, reuseOrigin(project, anchor.entityId)?.sourceVersionId, declaration?.sourceVersionId].includes(anchor.sourceVersionId)) return false;
  const node = active(project, 'flow_node').find(item => item.id === target.nodeId);
  const sceneId = target.sceneId ?? node?.data.sceneId;
  const scene = active(project, 'scene').find(item => item.id === sceneId);
  const lines = presentationLineIds(project, target);
  if (![target.nodeId, sceneId, ...lines].includes(anchor.entityId)) return false;
  return [anchor.entityId, anchor.blockId, anchor.lineId].filter((id): id is ID => !!id).every(id => state.seenIds.includes(id));
}

/** Reading order is block/line order and code-point position, never event/world-date order. */
export function presentationAnchorOrder(project: ProjectData, left: ContentAnchor, right: ContentAnchor, target: PresentationTarget): boolean | undefined {
  if (left.positionStatus === 'unresolved' || right.positionStatus === 'unresolved') return undefined;
  const node = active(project, 'flow_node').find(item => item.id === target.nodeId);
  const scene = active(project, 'scene').find(item => item.id === (target.sceneId ?? node?.data.sceneId));
  const lineIds = presentationLineIds(project, target);
  const positions = [...(scene?.data.body ?? []).map(block => block.id)];
  for (const lineId of lineIds) positions.push(lineId, ...(active(project, 'dialogue_line').find(line => line.id === lineId)?.data.text ?? []).map(block => block.id));
  const leftBlock = left.blockId ?? left.lineId ?? (lineIds.includes(left.entityId) ? left.entityId : undefined);
  const rightBlock = right.blockId ?? right.lineId ?? (lineIds.includes(right.entityId) ? right.entityId : undefined);
  const first = positions.indexOf(leftBlock ?? ''), second = positions.indexOf(rightBlock ?? '');
  if (first >= 0 && second >= 0 && first !== second) return first < second;
  if (leftBlock !== rightBlock || left.entityId !== right.entityId || left.start == null || right.start == null || left.start === right.start) return undefined;
  if (left.start < right.start && left.end != null && left.end > right.start || right.start < left.start && right.end != null && right.end > left.start) return undefined;
  return left.start < right.start;
}

/** Shared atomic arrival for flow and chapter presentation. Conditions precede every disclosure effect. */
export function presentContent(project: ProjectData, state: RuntimeState, target: PresentationTarget): ContentPresentation {
  const checked = validateRuntimeState(state); if (!checked.ok) return { ok: false, issues: checked.issues };
  const externalIssues = validateExternalInput(project, target.externalValues ?? {}, undefined, target.referenceEntities); if (externalIssues.length) return { ok: false, issues: externalIssues };
  try {
    const node = target.nodeId ? active(project, 'flow_node').find(item => item.id === target.nodeId) : undefined;
    if (target.nodeId && !node) return problem('presentation.nodeId', '提示する分岐が存在しないか、削除・不採用です。');
    const sceneId = target.sceneId ?? node?.data.sceneId ?? undefined;
    if (!node && !sceneId) return problem('presentation', '提示する場面または分岐を指定してください。');
    const scene = sceneId ? active(project, 'scene').find(item => item.id === sceneId) : undefined;
    if (sceneId && !scene) return problem('presentation.sceneId', '提示する場面が存在しないか、削除・不採用です。');
    const initialContext = presentationRuleContext(project, { ...target, sceneId });
    const initialIssues = runtimeExclusionIssues({ state, entities: project.entities, referenceEntities: target.referenceEntities, externalValues: target.externalValues, ruleContext: initialContext, ruleContexts: reuseRuleContexts(project, initialContext) });
    if (initialIssues.length) return { ok: false, issues: initialIssues };
    const resolved = { ...target, sceneId }, next = structuredClone(state), seen = new Set(next.seenIds);
    if (node) { next.presentationPosition = node.id; next.visitCounts[node.id] = (next.visitCounts[node.id] ?? 0) + 1; seen.add(node.id); }
    if (scene) {
      seen.add(scene.id); next.visitCounts[scene.id] = (next.visitCounts[scene.id] ?? 0) + 1;
      for (const id of scene.data.blockIds ?? []) seen.add(id);
      for (const block of scene.data.body) seen.add(block.id);
    }
    for (const lineId of presentationLineIds(project, resolved)) {
      const line = active(project, 'dialogue_line').find(item => item.id === lineId);
      if (!line) return problem(`${node?.id ?? scene?.id}.dialogueLineIds`, '提示する台詞が存在しないか、削除・不採用です。');
      seen.add(line.id); next.visitCounts[line.id] = (next.visitCounts[line.id] ?? 0) + 1; for (const block of line.data.text) seen.add(block.id);
    }
    next.seenIds = [...seen];
    const variables = [...active(project, 'variable'), ...(target.referenceEntities ?? []).filter((entity): entity is Entity<'variable'> => entity.kind === 'variable' && adoptedRecord(entity))], ruleContext = presentationRuleContext(project, resolved), context = { state: next, variables, entities: project.entities, referenceEntities: target.referenceEntities, externalValues: target.externalValues, ruleContext, ruleContexts: reuseRuleContexts(project, ruleContext) };
    const conditions: PresentationConditionResult[] = [], disclosures: Entity<'disclosure'>[] = [];
    for (const disclosure of active(project, 'disclosure')) {
      const anchor = reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id);
      const scope = disclosure.data.targetScope;
      const disclosureContext = { ...context, ruleContext: context.ruleContexts[disclosure.id] ?? context.ruleContext };
      const scopeResult = scope ? evaluateTargetScope(scope, disclosureContext) : { value: 'true' };
      if (scopeResult.value === 'false') continue;
      if (anchor.sourceVersionId && ![project.projectId, state.contentVersionId, reuseOrigin(project, anchor.entityId)?.sourceVersionId, reuseOrigin(project, disclosure.id)?.sourceVersionId].includes(anchor.sourceVersionId)) continue;
      const lineIds = presentationLineIds(project, resolved);
      if (![node?.id, scene?.id, ...lineIds].includes(anchor.entityId)) continue;
      if (scopeResult.value === 'unknown') return problem(`${disclosure.id}.targetScope`, '開示の対象範囲・経路を確認できません。', 'CONDITION_UNKNOWN');
      if (anchor.positionStatus === 'unresolved' && [node?.id, scene?.id, ...lineIds].includes(anchor.entityId)) return problem(`${disclosure.id}.anchor`, anchor.positionReason || '提示位置が不明です。本文へ再リンクしてください。', 'CONDITION_UNKNOWN');
      if (!presentationAnchorApplies(project, next, anchor, resolved, disclosure.id)) continue;
      const result = evaluateCondition({ op: 'all', children: [disclosure.data.condition ?? { op: 'constant', value: true }, scope?.routeCondition ?? { op: 'constant', value: true }] }, disclosureContext);
      conditions.push({ targetId: disclosure.id, ...result });
      if (result.value === 'unknown') return problem(`${disclosure.id}.condition`, result.reasons.join('、') || 'この場面の開示条件が未確認です。', 'CONDITION_UNKNOWN');
      if (result.value === 'true') disclosures.push(disclosure);
    }
    const ordered = disclosures.filter(disclosure => (disclosure.data.knowledgeEffects?.length ?? 0) > 0);
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) if (presentationAnchorOrder(project, reuseExecutionAnchor(project, ordered[i].data.anchor, ordered[i].id), reuseExecutionAnchor(project, ordered[j].data.anchor, ordered[j].id), resolved) === undefined) return problem(`${node?.id ?? scene?.id}.disclosures`, '複数の開示効果の提示順が確定していません。段落と文字位置を指定してください。', 'CONDITION_UNKNOWN');
    ordered.sort((left, right) => presentationAnchorOrder(project, reuseExecutionAnchor(project, left.data.anchor, left.id), reuseExecutionAnchor(project, right.data.anchor, right.id), resolved) ? -1 : 1);
    const effects: Entity<'effect'>[] = [], effectPresentations: NonNullable<RuntimeContext['effectPresentations']> = [];
    for (const disclosure of ordered) for (const effectId of disclosure.data.knowledgeEffects ?? []) {
      const effect = [...project.entities, ...(target.referenceEntities ?? [])].find((item): item is Entity<'effect'> => item.kind === 'effect' && item.id === effectId && adoptedRecord(item));
      if (!effect) return problem(`${disclosure.id}.knowledgeEffects`, '開示に指定した効果が存在しないか、削除・不採用です。');
      effects.push(effect); effectPresentations.push({ project, target: resolved, anchor: reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id) });
    }
    const applied = applyEffectsAtomic(next, effects, { ...context, effectPresentations }); if (!applied.ok) return applied;
    applied.state.seenIds = [...new Set([...applied.state.seenIds, ...disclosures.map(disclosure => disclosure.id)])];
    return { ok: true, state: applied.state, observationState: structuredClone(next), conditions };
  } catch (error) { return { ok: false, issues: error instanceof DomainValidationError ? error.issues : [{ code: 'VALIDATION_FAILED', path: 'presentation', message: error instanceof Error ? error.message : '提示を検証できません。' }] }; }
}

export interface ChapterReadingOptions { chapterIds?: ID[]; sceneIds?: ID[]; contentVersionId?: ID; state?: RuntimeState; worldTick?: string; externalValues?: Record<ID, TypedValue>; worldSnapshots?: Record<ID, ProjectContent> }
export interface ChapterReadingSession {
  content: ProjectData; contentVersionId: ID; contentRevision: string; contentHash?: string;
  declarationProject?: ProjectData;
  startState: RuntimeState; state: RuntimeState; chapterIds: ID[]; sceneIds: ID[];
  occurrences: PresentationOccurrence[]; externalValues: Record<ID, TypedValue>; referenceEntities: Entity[];
  worldTick?: string;
  status: 'ready' | 'terminal' | 'unknown' | 'error'; issues: ValidationIssue[];
}
export function chapterNarrativeOccurrences(session: ChapterReadingSession): NarrativeOccurrence[] {
  return session.occurrences.map(occurrence => ({ state: occurrence.after, observationState: occurrence.presentationState ?? undefined, conditions: occurrence.conditionResults, target: { sceneId: occurrence.entityId }, worldTick: session.worldTick, externalValues: occurrence.externalValues ?? session.externalValues }));
}
export function checkChapterForeshadows(session: ChapterReadingSession) {
  return checkPresentationForeshadows(session.content, chapterNarrativeOccurrences(session), session.startState, session.status === 'terminal', session.referenceEntities, session.issues);
}
export async function startChapterReading(project: ProjectData, options: ChapterReadingOptions = {}): Promise<ChapterReadingSession> {
  const declarationProject = structuredClone({ ...project, history: [], snapshots: [], authorAlternatives: undefined, entities: project.entities.filter(entity => ['collection', 'trace', 'checkpoint'].includes(entity.kind)) });
  const worldTick = options.worldTick;
  if (worldTick !== undefined && !isTick(worldTick)) throw new DomainValidationError([{ code: 'VALIDATION_FAILED', path: 'worldTick', message: '提示時点には整数の世界内tickを入力してください。' }]);
  const worldSnapshots = options.worldSnapshots ? structuredClone(options.worldSnapshots) : {};
  const chapterIdsOption = options.chapterIds ? [...options.chapterIds] : undefined, sceneIdsOption = options.sceneIds ? [...options.sceneIds] : undefined;
  const externalValues = structuredClone(options.externalValues ?? {}), requestedState = options.state ? structuredClone(options.state) : undefined;
  const version = options.contentVersionId ?? project.projectId, captured = await captureRuntimeContent(project, version, { worldSnapshots }), content = resolveReuseContent(captured, captured.snapshots);
  const closure = resolvePinnedWorlds(content, worldSnapshots);
  if (closure.errors.length) throw new DomainValidationError([{ code: 'REFERENCE_INVALID', path: 'worldReferences', message: closure.errors[0]! }]);
  const externalIssues = validateExternalInput(content, externalValues, undefined, closure.worlds.flatMap(world => world.entities)); if (externalIssues.length) throw new DomainValidationError(externalIssues);
  if (sceneIdsOption?.some(id => !active(content, 'scene').some(scene => scene.id === id))) throw new DomainValidationError([{ code: 'REFERENCE_INVALID', path: 'sceneIds', message: '読み通し経路に存在しない場面が指定されています。' }]);
  if (chapterIdsOption?.some(id => !active(content, 'chapter').some(chapter => chapter.id === id))) throw new DomainValidationError([{ code: 'REFERENCE_INVALID', path: 'chapterIds', message: '読み通す章が存在しません。' }]);
  const sequence = buildChapterReadingSequence(content, chapterIdsOption, sceneIdsOption);
  if (requestedState && requestedState.contentVersionId !== version) throw new DomainValidationError([{ code: 'VALIDATION_FAILED', path: 'state.contentVersionId', message: '開始状態と読み通し対象の版が違います。変更せず開始を止めました。' }]);
  const state = structuredClone(requestedState ?? initializeRuntimeState(content, version, closure.worlds.flatMap(world => world.entities)));
  state.contentVersionId = version; state.presentationPosition = null; state.provenance = 'partial';
  const validated = validateRuntimeState(state); if (!validated.ok) throw new DomainValidationError(validated.issues);
  const chapterIds = chapterIdsOption ? [...chapterIdsOption] : [...new Set(sequence.flatMap(entry => entry.chapterId ? [entry.chapterId] : []))];
  return { content, declarationProject, contentVersionId: version, contentRevision: content.revision, contentHash: project.snapshots.find(item => item.id === version)?.contentHash, startState: structuredClone(state), state, worldTick, chapterIds, sceneIds: sequence.map(entry => entry.scene.id), occurrences: [], externalValues, referenceEntities: structuredClone(closure.worlds.flatMap(world => world.entities)), status: sequence.length ? 'ready' : 'terminal', issues: [] };
}
export function presentChapterOccurrence(content: ProjectData, state: RuntimeState, target: PresentationTarget & { previousSceneId?: ID; last?: boolean }): ContentPresentation {
  const { sceneId, previousSceneId } = target;
  const from = presentationRuleContext(content, { sceneId: previousSceneId }), to = presentationRuleContext(content, { sceneId });
  const events: ('scene_end' | 'chapter_end')[] = previousSceneId && previousSceneId !== sceneId ? ['scene_end'] : [];
  if (from.chapterId && from.chapterId !== to.chapterId) events.push('chapter_end');
  const reset = resetRuntimeLifecycle({ ...state, ...(state.resetCauses ? { resetCauses: [] } : {}) }, events, { state, entities: content.entities, referenceEntities: target.referenceEntities, externalValues: target.externalValues, ruleContext: presentationRuleContext(content, { sceneId: target.previousSceneId, worldTick: target.worldTick }), ruleContexts: reuseRuleContexts(content, presentationRuleContext(content, { sceneId: target.previousSceneId, worldTick: target.worldTick })) });
  if (!reset.ok) return reset;
  const result = presentContent(content, reset.state, target);
  if (!result.ok) return result;
  if (target.last) {
    const ended = resetRuntimeLifecycle(result.state, ['scene_end', 'chapter_end', 'run_end'], { state: result.state, entities: content.entities, referenceEntities: target.referenceEntities, externalValues: target.externalValues, ruleContext: presentationRuleContext(content, target), ruleContexts: reuseRuleContexts(content, presentationRuleContext(content, target)) });
    if (!ended.ok) return ended;
    result.state = ended.state;
    if (reset.state.resetCauses || ended.state.resetCauses) result.state.resetCauses = [...(reset.state.resetCauses ?? []), ...(ended.state.resetCauses ?? [])];
  }
  return result;
}
export function presentNextChapterScene(project: ProjectData, session: ChapterReadingSession): ChapterReadingSession {
  const versionIssue = capturedVersionIssue(project, session.contentVersionId, session.contentRevision, session.contentHash);
  if (versionIssue) return { ...session, status: 'error', issues: [{ code: 'VALIDATION_FAILED', path: 'contentVersionId', message: versionIssue }] };
  const sceneId = session.sceneIds[session.occurrences.length]; if (!sceneId) return session;
  const result = presentChapterOccurrence(session.content, session.state, { sceneId, worldTick: session.worldTick, previousSceneId: session.occurrences.at(-1)?.entityId, last: session.occurrences.length + 1 === session.sceneIds.length, externalValues: session.externalValues, referenceEntities: session.referenceEntities });
  if (!result.ok) return { ...session, status: result.issues.some(issue => issue.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', issues: result.issues };
  const occurrence: PresentationOccurrence = { entityId: sceneId, occurrenceId: `${sceneId}:${session.occurrences.length + 1}`, before: structuredClone(session.state), after: result.state, presentationState: result.observationState, conditionResults: result.conditions, externalValues: structuredClone(session.externalValues) };
  const occurrences = [...session.occurrences, occurrence];
  return { ...session, state: result.state, occurrences, status: occurrences.length === session.sceneIds.length ? 'terminal' : 'ready', issues: [] };
}
export function backChapterReading(session: ChapterReadingSession): ChapterReadingSession {
  const previous = session.occurrences.at(-1); if (!previous) return { ...session, status: session.sceneIds.length ? 'ready' : 'terminal', issues: [] };
  return { ...session, state: structuredClone(previous.before), occurrences: session.occurrences.slice(0, -1), status: 'ready', issues: [] };
}
export interface ChapterReadingRecord { checkpoint: CheckpointData; trace: TraceData & RuntimeTraceExtensions; content: ProjectContent }
export function pinChapterReadingRecord(session: ChapterReadingSession, ids: { checkpointId: ID; snapshotId: ID }, declarationProject: ProjectData = session.declarationProject ?? session.content): ChapterReadingRecord {
  const stateForRecord = (state: RuntimeState) => ({ ...structuredClone(state), contentVersionId: ids.snapshotId });
  const readingPath: ReadingPath = { chapterIds: [...session.chapterIds], sceneIds: [...session.sceneIds], occurrences: session.occurrences.map(occurrence => ({ ...structuredClone(occurrence), before: stateForRecord(occurrence.before), after: stateForRecord(occurrence.after), ...(occurrence.presentationState ? { presentationState: stateForRecord(occurrence.presentationState) } : {}) })) };
  const { snapshots: _snapshots, history: _history, authorAlternatives: _authorAlternatives, ...content } = reuseAuthorContent(session.content);
  const dialogue = active(session.content, 'dialogue_line'), scenes = active(session.content, 'scene');
  const pathTargets = new Set([...session.sceneIds, ...scenes.filter(scene => session.sceneIds.includes(scene.id)).flatMap(scene => (scene.data as Entity<'scene'>['data'] & { dialogueLineIds?: ID[] | null }).dialogueLineIds ?? [])]);
  const disclosed = active(session.content, 'disclosure').filter(disclosure => pathTargets.has(disclosure.data.anchor.entityId));
  const observations = session.occurrences.flatMap(occurrence => occurrence.conditionResults);
  return {
    content: structuredClone(content),
    checkpoint: { contentVersionId: ids.snapshotId, contentRevision: session.contentRevision, runtimeState: stateForRecord(session.startState), origin: 'partial' },
    trace: { ...(declaredRegressionPaths(declarationProject).ids.length ? { regressionDeclarations: { projectRevision: declarationProject.revision, traceIds: declaredRegressionPaths(declarationProject).ids } } : {}), contentVersionId: ids.snapshotId, contentRevision: session.contentRevision, startCheckpointId: ids.checkpointId, seed: session.startState.rngSeed, engineVersion: '1.0.0', ...(session.worldTick !== undefined ? { initialWorldTick: session.worldTick } : {}), initialExternalValues: structuredClone(session.externalValues), externalMode: Object.keys(session.externalValues).length ? 'stub' : null, steps: [], mode: 'chapters', readingPath, coverage: {
      scenes: { checked: new Set(session.occurrences.map(occurrence => occurrence.entityId)).size, total: scenes.length },
      dialogue: { checked: dialogue.filter(line => session.state.seenIds.includes(line.id)).length, total: dialogue.length }, choices: { checked: 0, total: 0 },
      conditionTrue: { checked: new Set(observations.filter(result => result.value === 'true').map(result => result.targetId)).size, total: disclosed.length },
      conditionFalse: { checked: new Set(observations.filter(result => result.value === 'false').map(result => result.targetId)).size, total: disclosed.length }, declaredTests: regressionPathCoverage(declarationProject, { contentVersionId: session.contentVersionId, mode: 'chapters', steps: [], readingPath: { ...readingPath, occurrences: readingPath.occurrences.map(occurrence => ({ ...occurrence, before: { ...occurrence.before, contentVersionId: session.contentVersionId }, after: { ...occurrence.after, contentVersionId: session.contentVersionId }, ...(occurrence.presentationState ? { presentationState: { ...occurrence.presentationState, contentVersionId: session.contentVersionId } } : {}) })) } }, session.startState, session.status),
    } },
  };
}

/** Replays the captured scene occurrences; recorded assertions cannot substitute for actual execution. */
export async function replayChapterReading(project: ProjectData, trace: TraceData & RuntimeTraceExtensions, checkpoint: CheckpointData, options: Pick<ProjectValidationOptions, 'worldSnapshots'> = {}): Promise<ChapterReadingSession> {
  if (trace.mode !== 'chapters' || !trace.readingPath || trace.steps.length || trace.contentVersionId !== checkpoint.contentVersionId) throw new DomainValidationError([{ code: 'VALIDATION_FAILED', path: 'readingPath', message: '章読み通し記録の版または形式が一致しません。' }]);
  let session = await startChapterReading(project, { contentVersionId: trace.contentVersionId, chapterIds: trace.readingPath.chapterIds, sceneIds: trace.readingPath.sceneIds, state: checkpoint.runtimeState, worldTick: trace.initialWorldTick ?? undefined, externalValues: trace.initialExternalValues ?? {}, worldSnapshots: options.worldSnapshots });
  if (trace.contentRevision && trace.contentRevision !== session.contentRevision || checkpoint.contentRevision && checkpoint.contentRevision !== session.contentRevision) throw new DomainValidationError([{ code: 'VALIDATION_FAILED', path: 'contentRevision', message: '記録した開始状態と内容版の更新番号が違います。' }]);
  const seen = new Set<string>();
  for (const [index, occurrence] of trace.readingPath.occurrences.entries()) {
    if (seen.has(occurrence.occurrenceId) || occurrence.entityId !== trace.readingPath.sceneIds[index] || canonicalJson(session.state) !== canonicalJson(occurrence.before)) throw new DomainValidationError([{ code: 'INTEGRITY_FAILED', path: `readingPath.occurrences[${index}]`, message: '読み通しの順序・開始状態または提示識別子が一致しません。' }]);
    seen.add(occurrence.occurrenceId);
    session = presentNextChapterScene(project, session);
    const observed = session.occurrences.at(-1);
    if (occurrence.presentationState && (!observed?.presentationState || canonicalJson(observed.presentationState) !== canonicalJson(occurrence.presentationState))) throw new DomainValidationError([{ code: 'INTEGRITY_FAILED', path: `readingPath.occurrences[${index}].presentationState`, message: '提示前の観測状態と再実行が一致しません。' }]);
    if (!observed || canonicalJson(observed.after) !== canonicalJson(occurrence.after) || canonicalJson(observed.conditionResults) !== canonicalJson(occurrence.conditionResults)) throw new DomainValidationError([{ code: 'INTEGRITY_FAILED', path: `readingPath.occurrences[${index}]`, message: '記録された提示根拠と再実行が一致しません。' }]);
    // This is an opaque, captured occurrence identity, not a reference to the
    // scene embedded in its historical text. Cloning remaps entityId separately.
    // Keep it only after the independently executed states and observations match.
    observed.occurrenceId = occurrence.occurrenceId;
  }
  return session;
}
