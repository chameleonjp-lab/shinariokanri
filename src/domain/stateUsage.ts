import type { Entity, ID, ProjectData } from './types';
import { collectReferences } from './model';
import { adoptedRecord } from './adoption';

export interface StateUsage { entityId: ID; path: string; operation: 'read' | 'update' | 'reset'; reason: string }
/** Author-declared uses retain stable IDs across rename, reorder and clone.
 * Saved trial values and review targets still protect references, but are not
 * declarations that read, update or reset a state during a story. */
export function stateUsageIndex(project: ProjectData): Map<ID, StateUsage[]> {
  const index = new Map<ID, StateUsage[]>();
  const add = (id: ID, use: StateUsage) => { const list = index.get(id) ?? []; list.push(use); index.set(id, list); };
  for (const entity of project.entities.filter(adoptedRecord)) {
    if (entity.kind === 'checkpoint' || entity.kind === 'trace' || entity.kind === 'review') continue;
    for (const reference of collectReferences(entity)) {
      const writesState = entity.kind === 'effect' && reference.path === 'data.targetId' && ['set', 'add', 'reset'].includes(entity.data.operation);
      const readsState = reference.scope === 'entity' && reference.kinds?.length === 1 && reference.kinds[0] === 'variable';
      // General anchors, literal refs and production/publication targets protect
      // the variable record without reading its value during execution.
      if (!writesState && !readsState) continue;
      const operation = writesState && entity.kind === 'effect' ? entity.data.operation === 'reset' ? 'reset' : 'update' : 'read';
      add(reference.id, { entityId: entity.id, path: reference.path, operation, reason: entity.kind === 'effect' ? entity.data.reason ?? '' : entity.kind === 'variable' ? '算出または排他の参照' : '条件・宣言の参照' });
    }
    if (entity.kind === 'variable') {
      if (entity.data.derived) add(entity.id, { entityId: entity.id, path: 'data.derived', operation: 'update', reason: '算出式から再計算' });
      for (const [index,rule] of (entity.data.exclusions ?? []).entries()) add(entity.id, { entityId: entity.id, path: `data.exclusions[${index}].value`, operation: 'read', reason: rule.reason });
      for (const rule of entity.data.resetRules ?? []) add(entity.id, { entityId: entity.id, path: `data.resetRules.${rule.on}`, operation: 'reset', reason: rule.reason ?? rule.on });
    }
  }
  return index;
}
export function stateUsage(project: ProjectData, variableId: ID): StateUsage[] { return stateUsageIndex(project).get(variableId) ?? []; }
export function stateUpdateOrigins(project: ProjectData, effectId: ID): Entity[] {
  return project.entities.filter(entity => adoptedRecord(entity) && (entity.kind === 'flow_edge' && entity.data.effectIds?.includes(effectId) || entity.kind === 'disclosure' && entity.data.knowledgeEffects?.includes(effectId)));
}
