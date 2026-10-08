import type { ID, ProjectContent, ProjectData } from './types';
import { captureRuntimeContent } from './runtimeVersions';
import { resolvePinnedWorlds } from './pinnedWorlds';
import { analyzeFlowAsync, replaySavedTrace, startTrial } from './runtime';
import type { AnalysisOptions, TrialStartOptions } from './runtime';

/** The author document and registry are captured before hashing. Borrowed records stay separate. */
async function captured(project: ProjectData, version: ID, worldSnapshots: Record<ID, ProjectContent>) {
  const source = structuredClone(project), registry = structuredClone(worldSnapshots);
  const content = await captureRuntimeContent(source, version, { worldSnapshots: registry });
  const referenceEntities = resolvePinnedWorlds(content, registry).worlds.flatMap(world => world.entities);
  return { source, content, registry, referenceEntities };
}
export async function startTrialVerified(project: ProjectData, options: TrialStartOptions = {}, worldSnapshots: Record<ID, ProjectContent> = {}) {
  const requested = structuredClone(options);
  const input = await captured(project, requested.contentVersionId ?? project.projectId, worldSnapshots);
  return startTrial(input.source, { ...requested, referenceEntities: input.referenceEntities });
}
export async function replaySavedTraceVerified(project: ProjectData, traceId: ID, worldSnapshots: Record<ID, ProjectContent> = {}) {
  const trace = project.entities.find(entity => entity.id === traceId && entity.kind === 'trace');
  if (!trace || trace.kind !== 'trace') throw new Error('保存した経路がありません。');
  const input = await captured(project, trace.data.contentVersionId, worldSnapshots);
  return replaySavedTrace(input.source, traceId, input.referenceEntities);
}
export async function analyzeFlowVerified(project: ProjectData, options: AnalysisOptions = {}, worldSnapshots: Record<ID, ProjectContent> = {}) {
  const requested = { ...options, ...(options.state ? { state: structuredClone(options.state) } : {}), ...(options.stub ? { stub: structuredClone(options.stub) } : {}), ...(options.presentationResults ? { presentationResults: structuredClone(options.presentationResults) } : {}) };
  const input = await captured(project, requested.contentVersionId ?? project.projectId, worldSnapshots);
  return analyzeFlowAsync(input.source, { ...requested, referenceEntities: input.referenceEntities, worldSnapshots: input.registry });
}
