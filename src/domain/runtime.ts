import type { CheckpointData, Condition, Entity, EntityKind, Expression, ID, PresentationConditionResult, ProjectContent, ProjectData, RuntimeState, TraceData, Trigger, TypedValue } from './types';
import { emptyRuntimeState, getEntitiesByKind, getEntity as getAuthorEntity, validateInitialPresentationResults, validateProject, validateRuntimeState, validateVariableValue } from './model';
import { applyEffectsAtomic, evaluateCondition, initializeRuntimeState, resetRuntimeLifecycle, runtimeExclusionIssues } from './conditions';
import { isTick, resolveTime } from './time';
import { presentContent, presentationAnchorApplies, presentationAnchorOrder, presentationRuleContext } from './presentation';
import { declaredRegressionPaths, regressionPathCoverage } from './regressionPaths';
import { resolveReuseContent, reuseAuthorContent, reuseRuleContexts, reuseExecutionAnchor } from './reuse';
import { adoptedRecord } from './adoption';
import { checkPresentationForeshadows } from './narrative';
import { evaluateScenarioException, evaluateTargetScope } from './stateRules';

export type TrialStatus = 'ready' | 'terminal' | 'blocked' | 'unknown' | 'error';
export interface RuntimeIssue { code: string; message: string; path: string }
export interface RuntimeDiff { path: string; before: unknown; after: unknown; edgeIds?: ID[] }
export type ConditionObservation = PresentationConditionResult;
export interface TrialChoice {
  edgeId: ID;
  label: string;
  toId: ID | null;
  result: 'true' | 'false' | 'unknown';
  reasons: string[];
  priority: number;
}
export interface TriggerOccurrence {
  triggerId?: ID;
  event: Trigger['event'];
  eventKey: string;
  occurrenceId: string;
}
export interface TrialRequest {
  edgeId?: ID;
  event?: TriggerOccurrence;
  /** A declared author action; draw only from candidates whose condition is true. */
  random?: boolean;
  worldTick?: string;
  stub?: TrialStubValues;
}
export interface TrialStubValues { variables?: Record<ID, TypedValue>; external?: Record<ID, TypedValue> }
export interface TrialTraceStep {
  fromId: ID;
  toId: ID;
  edgeIds: ID[];
  before: RuntimeState;
  after: RuntimeState;
  conditionResults: ConditionObservation[];
  presentationState?: RuntimeState;
  changes: RuntimeDiff[];
  request: TrialRequest;
  triggerId?: ID;
  externalValuesBefore: Record<ID, TypedValue>;
  externalValuesAfter: Record<ID, TypedValue>;
}
export interface TrialHistoryEntry {
  state: RuntimeState;
  status: TrialStatus;
  issues: RuntimeIssue[];
  lastDiff: RuntimeDiff[];
  traceLength: number;
  externalValues: Record<ID, TypedValue>;
  pendingPresentation?: ID;
}
export interface TrialSession {
  /** Captured author content is read-only input for this trial, never written by the engine. */
  content: ProjectData;
  /** Declaration registry at capture time, kept separate from the executed edition. */
  declarationProject?: ProjectData;
  state: RuntimeState;
  nodeId: ID | null;
  status: TrialStatus;
  contentRevision: string;
  startState: RuntimeState;
  /** Disclosure conditions captured before the initial presentation's effects. */
  startConditionResults: ConditionObservation[];
  startPresentationState?: RuntimeState;
  startCheckpointId?: ID;
  history: TrialHistoryEntry[];
  trace: TrialTraceStep[];
  issues: RuntimeIssue[];
  lastDiff: RuntimeDiff[];
  externalValues: Record<ID, TypedValue>;
  startExternalValues: Record<ID, TypedValue>;
  pendingPresentation?: ID;
  referenceEntities?: Entity[];
  initialWorldTick?: string;
}
export interface TrialStartOptions {
  /** Internal capture input; browser callers use the hash-verifying runtimeVerified entry points. */
  referenceEntities?: Entity[];
  worldTick?: string;
  entryId?: ID;
  checkpointId?: ID;
  state?: RuntimeState;
  seed?: string;
  contentVersionId?: ID;
  stub?: TrialStubValues;
  /** Recorded initial presentation evidence when resuming a captured trial. */
  presentationResults?: ConditionObservation[];
  presentationState?: RuntimeState;
}

const clone = <T>(value: T): T => structuredClone(value);
/** Runtime records cross canonical JSON boundaries; object insertion order is not state. */
function canonicalRuntimeValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalRuntimeValue).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalRuntimeValue(record[key])}`).join(',')}}`;
}
const sameRuntimeValue = (left: unknown, right: unknown): boolean => canonicalRuntimeValue(left) === canonicalRuntimeValue(right);
const issue = (code: string, message: string, path = 'runtime'): RuntimeIssue => ({ code, message, path });
const active = <T extends { deletedAt?: string | null; status?: string }>(entities: T[]): T[] =>
  entities.filter(adoptedRecord);
interface ContentIndex {
  byId: Map<ID, Entity>;
  activeByKind: Map<EntityKind, Entity[]>;
  edgesFrom: Map<ID, Entity<'flow_edge'>[]>;
}
// Memoize only captured content. Mutable author documents never enter this cache.
const capturedIndices = new WeakMap<ProjectData, ContentIndex>();
const capturedReferences = new WeakMap<ProjectData, Entity[]>();
const runtimeEntities = (project: ProjectData) => [...project.entities, ...(capturedReferences.get(project) ?? [])];
const activeKind = <K extends EntityKind>(project: ProjectData, kind: K): Entity<K>[] => {
  const index = capturedIndices.get(project);
  return index ? (index.activeByKind.get(kind) ?? []) as Entity<K>[] : active(getEntitiesByKind(project, kind));
};
const getEntity = (project: ProjectData, id: ID): Entity | undefined => {
  const index = capturedIndices.get(project);
  return index ? index.byId.get(id) : getAuthorEntity(project, id);
};
const nodes = (project: ProjectData) => activeKind(project, 'flow_node');
const edges = (project: ProjectData) => activeKind(project, 'flow_edge');
const variables = (project: ProjectData) => activeKind(project, 'variable');
const graphs = (project: ProjectData) => activeKind(project, 'flow_graph');
const declaredEffects = (project: ProjectData) => activeKind(project, 'effect');
function versionContent(project: ProjectData, version: ID): ProjectData | undefined {
  if (version === project.projectId) return project;
  const snapshot = project.snapshots.find(snapshot => snapshot.id === version);
  return snapshot ? { ...snapshot.content, snapshots: project.snapshots, history: [] } : undefined;
}
function captureContent(project: ProjectData, references: Entity[] = []): ProjectData {
  const { authorAlternatives: _authorAlternatives, ...branchFree } = project;
  const raw = { ...clone({ ...branchFree, history: [], snapshots: [] }), snapshots: project.snapshots };
  const captured = resolveReuseContent(raw, project.snapshots);
  const index: ContentIndex = { byId: new Map(), activeByKind: new Map(), edgesFrom: new Map() };
  capturedReferences.set(captured, clone(references));
  for (const entity of [...captured.entities, ...(capturedReferences.get(captured) ?? [])]) {
    if (entity.deletedAt) continue;
    index.byId.set(entity.id, entity);
    if (!adoptedRecord(entity)) continue;
    const kind = index.activeByKind.get(entity.kind) ?? [];
    kind.push(entity);
    index.activeByKind.set(entity.kind, kind);
    if (entity.kind === 'flow_edge') {
      const from = index.edgesFrom.get(entity.data.fromId) ?? [];
      from.push(entity);
      index.edgesFrom.set(entity.data.fromId, from);
    }
  }
  capturedIndices.set(captured, index);
  return captured;
}
export function getTrialContent(project: ProjectData, session: TrialSession): ProjectData {
  return session.content ?? versionContent(project, session.state.contentVersionId) ?? project;
}
export function getTrialNode(project: ProjectData, session: TrialSession): Entity<'flow_node'> | undefined {
  return findNode(getTrialContent(project, session), session.nodeId);
}
const findNode = (project: ProjectData, id: ID | null): Entity<'flow_node'> | undefined => {
  const node = id === null ? undefined : getEntity(project, id);
  return node?.kind === 'flow_node' && node.status !== 'rejected' ? node : undefined;
};
const nodeEdges = (project: ProjectData, id: ID) => {
  const index = capturedIndices.get(project);
  return index ? index.edgesFrom.get(id) ?? [] : edges(project).filter(edge => edge.data.fromId === id);
};
const evalAt = (project: ProjectData, state: RuntimeState, condition?: Condition | null, externalValues?: Record<ID, TypedValue>) =>
  evaluateCondition(condition ?? { op: 'constant', value: true }, { state, variables: variables(project), entities: runtimeEntities(project), externalValues });
const resultSession = (session: TrialSession, status: TrialStatus, issues: RuntimeIssue[]): TrialSession =>
  ({ ...session, nodeId: session.state.presentationPosition, status, issues });
function reuseIssue(node: Entity<'flow_node'> | undefined): RuntimeIssue | undefined {
  return node?.data.reuse && node.data.reuse.mode !== 'clone'
    ? issue('VALIDATION_FAILED', '共通元を固定版から解決する参照・上書き試読は未対応です。実行を停止しています。', `${node.id}.reuse`)
    : undefined;
}
function errorIssues(error: unknown): RuntimeIssue[] {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) return error.issues as RuntimeIssue[];
  return [issue('VALIDATION_FAILED', error instanceof Error ? error.message : '試読の入力を検証できません。')];
}

export function declaredEntrypoints(project: ProjectData): ID[] {
  project = reuseAuthorContent(project);
  const roots = graphs(project).filter(graph => graph.projectId === project.projectId && !graph.data.parentGraphId);
  if (roots.length > 0) return [...new Set(roots.flatMap(graph => graph.data.entryIds))];
  return nodes(project).filter(node => node.projectId === project.projectId && node.data.nodeType === 'entry').map(node => node.id);
}
function declaredEntry(project: ProjectData): ID | undefined {
  const entries = declaredEntrypoints(project);
  return entries.length === 1 ? entries[0] : undefined;
}

