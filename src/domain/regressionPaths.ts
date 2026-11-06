import type { Entity, ID, ProjectData, RuntimeState, TraceData } from './types';
import { adoptedRecord } from './adoption';
import { canonicalJson, jsonBytes, sha256 } from '../storage/json';
import { replaySavedTraceVerified } from './runtimeVerified';
import { replayTraceAgainstRevision } from './traceReconfirmation';
import { captureRuntimeContent } from './runtimeVersions';

export function declaredRegressionPaths(project: ProjectData): { ids: ID[]; paths: Entity<'trace'>[]; missing: ID[] } {
  const ids = [...new Set(project.entities.filter((entity): entity is Entity<'collection'> => entity.kind === 'collection' && adoptedRecord(entity) && entity.data.purpose === 'regression').flatMap(collection => collection.data.memberIds ?? []))];
  const paths = ids.map(id => project.entities.find((entity): entity is Entity<'trace'> => entity.id === id && entity.kind === 'trace' && adoptedRecord(entity))).filter((entity): entity is Entity<'trace'> => !!entity);
  return { ids, paths, missing: ids.filter(id => !paths.some(path => path.id === id)) };
}
export function regressionPathCoverage(project: ProjectData, candidate: Pick<TraceData, 'contentVersionId' | 'steps' | 'readingPath' | 'mode' | 'externalMode'>, start: RuntimeState, executionStatus?: string) {
  const declarations = declaredRegressionPaths(project);
  const equal = (left: unknown, right: unknown) => left === undefined || right === undefined ? left === right : canonicalJson(left) === canonicalJson(right);
  const observedUnknown = candidate.steps.some(step => step.conditionResults?.some(result => result.value === 'unknown')) || candidate.readingPath?.occurrences.some(occurrence => occurrence.conditionResults.some(result => result.value === 'unknown'));
  const lastPosition = candidate.steps.at(-1)?.after.presentationPosition ?? start.presentationPosition;
  const content = project.snapshots.find(snapshot => snapshot.id === candidate.contentVersionId)?.content ?? project;
  const complete = executionStatus ? executionStatus === 'terminal' : candidate.mode === 'chapters'
    ? !!candidate.readingPath?.sceneIds.length && candidate.readingPath.occurrences.length === candidate.readingPath.sceneIds.length
    : content.entities.some(entity => entity.id === lastPosition && entity.kind === 'flow_node' && adoptedRecord(entity) && entity.data.nodeType === 'terminal');
  const matchingPaths = declarations.paths.filter(path => {
    if (path.data.contentVersionId !== candidate.contentVersionId || (path.data.mode ?? 'flow') !== (candidate.mode ?? 'flow')) return false;
    if ((path.data.externalMode ?? 'internal') !== (candidate.externalMode ?? 'internal') || ['actual', 'mixed'].includes(candidate.externalMode ?? 'internal')) return false;
    const checkpoint = project.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === path.data.startCheckpointId && entity.kind === 'checkpoint');
    if (!checkpoint || !equal(checkpoint.data.runtimeState, start)) return false;
    if (checkpoint.data.presentationResults?.some(result => result.value === 'unknown')) return false;
    // A declaration names a complete path and start state. Matching a prefix or
    // merely ticking a label never supplies verification evidence.
    if (candidate.mode === 'chapters') return equal(path.data.readingPath && { ...path.data.readingPath, selection: path.data.readingPath.selection ?? 'scenes' }, candidate.readingPath && {
      ...candidate.readingPath,
      selection: candidate.readingPath.selection ?? 'scenes',
      occurrences: candidate.readingPath.occurrences.map((occurrence, index) => {
        const expected = path.data.readingPath?.occurrences[index];
        const normalized = { ...occurrence };
        if (expected && expected.presentationState === undefined) delete normalized.presentationState;
        return normalized;
      }),
    });
    return equal(path.data.steps, candidate.steps.map((step, index) => {
      const expected = path.data.steps[index];
      if (!expected) return step;
      const normalized = { ...step };
      for (const field of ['presentationState', 'conditionResults', 'operation', 'externalValues'] as const) if (expected[field] === undefined) delete normalized[field];
      return normalized;
    }));
  });
  const matched = complete && !observedUnknown ? matchingPaths : [];
  const provenance = (path: Entity<'trace'>) => {
    const checkpoint = project.entities.find((entity): entity is Entity<'checkpoint'> => entity.kind === 'checkpoint' && entity.id === path.data.startCheckpointId);
    return checkpoint?.data.runtimeState.provenance ?? 'partial';
  };
  const mode = (path: Entity<'trace'>) => path.data.externalMode ?? 'internal';
  const byProvenance = Object.fromEntries((['full_play', 'partial', 'imported', 'stub'] as const).map(origin => [origin, { checked: matched.filter(path => provenance(path) === origin).length, total: declarations.paths.filter(path => provenance(path) === origin).length }]));
  const byExternalMode = Object.fromEntries((['internal', 'stub', 'actual', 'mixed'] as const).map(external => [external, { checked: external === 'actual' || external === 'mixed' ? 0 : matched.filter(path => mode(path) === external).length, total: declarations.paths.filter(path => mode(path) === external).length }]));
  const unknown = declarations.missing.length + declarations.paths.filter(path => path.data.contentVersionId !== candidate.contentVersionId || ['actual', 'mixed'].includes(mode(path)) || project.entities.some(entity => entity.id === path.data.startCheckpointId && entity.kind === 'checkpoint' && entity.data.presentationResults?.some(result => result.value === 'unknown')) || (!complete || observedUnknown) && matchingPaths.includes(path)).length;
  return { checked: matched.filter(path => provenance(path) === 'full_play' && mode(path) === 'internal' && start.provenance === 'full_play').length, total: declarations.ids.length, unknown, byProvenance, byExternalMode };
}

