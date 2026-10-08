import type { Entity, ID, ProjectData, RuntimeState, TraceData } from './types';
import { adoptedRecord } from './adoption';
import { canonicalJson } from '../storage/json';

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
    if (candidate.mode === 'chapters') return equal(path.data.readingPath, candidate.readingPath && {
      ...candidate.readingPath,
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
