import type { ContentAnchor, ID, ProjectContent } from './types';
import { diffRuntimeStates, type TrialSession } from './runtime';
import { reuseTargetAnchor } from './reuse';
import { resolvePinnedWorlds } from './pinnedWorlds';

export interface RuntimeChangeOrigin { edgeId: ID; edgeName: string; anchor: ContentAnchor }

/** Navigate only from recorded transition provenance for the final observed value. */
export function runtimeChangeOrigins(session: TrialSession, path: string, worldSnapshots: Record<ID, ProjectContent> = {}): RuntimeChangeOrigin[] {
  for (let index = session.trace.length - 1; index >= 0; index--) {
    const step = session.trace[index], change = step.changes.find(value => value.path === path);
    if (!change) continue;
    // A later stub or unrecorded value change must not point at an older edge.
    if (step.request.stub || diffRuntimeStates(step.after, session.state).some(value => value.path === path)) return [];
    const ids = [...new Set(change.edgeIds ?? [])].filter(id => step.edgeIds.includes(id));
    return ids.flatMap(id => {
      const edge = [...session.content.entities, ...(session.referenceEntities ?? [])].find(entity => entity.id === id && entity.kind === 'flow_edge' && !entity.deletedAt);
      if (!edge) return [];
      if (edge.projectId !== session.content.projectId) {
        const closure = resolvePinnedWorlds(session.content, worldSnapshots);
        if (closure.errors.length) return [];
        const reference = closure.references.find(value => value.projectId === edge.projectId);
        const world = reference && worldSnapshots[reference.immutableSnapshotId];
        if (!reference || !world?.entities.some(entity => entity.id === id && entity.kind === 'flow_edge')) return [];
        return [{ edgeId: id, edgeName: edge.name || id, anchor: { entityId: id, sourceVersionId: reference.immutableSnapshotId } }];
      }
      const target = reuseTargetAnchor(session.content, { entityId: id });
      return [{ edgeId: id, edgeName: edge.name || id, anchor: { ...target, sourceVersionId: target.sourceVersionId || session.state.contentVersionId } }];
    });
  }
  return [];
}