/** Seed expectations from verified old evidence; the author saves/adapts these explicitly. */
export async function captureRegressionExpectation(project: ProjectData, traceId: ID, worldSnapshots: Record<ID, import('./types').ProjectContent> = {}): Promise<import('./types').RegressionExpectation> {
  const trace = project.entities.find((entity): entity is Entity<'trace'> => entity.id === traceId && entity.kind === 'trace');
  if (!trace || trace.data.mode === 'chapters') throw new Error('分岐の保存経路を選んでください。');
  const old = await replaySavedTraceVerified(project, traceId, worldSnapshots);
  const ending = old.content.entities.find(entity => entity.id === old.nodeId && entity.kind === 'flow_node');
  if (old.status !== 'terminal' || ending?.kind !== 'flow_node' || ending.data.nodeType !== 'terminal') throw new Error('終端まで確認した経路に期待する結末を付けてください。');
  return { ending: { entityId: ending.id, sourceVersionId: trace.data.contentVersionId, reason: ending.data.terminalReason! }, state: Object.entries(old.state.variableValues).map(([entityId, value]) => ({ entityId, sourceVersionId: trace.data.contentVersionId, value: structuredClone(value) })) };
}
export interface RegressionRouteResult {
  traceId: ID; name: string; status: 'match' | 'mismatch' | 'unexecutable'; sourceVersionId?: ID; targetVersionId: ID;
  startState?: RuntimeState; seed?: string; firstDifference?: import('./traceReconfirmation').PathDifference;
  expected?: import('./types').RegressionExpectation; actualEnding?: { entityId: ID; reason?: string | null }; differences: string[];
}
export interface RegressionReport { projectId: ID; baseRevision: string; targetVersionId: ID; targetHash: string; routes: RegressionRouteResult[] }
export async function runRegressionCollection(project: ProjectData, collectionId: ID, options: { targetVersionId?: ID; worldSnapshots?: Record<ID, import('./types').ProjectContent>; signal?: AbortSignal } = {}): Promise<RegressionReport> {
  const source = structuredClone(project), targetVersionId = options.targetVersionId ?? source.projectId;
  const target = await captureRuntimeContent(source, targetVersionId, { worldSnapshots: options.worldSnapshots });
  const collection = source.entities.find((entity): entity is Entity<'collection'> => entity.id === collectionId && entity.kind === 'collection' && entity.data.purpose === 'regression' && entity.data.mode === 'fixed' && adoptedRecord(entity));
  if (!collection) throw new Error('固定した回帰集合を選んでください。');
  const routes: RegressionRouteResult[] = [];
  for (const id of [...new Set(collection.data.memberIds ?? [])]) {
    if (options.signal?.aborted) throw new Error('回帰集合の再実行を中止しました。期待値と旧経路は保持されています。');
    const trace = source.entities.find((entity): entity is Entity<'trace'> => entity.id === id && entity.kind === 'trace' && adoptedRecord(entity));
    const row: RegressionRouteResult = { traceId: id, name: trace?.name ?? id, status: 'unexecutable', sourceVersionId: trace?.data.contentVersionId, targetVersionId, expected: trace?.data.expectation ?? undefined, differences: [] };
    const checkpoint = trace && source.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === trace.data.startCheckpointId && entity.kind === 'checkpoint');
    row.startState = checkpoint ? structuredClone(checkpoint.data.runtimeState) : undefined; row.seed = trace?.data.seed ?? checkpoint?.data.runtimeState.rngSeed;
    if (!trace?.data.expectation) { row.differences.push(trace ? '作者の期待する結末・状態が未設定です。' : '宣言した経路がありません。'); routes.push(row); continue; }
    try {
      const replay = await replayTraceAgainstRevision(source, id, { ...options, targetVersionId });
      row.startState = replay.startState ?? row.startState; row.seed = replay.seed ?? row.seed; row.firstDifference = replay.firstDifference;
      if (replay.status === 'different_path') { row.status = 'mismatch'; row.differences.push(replay.firstDifference!.reason); const ending = replay.attempted?.content.entities.find(entity => entity.id === replay.attempted?.nodeId && entity.kind === 'flow_node'); if (ending?.kind === 'flow_node' && ending.data.nodeType === 'terminal') row.actualEnding = { entityId: ending.id, reason: ending.data.terminalReason }; routes.push(row); continue; }
      if (replay.status === 'unexecutable' || !replay.session || replay.session.status !== 'terminal') { row.differences.push(replay.firstDifference?.reason ?? '終端まで実行できません。'); routes.push(row); continue; }
      const expected = trace.data.expectation, session = replay.session, ending = session.content.entities.find(entity => entity.id === session.nodeId && entity.kind === 'flow_node');
      row.actualEnding = { entityId: session.nodeId!, reason: ending?.kind === 'flow_node' ? ending.data.terminalReason : undefined };
      if (expected.state.some(value => value.value.type === 'unknown') || Object.values(session.state.variableValues).some(value => value.type === 'unknown')) { row.differences.push('未知の状態値があり、一致を判断できません。'); routes.push(row); continue; }
      if (row.actualEnding.entityId !== expected.ending.entityId || row.actualEnding.reason !== expected.ending.reason) row.differences.push(`期待する結末「${expected.ending.reason}」と実際の結末「${row.actualEnding.reason ?? '不明'}」が異なります。`);
      for (const value of expected.state) if (canonicalJson(session.state.variableValues[value.entityId] ?? null) !== canonicalJson(value.value)) row.differences.push(`状態 ${value.entityId}: 期待 ${JSON.stringify(value.value)} / 実際 ${JSON.stringify(session.state.variableValues[value.entityId] ?? null)}`);
      row.status = row.differences.length ? 'mismatch' : 'match';
      if (row.status === 'mismatch') {
        const first = session.trace.findIndex((step, index) => expected.state.some(value => canonicalJson(step.after.variableValues[value.entityId] ?? null) !== canonicalJson(trace.data.steps[index]?.after.variableValues[value.entityId] ?? null)));
        const index = first >= 0 ? first : Math.max(0, session.trace.length - 1), step = trace.data.steps[index];
        row.firstDifference = { choice: step ? index + 1 : 0, nodeId: step?.nodeId, edgeIds: step?.edgeIds ?? [], reason: row.differences.join('、') };
      }
    } catch (cause) { row.differences.push((cause as Error).message); }
    routes.push(row);
  }
  return { projectId: source.projectId, baseRevision: source.revision, targetVersionId, targetHash: await sha256(jsonBytes(target)), routes };
}