/** Flow and chapter readers use one atomic presentation contract. */
function present(project: ProjectData, state: RuntimeState, nodeId: ID, externalValues?: Record<ID, TypedValue>, worldTick?: string) {
  return presentContent(project, state, { nodeId, externalValues, referenceEntities: capturedReferences.get(project), worldTick });
}

export function getTrialChoices(project: ProjectData, session: TrialSession): TrialChoice[] {
  try { return trialChoicesInternal(project, session); }
  catch { return []; }
}
function trialChoicesInternal(project: ProjectData, session: TrialSession): TrialChoice[] {
  const content = session.content ?? versionContent(project, session.state.contentVersionId);
  if (!content) return [];
  project = content;
  const node = findNode(project, session.nodeId);
  if (!node || node.data.nodeType === 'terminal') return [];
  const gate = evalAt(project, session.state, node.data.gate, session.externalValues);
  return nodeEdges(project, node.id).map<TrialChoice>(edge => {
    const condition = evalAt(project, session.state, edge.data.condition, session.externalValues);
    const result = gate.value === 'false' || condition.value === 'false' ? 'false'
      : gate.value === 'unknown' || condition.value === 'unknown' ? 'unknown' : 'true';
    return {
      edgeId: edge.id, label: edge.data.label || edge.name || '次へ',
      toId: typeof edge.data.toId === 'string' ? edge.data.toId : null,
      result, reasons: [...gate.reasons, ...condition.reasons], priority: edge.data.priority ?? 0,
    };
  }).sort((a, b) => a.priority - b.priority);
}

function inspect(project: ProjectData, session: TrialSession): TrialSession {
  const node = findNode(project, session.nodeId);
  if (!node) return resultSession(session, 'error', [issue('REFERENCE_INVALID', '現在の分岐が存在しません。')]);
  const unsupportedReuse = reuseIssue(node);
  if (unsupportedReuse) return resultSession(session, 'error', [unsupportedReuse]);
  if (node.data.nodeType === 'terminal') {
    return node.data.terminalReason?.trim()
      ? resultSession(session, 'terminal', [])
      : resultSession(session, 'error', [issue('VALIDATION_FAILED', '終端には終了理由が必要です。', `${node.id}.terminalReason`)]);
  }
  const gate = evalAt(project, session.state, node.data.gate, session.externalValues);
  if (gate.value === 'unknown') return resultSession(session, 'unknown', [issue('CONDITION_UNKNOWN', gate.reasons.join('、') || '発火条件の値が不足しています。', `${node.id}.gate`)]);
  if (gate.value === 'false') return node.data.fallbackId
    ? resultSession(session, 'ready', [])
    : resultSession(session, 'blocked', [issue('TRANSITION_BLOCKED', '発火条件を満たさず、代替の進行先もありません。', `${node.id}.gate`)]);
  if (node.data.nodeType === 'call' || (node.data.nodeType === 'exit' && session.state.callStack.length > 0)) {
    return resultSession(session, 'ready', []);
  }
  const policy = node.data.executionPolicy ?? (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
  const choices = trialChoicesInternal(project, session);
  if (choices.some(choice => !Number.isSafeInteger(choice.priority))) return resultSession(session, 'error', [issue('VALIDATION_FAILED', '優先値には安全な整数が必要です。', `${node.id}.priority`)]);
  if (policy !== 'manual_choice' && new Set(choices.map(choice => choice.priority)).size !== choices.length) {
    return resultSession(session, 'error', [issue('VALIDATION_FAILED', '自動分岐の優先値が重複しています。', `${node.id}.priority`)]);
  }
  const unknown = choices.filter(choice => choice.result === 'unknown');
  const enabled = choices.filter(choice => choice.result === 'true');
  if (unknown.length > 0 && (policy !== 'manual_choice' || enabled.length === 0)) {
    return resultSession(session, 'unknown', [issue('CONDITION_UNKNOWN', '未確認の条件があり、進行先を確定できません。', node.id)]);
  }
  if (enabled.length === 0 && !node.data.fallbackId) {
    return resultSession(session, 'blocked', [issue('TRANSITION_BLOCKED', '有効な選択肢がありません。意図した終端とは別の行き止まりです。', node.id)]);
  }
  return resultSession(session, 'ready', []);
}

export function startTrial(project: ProjectData, options: TrialStartOptions = {}): TrialSession {
  try { return startTrialInternal(project, options); }
  catch (error) {
    const state = options.state ? clone(options.state) : emptyRuntimeState(options.contentVersionId ?? project.projectId);
    return { content: project, state, nodeId: state.presentationPosition, contentRevision: project.revision, startState: clone(state), startConditionResults: [], status: 'error', history: [], trace: [], issues: errorIssues(error), lastDiff: [], externalValues: {}, startExternalValues: {} };
  }
}
function startTrialInternal(project: ProjectData, options: TrialStartOptions = {}, alreadyCaptured = false): TrialSession {
  const source = project;
  const version = options.contentVersionId ?? project.projectId;
  const content = alreadyCaptured ? project : versionContent(project, version);
  if (content) project = content;
  if (!alreadyCaptured) project = captureContent(project, options.referenceEntities);
  let state = initializeRuntimeState(project, version, options.referenceEntities);
  let startConditionResults = clone(options.presentationResults ?? []);
  let startPresentationState = options.presentationState ? clone(options.presentationState) : undefined;
  let checkpointId: ID | undefined;
  let presentationIssues: RuntimeIssue[] | undefined;
  let pendingPresentation: ID | undefined;
  let failure: RuntimeIssue | undefined = content && (!project.worldReferences.length || options.referenceEntities) ? undefined : issue('REFERENCE_INVALID', '指定した不変作品版が見つかりません。', 'contentVersionId');
  if (options.worldTick !== undefined && !isTick(options.worldTick)) failure = issue('VALIDATION_FAILED', '提示時点には整数の世界内tickを入力してください。', 'worldTick');
  if (options.checkpointId) {
    const checkpoint = getEntity(source, options.checkpointId);
    if (!checkpoint || checkpoint.kind !== 'checkpoint' || checkpoint.deletedAt) {
      failure = issue('REFERENCE_INVALID', '指定した途中開始の記録が存在しません。', 'checkpointId');
    } else if (checkpoint.data.contentVersionId !== version || checkpoint.data.runtimeState.contentVersionId !== version || (checkpoint.data.contentRevision != null && checkpoint.data.contentRevision !== project.revision)) {
      failure = issue('VALIDATION_FAILED', '開始状態と作品版が違います。移行または再作成が必要です。', `${checkpoint.id}.contentVersionId`);
    } else {
      state = clone(checkpoint.data.runtimeState);
      startConditionResults = clone(checkpoint.data.presentationResults ?? []);
      startPresentationState = checkpoint.data.presentationState ? clone(checkpoint.data.presentationState) : undefined;
      state.provenance = state.provenance === 'stub' ? 'stub'
        : state.provenance === 'imported' || checkpoint.data.origin === 'imported' ? 'imported'
        : state.provenance === 'partial' || checkpoint.data.origin !== 'full_play' ? 'partial' : 'full_play';
      checkpointId = checkpoint.id;
      if (checkpoint.data.presentationResults != null) failure = validateInitialPresentationResults(state, checkpoint.data.presentationResults, project.entities, `${checkpoint.id}.presentationResults`)[0];
    }
  } else if (options.state) {
    if (options.state.contentVersionId !== version) {
      failure = issue('VALIDATION_FAILED', '指定した開始状態と作品版が違います。', 'state.contentVersionId');
    } else {
      state = clone(options.state);
      if (options.presentationResults != null) failure = validateInitialPresentationResults(state, options.presentationResults, project.entities)[0];
      if (state.provenance === 'full_play') state.provenance = 'partial';
    }
  }
  if (options.seed !== undefined) state.rngSeed = options.seed;
  const entry = options.entryId ?? state.presentationPosition ?? declaredEntry(project);
  if (!failure) {
    const shape = validateRuntimeState(state);
    if (!shape.ok) failure = shape.issues[0];
    for (const [id, value] of Object.entries(state.variableValues)) {
      const variable = variables(project).find(variable => variable.id === id);
      const errors = variable ? validateVariableValue(variable, value, `${id}.value`) : [issue('REFERENCE_INVALID', '開始状態に対象版の宣言がない状態値があります。', id)];
      if (errors.length) { failure = errors[0]; break; }
    }
    const ruleContext = presentationRuleContext(project, { nodeId: entry ?? undefined, worldTick: options.worldTick });
    if (!failure) failure = runtimeExclusionIssues({ state, variables: variables(project), entities: runtimeEntities(project), ruleContext, ruleContexts: reuseRuleContexts(project, ruleContext) })[0];
  }
  if (checkpointId && state.provenance === 'full_play') {
    // A hand-edited origin label cannot turn an arbitrary checkpoint into a
    // declared initial play. Reconstruct its opening from the captured edition.
    const fresh = entry && declaredEntrypoints(project).includes(entry) ? startTrialInternal(source, {
      contentVersionId: version, entryId: entry, seed: state.rngSeed,
      worldTick: options.worldTick, referenceEntities: capturedReferences.get(project),
    }) : undefined;
    if (!fresh || fresh.status === 'error' || !sameRuntimeValue(fresh.startState, state)) state.provenance = 'partial';
  }
  if (options.entryId && !declaredEntrypoints(project).includes(options.entryId) && !checkpointId) state.provenance = 'partial';
  if (!failure && !entry) failure = issue('VALIDATION_FAILED', '開始点が一つに決まりません。入口を指定してください。', 'entryId');
  if (!failure && !findNode(project, entry ?? null)) failure = issue('REFERENCE_INVALID', '指定した開始点が存在しません。', 'entryId');
  if (!failure) failure = reuseIssue(findNode(project, entry ?? null));
  if (!failure && entry) {
    // A checkpoint already includes its current visit; do not replay entering effects or visits.
    if ((checkpointId || options.state) && state.presentationPosition && entry !== state.presentationPosition && state.provenance !== 'stub') state.provenance = 'partial';
    if (!(checkpointId || options.state) || entry !== state.presentationPosition || ((state.visitCounts[entry] ?? 0) === 0 && !state.seenIds.includes(entry))) {
      const arrival = present(project, state, entry, undefined, options.worldTick);
      if (arrival.ok) {
        state = arrival.state; startConditionResults = arrival.conditions; startPresentationState = arrival.observationState;
        const target = findNode(project, entry);
        if (target?.data.nodeType === 'terminal') {
          const ended = resetRuntimeLifecycle(state, [...(target.data.sceneId ? ['scene_end' as const] : []), ...(presentationRuleContext(project, { nodeId: entry }).chapterId ? ['chapter_end' as const] : []), 'run_end'], { state, variables: variables(project), entities: runtimeEntities(project), ruleContext: presentationRuleContext(project, { nodeId: entry, worldTick: options.worldTick }), ruleContexts: reuseRuleContexts(project, presentationRuleContext(project, { nodeId: entry, worldTick: options.worldTick })) });
          if (ended.ok) state = ended.state; else presentationIssues = ended.issues;
        }
      }
      else { presentationIssues = arrival.issues; pendingPresentation = entry; state = { ...state, presentationPosition: entry }; }
    } else state.presentationPosition = entry;
    if (options.entryId && !declaredEntrypoints(project).includes(options.entryId) && !checkpointId) state.provenance = 'partial';
  }
  if (startPresentationState) startPresentationState.provenance = state.provenance;
  const session: TrialSession = {
    content: project, referenceEntities: clone(capturedReferences.get(project) ?? []), initialWorldTick: options.worldTick,
    declarationProject: clone({ ...source, history: [], snapshots: [], authorAlternatives: undefined, entities: source.entities.filter(entity => ['collection', 'trace', 'checkpoint'].includes(entity.kind)) }),
    state, nodeId: state.presentationPosition, contentRevision: project.revision,
    startState: clone(state), startConditionResults, startPresentationState, startCheckpointId: checkpointId,
    status: 'ready', history: [], trace: [], issues: [], lastDiff: [], externalValues: {}, startExternalValues: {},
    pendingPresentation,
  };
  if (failure) return resultSession(session, failure.code === 'CONDITION_UNKNOWN' ? 'unknown' : 'error', [failure]);
  if (options.stub) {
    const stub = setTrialStubValues(project, session, options.stub);
    const observation = stub.trace.at(-1)?.presentationState ?? startPresentationState;
    return { ...stub, history: [], trace: [], startState: clone(stub.state), startPresentationState: observation ? { ...clone(observation), provenance: stub.state.provenance } : undefined, startConditionResults: stub.trace.at(-1)?.conditionResults.length ? clone(stub.trace.at(-1)!.conditionResults) : startConditionResults, startExternalValues: clone(stub.externalValues) };
  }
  if (presentationIssues) return resultSession(session, presentationIssues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', presentationIssues);
  return inspect(project, session);
}

/** All RuntimeState fields participate in comparisons, including stack and random position. */
export function diffRuntimeStates(before: RuntimeState, after: RuntimeState): RuntimeDiff[] {
  const changes: RuntimeDiff[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof RuntimeState>) {
    const a = before[key];
    const b = after[key];
    if (sameRuntimeValue(a, b)) continue;
    if ((key === 'variableValues' || key === 'visitCounts') && a && b) {
      const first = a as Record<string, unknown>;
      const second = b as Record<string, unknown>;
      for (const id of new Set([...Object.keys(first), ...Object.keys(second)])) {
        if (!sameRuntimeValue(first[id], second[id])) changes.push({ path: `${key}.${id}`, before: clone(first[id]), after: clone(second[id]) });
      }
    } else changes.push({ path: key, before: clone(a), after: clone(b) });
  }
  return changes;
}

/** The seed and cursor alone determine this sample. No global randomness is used. */
export function sampleRuntime(state: RuntimeState, length: number): { index: number; state: RuntimeState } {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('抽選候補は1件以上必要です。');
  if (!Number.isSafeInteger(state.rngPosition) || state.rngPosition < 0 || !Number.isSafeInteger(state.rngPosition + 1)) throw new RangeError('抽選位置が許容範囲を超えます。');
  let hash = 2166136261;
  const input = `${state.rngSeed}\u0000${state.rngPosition}`;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  return { index: (hash >>> 0) % length, state: { ...clone(state), rngPosition: state.rngPosition + 1 } };
}

function triggerKeys(node: Entity<'flow_node'>, state: RuntimeState, request: TrialRequest) {
  const trigger = node.data.trigger;
  if (!trigger) return { once: undefined, occurrence: undefined };
  const id = trigger.id ?? node.id;
  const scope = trigger.scope ?? 'run';
  const scopeKey = scope === 'across_runs' ? scope : `${scope}:${state.loopNumber}`;
  return {
    once: trigger.repeat === 'once' ? `trigger:${scopeKey}:${id}` : undefined,
    occurrence: request.event ? `occurrence:${scopeKey}:${id}:${request.event.occurrenceId}` : undefined,
  };
}

function checkTrigger(project: ProjectData, node: Entity<'flow_node'>, state: RuntimeState, request: TrialRequest): RuntimeIssue | undefined {
  const trigger = node.data.trigger;
  if (!trigger) return undefined;
  const keys = triggerKeys(node, state, request);
  // Duplicate delivery is a successful no-op, handled by stepTrial before matching the current position.
  if (keys.once && state.onceTriggers.includes(keys.once)) return issue('TRANSITION_BLOCKED', 'この一回限りの発火は実行済みです。', `${node.id}.trigger`);
  if (!request.event || request.event.event !== trigger.event || request.event.eventKey !== trigger.eventKey || (request.event.triggerId && request.event.triggerId !== (trigger.id ?? node.id))) {
    return issue('TRANSITION_BLOCKED', '宣言したきっかけの入力が必要です。条件の成立だけでは実行しません。', `${node.id}.trigger`);
  }
  if (trigger.deadline) {
    const resolved = resolveTime(trigger.deadline, activeKind(project, 'event'));
    if (resolved.status === 'conflict') return issue('TIME_CONSTRAINT_CONFLICT', resolved.reason, `${node.id}.trigger.deadline`);
    if (resolved.status !== 'resolved' || !isTick(request.worldTick) || resolved.calendarId !== project.calendarId) {
      return issue('CONDITION_UNKNOWN', '期限または現在の世界時点を確定できません。', `${node.id}.trigger.deadline`);
    }
    const current = BigInt(request.worldTick), earliest = BigInt(resolved.endEarliest), latest = BigInt(resolved.endLatest);
    if (current > latest || (trigger.deadline.mode === 'interval' && current === latest)) return issue('TRANSITION_BLOCKED', '発火期限を過ぎています。', `${node.id}.trigger.deadline`);
    if (current > earliest) return issue('CONDITION_UNKNOWN', '期限の範囲内に現在時点があり、期限切れか確定できません。', `${node.id}.trigger.deadline`);
  }
  return undefined;
}

function observations(project: ProjectData, session: TrialSession, node: Entity<'flow_node'>): ConditionObservation[] {
  const result: ConditionObservation[] = [];
  if (node.data.gate) result.push({ targetId: node.id, ...evalAt(project, session.state, node.data.gate, session.externalValues) });
  for (const edge of nodeEdges(project, node.id)) if (edge.data.condition) {
    result.push({ targetId: edge.id, ...evalAt(project, session.state, edge.data.condition, session.externalValues) });
  }
  return result;
}

function commitStep(project: ProjectData, session: TrialSession, next: RuntimeState, toId: ID, selected: ID[], request: TrialRequest, conditions: ConditionObservation[]): TrialSession {
  const from = findNode(project, session.nodeId), to = findNode(project, toId);
  const fromScope = presentationRuleContext(project, { nodeId: from?.id }), toScope = presentationRuleContext(project, { nodeId: toId });
  const events: ('scene_end' | 'chapter_end')[] = [];
  if (from?.data.sceneId && from.data.sceneId !== to?.data.sceneId) events.push('scene_end');
  if (fromScope.chapterId && fromScope.chapterId !== toScope.chapterId) events.push('chapter_end');
  const reset = resetRuntimeLifecycle({ ...next, ...(next.resetCauses ? { resetCauses: [] } : {}) }, events, { state: next, variables: variables(project), entities: runtimeEntities(project), externalValues: session.externalValues, ruleContext: presentationRuleContext(project, { nodeId: from?.id, worldTick: request.worldTick }), ruleContexts: reuseRuleContexts(project, presentationRuleContext(project, { nodeId: from?.id, worldTick: request.worldTick })) });
  if (!reset.ok) return resultSession(session, 'error', reset.issues);
  const arrival = present(project, reset.state, toId, session.externalValues, request.worldTick);
  if (!arrival.ok) return resultSession(session, arrival.issues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', arrival.issues);
  const ending: ('scene_end' | 'chapter_end' | 'run_end')[] = [];
  if (to?.data.nodeType === 'terminal') {
    if (to.data.sceneId) ending.push('scene_end');
    if (toScope.chapterId) ending.push('chapter_end');
    ending.push('run_end');
  }
  const endReset = resetRuntimeLifecycle(arrival.state, ending, { state: arrival.state, variables: variables(project), entities: runtimeEntities(project), externalValues: session.externalValues, ruleContext: presentationRuleContext(project, { nodeId: toId, worldTick: request.worldTick }), ruleContexts: reuseRuleContexts(project, presentationRuleContext(project, { nodeId: toId, worldTick: request.worldTick })) });
  if (!endReset.ok) return resultSession(session, 'error', endReset.issues);
  const state = endReset.state;
  if (to?.data.nodeType === 'terminal' && (reset.state.resetCauses || endReset.state.resetCauses)) state.resetCauses = [...(reset.state.resetCauses ?? []), ...(endReset.state.resetCauses ?? [])];
  conditions = [...conditions, ...arrival.conditions];
  const changes = diffRuntimeStates(session.state, state).map(change => ({ ...change, edgeIds: selected }));
  const traceStep: TrialTraceStep = {
    fromId: session.nodeId!, toId, edgeIds: selected, before: clone(session.state), after: clone(state),
    changes, request: clone(request), conditionResults: conditions, presentationState: arrival.observationState,
    triggerId: findNode(project, session.nodeId)?.data.trigger?.id ?? (findNode(project, session.nodeId)?.data.trigger ? session.nodeId! : undefined),
    externalValuesBefore: clone(session.externalValues), externalValuesAfter: clone(session.externalValues),
  };
  const nextSession: TrialSession = {
    ...session, state, nodeId: toId, status: 'ready', issues: [], lastDiff: changes,
    history: [...session.history, { state: clone(session.state), status: session.status, issues: clone(session.issues), lastDiff: clone(session.lastDiff), traceLength: session.trace.length, externalValues: clone(session.externalValues), pendingPresentation: session.pendingPresentation }],
    trace: [...session.trace, traceStep],
  };
  return inspect(project, nextSession);
}

export function stepTrial(project: ProjectData, session: TrialSession, request: TrialRequest = {}): TrialSession {
  if (session.status === 'error' && session.nodeId === null) return session;
  try { return stepTrialInternal(project, session, request); }
  catch (error) { return resultSession(session, 'error', errorIssues(error)); }
}
function stepTrialInternal(project: ProjectData, session: TrialSession, request: TrialRequest = {}): TrialSession {
  if (request.stub) return setTrialStubValues(project, session, request.stub);
  const content = versionContent(project, session.state.contentVersionId);
  if (!content) return resultSession(session, 'error', [issue('REFERENCE_INVALID', '固定した作品版が存在しません。', 'contentVersionId')]);
  project = content;
  if (session.contentRevision !== project.revision) return resultSession(session, 'error', [issue('VALIDATION_FAILED', '作品が変更されました。この記録は再確認待ちです。試読を開始し直してください。', 'contentRevision')]);
  project = session.content;
  if (session.pendingPresentation) return resultSession(session, 'unknown', session.issues.length ? session.issues : [issue('CONDITION_UNKNOWN', '場面の提示条件を先に確認してください。', session.pendingPresentation)]);
  if (session.state.contentVersionId !== session.startState.contentVersionId) return resultSession(session, 'error', [issue('VALIDATION_FAILED', '試読中に作品版が変わりました。', 'contentVersionId')]);
  // Deduplication is scoped to trigger ID, never merely to an event name.
  const eventTriggerId = request.event?.triggerId ?? findNode(project, session.nodeId)?.data.trigger?.id ?? (findNode(project, session.nodeId)?.data.trigger ? session.nodeId! : undefined);
  if (request.event && eventTriggerId && session.trace.some(step => step.triggerId === eventTriggerId && step.request.event?.occurrenceId === request.event?.occurrenceId)) return session;
  const triggerNode = findNode(project, session.nodeId);
  if (triggerNode && request.event) {
    const occurrence = triggerKeys(triggerNode, session.state, request).occurrence;
    if (occurrence && session.state.onceTriggers.includes(occurrence)) return session;
  }
  const current = inspect(project, session);
  if (current.status !== 'ready') return current;
  const node = findNode(project, session.nodeId)!;
  const triggerProblem = checkTrigger(project, node, session.state, request);
  if (triggerProblem) return resultSession(session, triggerProblem.code === 'CONDITION_UNKNOWN' ? 'unknown' : triggerProblem.code === 'TIME_CONSTRAINT_CONFLICT' ? 'error' : 'blocked', [triggerProblem]);
  const gate = evalAt(project, session.state, node.data.gate, session.externalValues);
  const conditions = observations(project, session, node);
  let next = clone(session.state);
  let selected: Entity<'flow_edge'>[] = [];
  let toId: ID | undefined;
  if (gate.value === 'false') toId = node.data.fallbackId ?? undefined;
  else if (node.data.nodeType === 'exit' && next.callStack.length > 0) {
    const child = getEntity(project, next.callStack.at(-1)!.graphId);
    if (!child || child.kind !== 'flow_graph' || !child.data.exitIds.includes(node.id)) return resultSession(session, 'error', [issue('REFERENCE_INVALID', '現在の出口が呼出中グラフの宣言した出口に含まれていません。', node.id)]);
    toId = next.callStack.pop()!.returnNodeId;
  } else if (node.data.nodeType === 'call') {
    const child = node.data.childGraphId ? getEntity(project, node.data.childGraphId) : undefined;
    if (!child || child.kind !== 'flow_graph' || child.data.entryIds.length !== 1) return resultSession(session, 'error', [issue('REFERENCE_INVALID', '呼出先に一つの入口を持つ子グラフが必要です。', `${node.id}.childGraphId`)]);
    const returns = nodeEdges(project, node.id).filter(edge => edge.data.edgeType === 'call_return');
    if (returns.length !== 1 || typeof returns[0].data.toId !== 'string') return resultSession(session, 'error', [issue('REFERENCE_INVALID', '呼出には一つの確定した戻り先が必要です。', node.id)]);
    const returnCondition = evalAt(project, session.state, returns[0].data.condition, session.externalValues);
    if (returnCondition.value === 'unknown') return resultSession(session, 'unknown', [issue('CONDITION_UNKNOWN', returnCondition.reasons.join('、') || '呼出の戻り先条件が未確認です。', returns[0].id)]);
    if (returnCondition.value === 'false') {
      if (!node.data.fallbackId) return resultSession(session, 'blocked', [issue('TRANSITION_BLOCKED', '呼出の戻り先条件を満たしていません。', returns[0].id)]);
      toId = node.data.fallbackId;
    } else {
      selected = returns;
      toId = child.data.entryIds[0];
      const parameters: Record<string, TypedValue> = {};
      for (const parameter of child.data.parameters ?? []) parameters[parameter.key] = clone(parameter.default ?? { type: 'unknown', value: null, reason: '呼出引数が未設定です。' });
      next.callStack.push({ graphId: child.id, returnNodeId: returns[0].data.toId, parameters });
    }
  } else {
    const policy = node.data.executionPolicy ?? (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
    const choices = getTrialChoices(project, session);
    const enabled = choices.filter(choice => choice.result === 'true');
    if (enabled.length === 0) toId = node.data.fallbackId ?? undefined;
    else if (policy === 'manual_choice') {
      let choice: TrialChoice | undefined;
      if (request.random) {
        if (choices.some(candidate => candidate.result === 'unknown')) return resultSession(session, 'unknown', [issue('CONDITION_UNKNOWN', '未確認の抽選候補が残っています。', node.id)]);
        let sample: ReturnType<typeof sampleRuntime>;
        try { sample = sampleRuntime(next, enabled.length); }
        catch { return resultSession(session, 'error', [issue('TRANSITION_BLOCKED', '抽選位置が許容範囲を超えます。', 'rngPosition')]); }
        next = sample.state;
        choice = enabled[sample.index];
      } else choice = choices.find(candidate => candidate.edgeId === request.edgeId);
      if (!choice) return resultSession(session, 'blocked', [issue('TRANSITION_BLOCKED', '進む選択肢を指定してください。', node.id)]);
      if (choice.result !== 'true') return resultSession(session, choice.result === 'unknown' ? 'unknown' : 'blocked', [issue(choice.result === 'unknown' ? 'CONDITION_UNKNOWN' : 'TRANSITION_BLOCKED', choice.reasons.join('、') || 'この選択肢の条件は成立していません。', choice.edgeId)]);
      selected = nodeEdges(project, node.id).filter(edge => edge.id === choice!.edgeId);
    } else {
      const ids = (policy === 'first_match' ? enabled.slice(0, 1) : enabled).map(choice => choice.edgeId);
      selected = ids.map(id => nodeEdges(project, node.id).find(edge => edge.id === id)!);
    }
    if (selected.length > 0) {
      const targets = new Set(selected.map(edge => typeof edge.data.toId === 'string' ? edge.data.toId : null));
      if (targets.size !== 1) return resultSession(session, 'error', [issue('VALIDATION_FAILED', 'all_matchの進行先が異なります。同じ進行先を指定してください。', node.id)]);
      const target = selected[0].data.toId;
      if (typeof target === 'string') toId = target;
    }
  }
  if (!toId || !findNode(project, toId)) return resultSession(session, 'error', [issue('REFERENCE_INVALID', '進行先が未完成、または存在しません。', node.id)]);
  const unsupportedTarget = reuseIssue(findNode(project, toId));
  if (unsupportedTarget) return resultSession(session, 'error', [unsupportedTarget]);
  const effects: Entity<'effect'>[] = [];
  for (const edge of selected) for (const effectId of edge.data.effectIds ?? []) {
    const effect = getEntity(project, effectId);
    if (!effect || effect.kind !== 'effect' || effect.deletedAt || effect.status === 'rejected') return resultSession(session, 'error', [issue('REFERENCE_INVALID', effect?.status === 'rejected' ? '分岐に不採用の効果が指定されています。' : '分岐に指定した効果が存在しないか、削除済みです。', `${edge.id}.effectIds`)]);
    effects.push(effect);
  }
  const applied = applyEffectsAtomic(next, effects, { state: next, variables: variables(project), entities: runtimeEntities(project), externalValues: session.externalValues, ruleContext: presentationRuleContext(project, { nodeId: node.id, worldTick: request.worldTick }), ruleContexts: reuseRuleContexts(project, presentationRuleContext(project, { nodeId: node.id, worldTick: request.worldTick })) });
  if (!applied.ok) return resultSession(session, applied.issues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', applied.issues);
  next = applied.state;
  const keys = triggerKeys(node, session.state, request);
  next.onceTriggers = [...new Set([...next.onceTriggers, ...[keys.once, keys.occurrence].filter((key): key is string => key !== undefined)])];
  return commitStep(project, current, next, toId, selected.map(edge => edge.id), request, conditions);
}

export function backTrial(session: TrialSession): TrialSession {
  const previous = session.history.at(-1);
  if (!previous) return session;
  return {
    ...session, state: clone(previous.state), nodeId: previous.state.presentationPosition,
    status: previous.status, issues: clone(previous.issues), lastDiff: clone(previous.lastDiff),
    externalValues: clone(previous.externalValues),
    pendingPresentation: previous.pendingPresentation,
    history: session.history.slice(0, -1), trace: session.trace.slice(0, previous.traceLength),
  };
}

/** Explicit author assumptions form stub evidence and can be undone with the same Back action. */
export function setTrialStubValues(project: ProjectData, session: TrialSession, values: TrialStubValues): TrialSession {
  try { return setTrialStubValuesInternal(project, session, values); }
  catch (error) { return resultSession(session, 'error', errorIssues(error)); }
}
function setTrialStubValuesInternal(project: ProjectData, session: TrialSession, values: TrialStubValues): TrialSession {
  const content = versionContent(project, session.state.contentVersionId);
  if (!content || content.revision !== session.contentRevision) return resultSession(session, 'error', [issue('VALIDATION_FAILED', '作品版が変わりました。仮値を適用する前に開始し直してください。', 'contentRevision')]);
  project = session.content;
  const external = clone(session.externalValues);
  for (const [id, value] of Object.entries(values.external ?? {})) {
    const contract = getEntity(project, id);
    if (!contract || contract.kind !== 'external_contract') return resultSession(session, 'error', [issue('REFERENCE_INVALID', '仮の外部値には宣言した外部契約が必要です。', id)]);
    if (contract.data.outputType !== value.type && value.type !== 'unknown') return resultSession(session, 'error', [issue('VALIDATION_FAILED', '仮の外部値と宣言した出力型が違います。', id)]);
    external[id] = clone(value);
  }
  const effects = Object.entries(values.variables ?? {}).map(([targetId, value]) => ({ operation: 'set' as const, targetId, value }));
  const applied = applyEffectsAtomic(session.state, effects, { state: session.state, variables: variables(project), entities: runtimeEntities(project), externalValues: external });
  if (!applied.ok) return resultSession(session, applied.issues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', applied.issues);
  let state = { ...applied.state, provenance: 'stub' as const };
  let pendingPresentation = session.pendingPresentation;
  let presentationConditions: ConditionObservation[] = [];
  let presentationState: RuntimeState | undefined;
  if (pendingPresentation) {
      const arrival = present(project, state, pendingPresentation, external, session.initialWorldTick);
    if (!arrival.ok) return resultSession(session, arrival.issues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', arrival.issues);
    state = { ...arrival.state, provenance: 'stub' as const };
    presentationConditions = arrival.conditions;
    presentationState = arrival.observationState;
    pendingPresentation = undefined;
  }
  const changes = diffRuntimeStates(session.state, state);
  for (const id of new Set([...Object.keys(session.externalValues), ...Object.keys(external)])) if (!sameRuntimeValue(session.externalValues[id], external[id])) changes.push({ path: `externalValues.${id}`, before: clone(session.externalValues[id]), after: clone(external[id]) });
  const next: TrialSession = {
    ...session, state, externalValues: external, issues: [], lastDiff: changes, pendingPresentation,
    history: [...session.history, { state: clone(session.state), externalValues: clone(session.externalValues), status: session.status, issues: clone(session.issues), lastDiff: clone(session.lastDiff), traceLength: session.trace.length, pendingPresentation: session.pendingPresentation }],
    trace: [...session.trace, { fromId: session.nodeId!, toId: session.nodeId!, edgeIds: [], before: clone(session.state), after: clone(state), conditionResults: presentationConditions, ...(presentationState ? { presentationState } : {}), changes, request: { stub: clone(values) }, externalValuesBefore: clone(session.externalValues), externalValuesAfter: clone(external) }],
  };
  return inspect(project, next);
}

/** New run and total reset are separate explicit operations. */
export function restartTrial(project: ProjectData, session: TrialSession, mode: 'next_run' | 'all', entryId?: ID, contextOptions?: { worldTick?: string }): TrialSession {
  const content = getTrialContent(project, session);
  const context = { state: session.state, variables: variables(content), entities: runtimeEntities(content), externalValues: session.externalValues, ruleContext: presentationRuleContext(content, { nodeId: session.nodeId ?? undefined, worldTick: contextOptions ? contextOptions.worldTick : session.initialWorldTick }), ruleContexts: reuseRuleContexts(content, presentationRuleContext(content, { nodeId: session.nodeId ?? undefined, worldTick: contextOptions ? contextOptions.worldTick : session.initialWorldTick })) };
  const reset = resetRuntimeLifecycle(session.state, mode === 'next_run' ? ['run_end', 'new_loop'] : ['full_reset'], context);
  if (!reset.ok) return resultSession(session, reset.issues.some(value => value.code === 'CONDITION_UNKNOWN') ? 'unknown' : 'error', reset.issues);
  const initial = initializeRuntimeState(content, session.state.contentVersionId, session.referenceEntities);
  initial.variableValues = reset.state.variableValues;
  if (reset.state.resetCauses) initial.resetCauses = reset.state.resetCauses;
  if (mode === 'next_run') {
    initial.onceTriggers = session.state.onceTriggers.filter(key => key.startsWith('trigger:across_runs:') || key.startsWith('occurrence:across_runs:'));
    initial.loopNumber = session.state.loopNumber + 1;
  }
  initial.rngSeed = session.state.rngSeed;
  initial.provenance = session.state.provenance;
  const restarted = startTrial(project, { state: initial, contentVersionId: initial.contentVersionId, entryId, referenceEntities: session.referenceEntities, worldTick: contextOptions ? contextOptions.worldTick : session.initialWorldTick });
  restarted.state.provenance = initial.provenance;
  restarted.startState.provenance = initial.provenance;
  return restarted;
}

export interface CoverageMetric { reached: number; total: number; ids: ID[]; excluded: number; unknown: number }
export interface TrialCoverage {
  scenes: CoverageMetric;
  dialogue: CoverageMetric;
  choices: CoverageMetric;
  conditions: CoverageMetric;
  provenance: RuntimeState['provenance'];
  scope: string;
}

export function trialCoverage(project: ProjectData, sessions: TrialSession | TrialSession[]): TrialCoverage {
  const trials = Array.isArray(sessions) ? sessions : [sessions];
  if (new Set(trials.map(trial => `${trial.state.contentVersionId}:${trial.contentRevision}:${trial.state.provenance}`)).size > 1) {
    throw new RangeError('版・開始由来・stubの異なる証跡は別々に集計してください。');
  }
  project = trials[0]?.content ?? project;
  const seen = new Set(trials.flatMap(trial => trial.state.seenIds));
  const traversed = new Set(trials.flatMap(trial => trial.trace.flatMap(step => step.edgeIds)));
  const observed = trialObservations(trials);
  const provenance = trials[0]?.state.provenance ?? 'full_play';
  return coverageFromEvidence(project, seen, traversed, observed, provenance);
}

function trialObservations(trials: TrialSession[]): ConditionObservation[] {
  const result = trials.flatMap(trial => trial.trace.flatMap(step => step.conditionResults));
  for (const trial of trials) {
    const node = findNode(trial.content, trial.nodeId);
    if (!node || trial.status === 'error') continue;
    try { result.push(...observations(trial.content, trial, node)); }
    catch { /* Invalid input is represented by session.issues, never credited as a condition outcome. */ }
  }
  return result;
}

export function trialCoverageByProvenance(project: ProjectData, sessions: TrialSession[]): Partial<Record<RuntimeState['provenance'], TrialCoverage>> {
  const result: Partial<Record<RuntimeState['provenance'], TrialCoverage>> = {};
  for (const provenance of ['full_play', 'partial', 'imported', 'stub'] as const) {
    const matching = sessions.filter(session => session.state.provenance === provenance);
    if (matching.length > 0) result[provenance] = trialCoverage(project, matching);
  }
  return result;
}

function coverageFromEvidence(project: ProjectData, seen: Set<ID>, traversed: Set<ID>, observed: ConditionObservation[], provenance: RuntimeState['provenance']): TrialCoverage {
  const conditionTargets = [...nodes(project).filter(node => node.data.gate).map(node => node.id), ...edges(project).filter(edge => edge.data.condition).map(edge => edge.id)];
  const targets = new Set(conditionTargets);
  observed = observed.filter(result => targets.has(result.targetId));
  const conditionIds = new Set(observed.filter(result => result.value !== 'unknown').map(result => `${result.targetId}:${result.value}`));
  const metric = (kind: 'scene' | 'dialogue_line' | 'flow_edge', selected: Set<ID>, predicate?: (entity: Entity) => boolean): CoverageMetric => {
    const all: Entity[] = getEntitiesByKind(project, kind).filter((entity: Entity) => !entity.deletedAt && (!predicate || predicate(entity)));
    const eligible = active(all);
    const ids = eligible.filter(entity => selected.has(entity.id)).map(entity => entity.id);
    return { reached: ids.length, total: eligible.length, ids, excluded: all.length - eligible.length, unknown: 0 };
  };
  return {
    scenes: metric('scene', seen), dialogue: metric('dialogue_line', seen),
    choices: metric('flow_edge', traversed, entity => entity.kind === 'flow_edge' && entity.data.edgeType === 'choice'),
    conditions: { reached: conditionIds.size, total: conditionTargets.length * 2, ids: [...conditionIds], excluded: 0, unknown: new Set(observed.filter(result => result.value === 'unknown').map(result => result.targetId)).size },
    provenance,
    scope: '指定した作品版の場面、台詞、choice edge、明示gate/edge条件の真偽。途中開始とstubは別集計が必要です。',
  };
}

export function replayTrial(project: ProjectData, recorded: TrialSession): TrialSession {
  const content = versionContent(project, recorded.state.contentVersionId);
  if (!content || recorded.contentRevision !== content.revision) return resultSession(recorded, 'error', [issue('VALIDATION_FAILED', '記録後に作品が変更されました。再確認が必要です。', 'contentRevision')]);
  let replay = startTrial(project, { state: recorded.startState, contentVersionId: recorded.startState.contentVersionId, referenceEntities: recorded.referenceEntities, worldTick: recorded.initialWorldTick, presentationState: recorded.startPresentationState, ...(recorded.startConditionResults.length ? { presentationResults: recorded.startConditionResults } : {}) });
  replay.state.provenance = recorded.startState.provenance;
  replay.startState.provenance = recorded.startState.provenance;
  replay.externalValues = clone(recorded.startExternalValues);
  replay.startExternalValues = clone(recorded.startExternalValues);
  for (const step of recorded.trace) {
    replay = stepTrial(project, replay, step.request);
    if (replay.status === 'error') return replay;
    if (!sameRuntimeValue(replay.state, step.after)) return resultSession(replay, 'error', [issue('VALIDATION_FAILED', '経路記録と再実行の状態が一致しません。', step.fromId)]);
  }
  return replay;
}

export function replaySavedTrace(project: ProjectData, traceId: ID, referenceEntities?: Entity[]): TrialSession {
  const trace = getEntity(project, traceId);
  if (!trace || trace.kind !== 'trace') return resultSession(startTrial(project), 'error', [issue('REFERENCE_INVALID', '保存した経路記録が存在しません。', traceId)]);
  let replay = startTrial(project, { checkpointId: trace.data.startCheckpointId, contentVersionId: trace.data.contentVersionId, referenceEntities, worldTick: trace.data.initialWorldTick ?? undefined });
  const content = getTrialContent(project, replay);
  if (trace.data.contentRevision != null && trace.data.contentRevision !== content.revision) return resultSession(replay, 'error', [issue('VALIDATION_FAILED', '経路記録の作品版が変更されました。再確認が必要です。', `${traceId}.contentRevision`)]);
  if (replay.status === 'error') return replay;
  replay.externalValues = clone(trace.data.initialExternalValues ?? {});
  replay.startExternalValues = clone(replay.externalValues);
  for (const [index, step] of trace.data.steps.entries()) {
    if (!sameRuntimeValue(replay.state, step.before)) return resultSession(replay, 'error', [issue('VALIDATION_FAILED', '保存した開始状態と経路の直前状態が一致しません。', `${traceId}.steps[${index}].before`)]);
    let request: TrialRequest = {};
    if (step.operation === 'stub' || (step.operation === undefined && step.edgeIds.length === 0 && step.before.presentationPosition === step.after.presentationPosition && sameRuntimeValue(step.before.visitCounts, step.after.visitCounts) && step.after.provenance === 'stub')) {
      const changed: Record<ID, TypedValue> = {};
      for (const variable of variables(content)) if (!variable.data.derived && !sameRuntimeValue(step.before.variableValues[variable.id], step.after.variableValues[variable.id])) changed[variable.id] = clone(step.after.variableValues[variable.id]);
      request = { stub: { variables: changed, external: step.externalValues ?? replay.externalValues } };
    } else {
      replay.externalValues = clone(step.externalValues ?? replay.externalValues);
      const node = findNode(content, replay.nodeId);
      request.edgeId = step.edgeIds[0];
      if (step.after.rngPosition === step.before.rngPosition + 1) request.random = true;
      if (node?.data.trigger) request.event = { triggerId: node.data.trigger.id ?? node.id, event: node.data.trigger.event, eventKey: node.data.trigger.eventKey, occurrenceId: step.occurrenceId ?? `replay:${index}` };
      request.worldTick = step.worldTick;
    }
    replay = stepTrial(project, replay, request);
    if (replay.status === 'error') return replay;
    if (step.conditionResults && !sameRuntimeValue(replay.trace.at(-1)?.conditionResults, step.conditionResults)) return resultSession(replay, 'error', [issue('VALIDATION_FAILED', '保存した提示時の条件結果と再実行が一致しません。', `${traceId}.steps[${index}].conditionResults`)]);
    if (step.presentationState && !sameRuntimeValue(step.presentationState, replay.trace.at(-1)?.presentationState)) return resultSession(replay, 'error', [issue('INTEGRITY_FAILED', '保存した提示前の観測状態と再実行が一致しません。', `${traceId}.steps[${index}].presentationState`)]);
    if (!sameRuntimeValue(replay.state, step.after)) return resultSession(replay, 'error', [issue('VALIDATION_FAILED', '保存した経路と再実行の状態が一致しません。', `${traceId}.steps[${index}].after`)]);
  }
  return replay;
}

/** Data for a single author save command; the caller assigns a new checkpoint/trace ID. */
export function trialRecordData(project: ProjectData, session: TrialSession, checkpointId: ID, pinnedVersionId?: ID): { checkpoint: CheckpointData; trace: TraceData } {
  const coverage = trialCoverage(project, session);
  const flowConditions = new Set([...nodes(session.content).filter(node => node.data.gate).map(node => node.id), ...edges(session.content).filter(edge => edge.data.condition).map(edge => edge.id)]);
  const observed = trialObservations([session]).filter(result => flowConditions.has(result.targetId));
  const denominator = coverage.conditions.total / 2;
  const count = (value: 'true' | 'false') => new Set(observed.filter(result => result.value === value).map(result => result.targetId)).size;
  const version = pinnedVersionId ?? session.state.contentVersionId;
  const stateForRecord = (state: RuntimeState): RuntimeState => ({ ...clone(state), contentVersionId: version });
  const record: { checkpoint: CheckpointData; trace: TraceData } = {
    checkpoint: {
      contentVersionId: version, contentRevision: session.contentRevision, runtimeState: stateForRecord(session.startState),
      ...(session.startConditionResults.length ? { presentationResults: clone(session.startConditionResults) } : {}),
      ...(session.startPresentationState ? { presentationState: stateForRecord(session.startPresentationState) } : {}),
      origin: session.startState.provenance === 'stub' ? 'partial' : session.startState.provenance,
    },
    trace: {
      contentVersionId: version, startCheckpointId: pinnedVersionId ? checkpointId : session.startCheckpointId ?? checkpointId,
      contentRevision: session.contentRevision, initialExternalValues: clone(session.startExternalValues), ...(session.initialWorldTick !== undefined ? { initialWorldTick: session.initialWorldTick } : {}),
      seed: session.startState.rngSeed, engineVersion: '1.0.0',
      externalMode: session.state.provenance === 'stub' ? 'stub' : null,
      steps: session.trace.map(step => ({
        nodeId: step.fromId, edgeIds: [...step.edgeIds], before: stateForRecord(step.before), after: stateForRecord(step.after),
        conditionResults: clone(step.conditionResults),
        ...(step.presentationState ? { presentationState: stateForRecord(step.presentationState) } : {}),
        operation: step.request.stub ? 'stub' : 'advance',
        externalValues: clone(step.externalValuesAfter),
        ...(step.request.worldTick ? { worldTick: step.request.worldTick } : {}),
        ...(step.request.event ? { occurrenceId: step.request.event.occurrenceId } : {}),
        ...(step.after.provenance === 'stub' ? { externalMode: 'stub' as const } : {}),
      })),
      coverage: {
        scenes: { checked: coverage.scenes.reached, total: coverage.scenes.total, excluded: coverage.scenes.excluded },
        dialogue: { checked: coverage.dialogue.reached, total: coverage.dialogue.total, excluded: coverage.dialogue.excluded },
        choices: { checked: coverage.choices.reached, total: coverage.choices.total, excluded: coverage.choices.excluded },
        conditionTrue: { checked: count('true'), total: denominator, unknown: coverage.conditions.unknown },
        conditionFalse: { checked: count('false'), total: denominator, unknown: coverage.conditions.unknown },
        declaredTests: { checked: 0, total: 0 },
      },
    },
  };
  record.trace.coverage!.declaredTests = regressionPathCoverage(project, { ...record.trace, contentVersionId: session.state.contentVersionId, steps: record.trace.steps.map(step => ({ ...step, before: { ...step.before, contentVersionId: session.state.contentVersionId }, after: { ...step.after, contentVersionId: session.state.contentVersionId }, ...(step.presentationState ? { presentationState: { ...step.presentationState, contentVersionId: session.state.contentVersionId } } : {}) })) }, session.startState, session.status);
  const declarations = declaredRegressionPaths(project);
  if (declarations.ids.length) record.trace.regressionDeclarations = { projectRevision: project.revision, traceIds: declarations.ids };
  return record;
}

/** Prepare snapshot content and its evidence for one transaction. IDs and timestamps belong to the caller. */
export function pinTrialRecord(session: TrialSession, ids: { checkpointId: ID; snapshotId: ID }, declarationProject: ProjectData = session.declarationProject ?? session.content): { checkpoint: CheckpointData; trace: TraceData; content: ProjectContent } {
  const { history: _history, snapshots: _snapshots, authorAlternatives: _authorAlternatives, ...content } = reuseAuthorContent(session.content);
  return { ...trialRecordData(declarationProject, session, ids.checkpointId, ids.snapshotId), content: clone(content) };
}

export type AnalysisStatus = 'confirmed_issue' | 'candidate' | 'unknown' | 'intentional' | 'passed_for_checked_scope';
export interface AnalysisLimits { maxStates: number; maxTransitions: number; maxMs: number }
export interface AnalysisFinding {
  status: AnalysisStatus;
  code: string;
  message: string;
  targetId?: ID;
  path: ID[];
  startState: RuntimeState;
  missingInfoIds?: ID[];
  payoffId?: ID;
  /** Selected edges at each transition disambiguate paths that share the same node sequence. */
  edgePath?: ID[][];
}

function anchorIsPresented(project: ProjectData, state: RuntimeState, anchor: import('./types').ContentAnchor, declarationId?: ID): boolean {
  return presentationAnchorApplies(project, state, anchor, { nodeId: state.presentationPosition ?? undefined }, declarationId);
}

function anchorPrecedes(project: ProjectData, state: RuntimeState, left: import('./types').ContentAnchor, right: import('./types').ContentAnchor): boolean | undefined {
  return presentationAnchorOrder(project, left, right, { nodeId: state.presentationPosition ?? undefined });
}


/** Required author-declared information is checked in reading order, never world-date order. */
export function checkTrialForeshadows(project: ProjectData, session: TrialSession): AnalysisFinding[] {
  try { return checkTrialForeshadowsInternal(project, session); }
  catch (error) {
    return errorIssues(error).map(failure => ({ status: 'confirmed_issue', code: failure.code, message: failure.message, path: session.nodeId ? [session.nodeId] : [], startState: clone(session.startState) }));
  }
}
export function trialNarrativeOccurrences(session: TrialSession): import('./narrative').NarrativeOccurrence[] {
  return [
    { state: session.startState, observationState: session.startPresentationState, conditions: session.startConditionResults, target: { nodeId: session.startState.presentationPosition ?? undefined }, worldTick: session.initialWorldTick, externalValues: session.startExternalValues },
    ...session.trace.filter(step => !step.request.stub || !sameRuntimeValue(step.before.visitCounts, step.after.visitCounts)).map(step => ({ state: step.after, observationState: step.presentationState, conditions: step.conditionResults, edgeIds: step.request.stub ? undefined : step.edgeIds, target: { nodeId: step.after.presentationPosition ?? undefined }, worldTick: step.request.worldTick, externalValues: step.externalValuesAfter })),
  ];
}
function checkTrialForeshadowsInternal(project: ProjectData, session: TrialSession): AnalysisFinding[] {
  return checkPresentationForeshadows(getTrialContent(project, session), trialNarrativeOccurrences(session), session.startState, session.status === 'terminal', session.referenceEntities, session.issues as import('./types').ValidationIssue[]);
}

export interface AnalysisProgress { checkedStates: number; pendingStates: number; elapsedMs: number; limits: AnalysisLimits }
export interface AnalysisOptions extends Partial<AnalysisLimits>, TrialStartOptions {
  worldTick?: string;
  worldSnapshots?: Record<ID, ProjectContent>;
  signal?: AbortSignal;
  now?: () => number;
  onProgress?: (progress: AnalysisProgress) => void;
}
export interface AnalysisResult {
  status: AnalysisStatus;
  findings: AnalysisFinding[];
  coverage: TrialCoverage;
  checkedStates: number;
  limits: AnalysisLimits;
  truncated: boolean;
  contentVersionId: ID;
  contentRevision: string;
  assumptions: string[];
  targetIds: ID[];
  entryIds: ID[];
  declaredEntryIds: ID[];
}

function flowReferences(project: ProjectData): { targetId: ID; issue: RuntimeIssue }[] {
  const failures: { targetId: ID; issue: RuntimeIssue }[] = [];
  const nodeIds = new Set(nodes(project).map(node => node.id));
  const check = (id: ID, value: ID | undefined | null, kind: Entity['kind'], field: string) => {
    if (!value) return;
    const target = getEntity(project, value);
    if (!target || target.kind !== kind || target.deletedAt) failures.push({ targetId: id, issue: issue('REFERENCE_INVALID', `${field}の参照先が存在しないか種類が違います。`, `${id}.${field}`) });
  };
  for (const node of nodes(project)) {
    const unsupportedReuse = reuseIssue(node);
    if (unsupportedReuse) failures.push({ targetId: node.id, issue: unsupportedReuse });
    check(node.id, node.data.sceneId, 'scene', 'sceneId');
    check(node.id, node.data.childGraphId, 'flow_graph', 'childGraphId');
    check(node.id, node.data.fallbackId, 'flow_node', 'fallbackId');
    if (node.data.nodeType === 'terminal' && !node.data.terminalReason?.trim()) failures.push({ targetId: node.id, issue: issue('VALIDATION_FAILED', '終端に終了理由がありません。', `${node.id}.terminalReason`) });
  }
  for (const edge of edges(project)) {
    if (!nodeIds.has(edge.data.fromId) || typeof edge.data.toId !== 'string' || !nodeIds.has(edge.data.toId)) failures.push({ targetId: edge.id, issue: issue('REFERENCE_INVALID', '未完成または存在しない分岐先があります。', `${edge.id}.toId`) });
    for (const effectId of edge.data.effectIds ?? []) check(edge.id, effectId, 'effect', 'effectIds');
  }
  for (const graph of graphs(project)) {
    for (const id of [...graph.data.nodeIds, ...graph.data.entryIds, ...graph.data.exitIds]) check(graph.id, id, 'flow_node', 'nodeIds');
    for (const id of graph.data.edgeIds) check(graph.id, id, 'flow_edge', 'edgeIds');
    for (const id of [...graph.data.entryIds, ...graph.data.exitIds]) if (!graph.data.nodeIds.includes(id)) failures.push({ targetId: graph.id, issue: issue('REFERENCE_INVALID', '入口または出口がグラフのnodeIdsに含まれていません。', `${graph.id}.entryIds`) });
  }
  return failures;
}

function visitThresholds(project: ProjectData): Record<ID, number> {
  const thresholds: Record<ID, number> = {};
  const scan = (condition?: Condition | null) => {
    if (!condition) return;
    if (condition.op === 'visited') thresholds[condition.entityId] = Math.max(thresholds[condition.entityId] ?? 0, condition.count);
    if (condition.op === 'all' || condition.op === 'any') condition.children.forEach(scan);
    if (condition.op === 'not') scan(condition.child);
  };
  nodes(project).forEach(node => scan(node.data.gate));
  edges(project).forEach(edge => scan(edge.data.condition));
  declaredEffects(project).forEach(effect => scan(effect.data.condition));
  const scanExpression = (expression?: Expression | null) => {
    if (!expression) return;
    if (expression.op === 'visited') scan(expression);
    if ('children' in expression) expression.children.forEach(scanExpression);
    if ('child' in expression) scanExpression(expression.child);
    if ('left' in expression) { scanExpression(expression.left); scanExpression(expression.right); }
    if ('condition' in expression) { scan(expression.condition); scanExpression(expression.then); scanExpression(expression.else); }
  };
  variables(project).forEach(variable => scanExpression(variable.data.derived));
  const scanData = (value: unknown, depth = 0) => {
    if (depth > 32 || !value || typeof value !== 'object') return;
    if ('op' in value && value.op === 'visited') scan(value as Condition);
    for (const child of Object.values(value)) scanData(child, depth + 1);
  };
  runtimeEntities(project).filter(adoptedRecord).forEach(entity => scanData(entity.data));
  return thresholds;
}

function stateKey(state: RuntimeState, thresholds: Record<ID, number>): string {
  const visits = Object.fromEntries(Object.keys(thresholds).sort().map(id => [id, Math.min(state.visitCounts[id] ?? 0, thresholds[id])]));
  return canonicalRuntimeValue({
    values: Object.fromEntries(Object.entries(state.variableValues).sort(([a], [b]) => a.localeCompare(b))),
    items: [...state.itemInstances].sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
    assertions: [...state.assertions].sort((a, b) => `${a.assertionId}:${a.holderId}`.localeCompare(`${b.assertionId}:${b.holderId}`)),
    seen: [...state.seenIds].sort(), visits,
    once: state.onceTriggers.filter(key => !key.startsWith('occurrence:')).sort(),
    seed: state.rngSeed, rng: state.rngPosition, stack: state.callStack,
    position: state.presentationPosition, loop: state.loopNumber,
  });
}

function* analysisIterator(project: ProjectData, options: AnalysisOptions): Generator<AnalysisProgress, AnalysisResult, void> {
  const limits: AnalysisLimits = { maxStates: options.maxStates ?? 100_000, maxTransitions: options.maxTransitions ?? 10_000, maxMs: options.maxMs ?? 30_000 };
  const now = options.now ?? (() => performance.now());
  const started = now();
  const selected = versionContent(project, options.contentVersionId ?? project.projectId);
  const declared = selected ? declaredEntrypoints(selected) : [];
  const entryIds = options.entryId || options.state || options.checkpointId ? (options.entryId ? [options.entryId] : []) : declared;
  const first = startTrial(project, entryIds.length ? { ...options, entryId: entryIds[0] } : options);
  const exploredEntries: ID[] = first.nodeId ? [first.nodeId] : [];
  project = first.content;
  const findings: AnalysisFinding[] = [];
  const unique = new Set<string>();
  let activeStart = first.startState;
  const add = (status: AnalysisStatus, code: string, message: string, targetId?: ID, path: ID[] = [], edgePath?: ID[][]) => {
    const key = `${status}:${code}:${targetId ?? ''}`;
    if (!unique.has(key)) {
      unique.add(key);
      findings.push({ status, code, message, targetId, path, edgePath, startState: clone(activeStart) });
    }
  };
  for (const failure of flowReferences(project)) add('confirmed_issue', failure.issue.code, failure.issue.message, failure.targetId);
  const structural = validateProject(project, { worldSnapshots: options.worldSnapshots });
  if (!structural.ok) for (const failure of structural.issues) {
    const entityIndex = /(?:^|\.)entities\[(\d+)\]/.exec(failure.path)?.[1];
    add('confirmed_issue', failure.code, failure.message, entityIndex ? project.entities[Number(entityIndex)]?.id : undefined);
  }
  const invalidLimits = Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0) || limits.maxStates > 100_000 || limits.maxTransitions > 10_000 || limits.maxMs > 30_000;
  if (invalidLimits) add('confirmed_issue', 'VALIDATION_FAILED', '探索上限は正の安全な整数で、100,000状態・10,000遷移・30秒以内にしてください。');
  // Parent indices keep witness paths without copying a full path/trace for every state.
  type SearchRecord = { session: TrialSession; parent: number | null; depth: number; signature?: string };
  const queue: SearchRecord[] = invalidLimits ? [] : [{ session: first, parent: null, depth: 0 }];
  let nextEntry = invalidLimits ? entryIds.length : 1;
  const witness = (index: number): ID[] => {
    const path: ID[] = [];
    let current: number | null = index;
    while (current !== null) {
      const record: SearchRecord = queue[current];
      if (record.session.nodeId) path.push(record.session.nodeId);
      current = record.parent;
    }
    return path.reverse();
  };
  const edgeWitness = (index: number): ID[][] => {
    const path: ID[][] = [];
    let current: number | null = index;
    while (current !== null && queue[current].parent !== null) {
      path.push([...queue[current].session.trace.at(-1)!.edgeIds]);
      current = queue[current].parent;
    }
    return path.reverse();
  };
  const pathSession = (index: number): TrialSession => {
    const trace: TrialTraceStep[] = [];
    let current = index;
    while (queue[current].parent !== null) {
      trace.push(queue[current].session.trace.at(-1)!);
      current = queue[current].parent!;
    }
    return { ...queue[index].session, startState: queue[current].session.startState, startPresentationState: queue[current].session.startPresentationState, startConditionResults: queue[current].session.startConditionResults, trace: trace.reverse() };
  };
  const thresholds = structural.ok ? visitThresholds(project) : {};
  const checked = new Set<string>();
  const reached = new Set<ID>();
  const seen = new Set<ID>();
  const traversed = new Set<ID>();
  const observed = new Map<string, ConditionObservation>();
  let checkedStates = 0;
  let cursor = 0;
  let truncated = false;
  while (cursor < queue.length || nextEntry < entryIds.length) {
    if (options.signal?.aborted || checkedStates >= limits.maxStates || now() - started >= limits.maxMs) {
      truncated = true;
      add('unknown', 'ANALYSIS_LIMIT', options.signal?.aborted ? '解析を取り消しました。確認済み範囲だけを表示します。' : '探索上限に達しました。残りの経路は未確認です。');
      break;
    }
    // Start further declared entries lazily. Share only the captured immutable
    // content; every entry receives its own initial state and presentation.
    if (cursor === queue.length && nextEntry < entryIds.length) {
      const entryId = entryIds[nextEntry++];
      queue.push({ session: startTrialInternal(project, { ...options, entryId }, true), parent: null, depth: 0 });
      exploredEntries.push(entryId);
    }
    const recordIndex = cursor++;
    const record = queue[recordIndex];
    const { session, depth } = record;
    activeStart = session.startState;
    // Inspect the witnessed presentation order before state deduplication. Two
    // paths may join at the same values after presenting information in a different order.
    const lastStep = session.trace.at(-1), oldChapter = lastStep ? presentationRuleContext(project, { nodeId: lastStep.before.presentationPosition ?? undefined }).chapterId : undefined;
    const currentChapter = presentationRuleContext(project, { nodeId: session.nodeId ?? undefined }).chapterId;
    if (session.status === 'terminal' || getTrialNode(project, session)?.data.nodeType === 'exit' || oldChapter && oldChapter !== currentChapter || activeKind(project, 'foreshadow').some(foreshadow => foreshadow.data.presentationDeadline && anchorIsPresented(project, session.state, reuseExecutionAnchor(project, foreshadow.data.presentationDeadline, foreshadow.id), foreshadow.id)) || activeKind(project, 'disclosure').some(disclosure => disclosure.data.role === 'payoff' && anchorIsPresented(project, session.state, reuseExecutionAnchor(project, disclosure.data.anchor, disclosure.id), disclosure.id))) {
      for (const finding of checkTrialForeshadows(project, pathSession(recordIndex))) {
        const key = `${finding.status}:${finding.code}:${finding.targetId}:${finding.payoffId}:${finding.missingInfoIds?.join(',')}`;
        if (!unique.has(key)) { unique.add(key); findings.push(finding); }
      }
    }
    const signature = stateKey(session.state, thresholds);
    record.signature = signature;
    if (checked.has(signature)) {
      let ancestor = record.parent;
      while (ancestor !== null) {
        if (queue[ancestor].signature === signature) {
          add('unknown', 'UNBOUNDED_LOOP', '同じ状態へ戻る経路があります。無制限の反復は未確認です。', session.nodeId ?? undefined, witness(recordIndex), edgeWitness(recordIndex));
          break;
        }
        ancestor = queue[ancestor].parent;
      }
      continue;
    }
    checked.add(signature);
    checkedStates++;
    if (session.nodeId) reached.add(session.nodeId);
    session.state.seenIds.forEach(id => seen.add(id));
    session.trace.forEach(step => {
      step.edgeIds.forEach(id => traversed.add(id));
      step.conditionResults.forEach(result => observed.set(`${result.targetId}:${result.value}`, result));
    });
    if (structural.ok) for (const result of trialObservations([session])) observed.set(`${result.targetId}:${result.value}`, result);
    const path = () => witness(recordIndex);
    if (session.status === 'terminal') add('intentional', 'TERMINAL', findNode(project, session.nodeId)?.data.terminalReason || '意図した終端', session.nodeId ?? undefined, path(), edgeWitness(recordIndex));
    else if (session.status === 'unknown') add('unknown', 'CONDITION_UNKNOWN', session.issues.map(value => value.message).join('、'), session.nodeId ?? undefined, path(), edgeWitness(recordIndex));
    else if (session.status === 'blocked' || session.status === 'error') add(session.status === 'error' ? 'confirmed_issue' : 'candidate', session.issues[0]?.code ?? 'TRANSITION_BLOCKED', session.issues.map(value => value.message).join('、'), session.nodeId ?? undefined, path(), edgeWitness(recordIndex));
    else if (depth >= limits.maxTransitions) {
      truncated = true;
      add('unknown', 'ANALYSIS_LIMIT', '一経路の遷移数上限に達しました。続きは未確認です。', session.nodeId ?? undefined, path(), edgeWitness(recordIndex));
    } else {
      const node = findNode(project, session.nodeId)!;
      const policy = node.data.executionPolicy ?? (node.data.nodeType === 'automatic' ? 'first_match' : 'manual_choice');
      const choices = getTrialChoices(project, session);
      for (const choice of choices) if (choice.result === 'unknown') add('unknown', 'CONDITION_UNKNOWN', choice.reasons.join('、') || '未確認の候補があります。', choice.edgeId, path(), edgeWitness(recordIndex));
      const requests: TrialRequest[] = node.data.nodeType === 'call' || node.data.nodeType === 'exit' || policy !== 'manual_choice'
        ? [{}] : choices.filter(choice => choice.result === 'true').map(choice => ({ edgeId: choice.edgeId }));
      if (requests.length === 0 && node.data.fallbackId) requests.push({});
      for (const request of requests) {
        if (queue.length >= limits.maxStates || options.signal?.aborted || now() - started >= limits.maxMs) { truncated = true; add('unknown', 'ANALYSIS_LIMIT', '探索の上限または取消により、残る経路は未確認です。'); break; }
        request.worldTick = options.worldTick;
        if (node.data.trigger) request.event = { event: node.data.trigger.event, eventKey: node.data.trigger.eventKey, occurrenceId: `analysis:${checkedStates}:${request.edgeId ?? 'auto'}` };
        const next = stepTrial(project, session, request);
        if (next.state === session.state || next.trace.length === session.trace.length) {
          add(next.status === 'unknown' ? 'unknown' : next.status === 'error' ? 'confirmed_issue' : 'candidate', next.issues[0]?.code ?? 'TRANSITION_BLOCKED', next.issues.map(value => value.message).join('、') || '進行できません。', node.id, path(), edgeWitness(recordIndex));
        } else {
          queue.push({ session: { ...next, history: [], trace: next.trace.slice(-1) }, parent: recordIndex, depth: depth + 1 });
        }
      }
    }
    if (checkedStates % 128 === 0) yield { checkedStates, pendingStates: queue.length - cursor, elapsedMs: now() - started, limits };
  }
  for (const node of nodes(project)) if (!reached.has(node.id)) add('candidate', 'NOT_REACHED_IN_CHECKED_SCOPE', '指定した開始状態と確認範囲では到達を見つけていません。到達不能の断定ではありません。', node.id);
  const status: AnalysisStatus = findings.some(finding => finding.status === 'confirmed_issue') ? 'confirmed_issue'
    : findings.some(finding => finding.status === 'unknown') || truncated ? 'unknown'
    : findings.some(finding => finding.status === 'candidate') ? 'candidate' : 'passed_for_checked_scope';
  return {
    status, findings, coverage: coverageFromEvidence(project, seen, traversed, [...observed.values()], first.state.provenance), checkedStates, limits, truncated,
    contentVersionId: first.state.contentVersionId, contentRevision: project.revision, targetIds: nodes(project).map(node => node.id), entryIds: exploredEntries, declaredEntryIds: declared,
    assumptions: [options.entryId || options.state || options.checkpointId ? '指定した開始状態の有限探索。未到達は到達不能の証明ではありません。' : '全宣言入口の初期状態からの有限探索。未到達は到達不能の証明ではありません。', '外部値を補いません。明示トリガーは宣言した入力が与えられる場合だけを確認します。', 'visitedは宣言した閾値まで状態に含めます。同状態の無制限ループは未確認です。'],
  };
}

export function analyzeFlow(project: ProjectData, options: AnalysisOptions = {}): AnalysisResult {
  const iterator = analysisIterator(project, options);
  let result = iterator.next();
  while (!result.done) {
    options.onProgress?.(result.value);
    result = iterator.next();
  }
  return result.value;
}

/** Yield between batches so progress and AbortSignal cancellation remain usable in a browser. */
export async function analyzeFlowAsync(project: ProjectData, options: AnalysisOptions = {}): Promise<AnalysisResult> {
  const iterator = analysisIterator(project, options);
  let result = iterator.next();
  while (!result.done) {
    options.onProgress?.(result.value);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    result = iterator.next();
  }
  return result.value;
}
