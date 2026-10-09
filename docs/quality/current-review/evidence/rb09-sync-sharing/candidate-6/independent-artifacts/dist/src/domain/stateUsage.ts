import type { Entity, ID, ProjectData } from './types';
import { collectReferences } from './model';
import { adoptedRecord } from './adoption';

export interface StateUsage { entityId: ID; path: string; operation: 'read' | 'update' | 'reset'; reason: string }
/** Schema references retain stable IDs across rename, reorder and clone. */
export function stateUsage(project: ProjectData, variableId: ID): StateUsage[] {
  const uses: StateUsage[] = [];
  for (const entity of project.entities.filter(adoptedRecord)) {
    for (const reference of collectReferences(entity)) if (reference.id === variableId) {
      const operation = entity.kind === 'effect' && reference.path === 'data.targetId' ? entity.data.operation === 'reset' ? 'reset' : 'update' : 'read';
      uses.push({ entityId: entity.id, path: reference.path, operation, reason: entity.kind === 'effect' ? entity.data.reason ?? '' : entity.kind === 'variable' ? '算出または排他の参照' : '条件・宣言の参照' });
    }
    if (entity.id === variableId && entity.kind === 'variable') for (const rule of entity.data.resetRules ?? []) uses.push({ entityId: variableId, path: `data.resetRules.${rule.on}`, operation: 'reset', reason: rule.reason ?? rule.on });
  }
  return uses;
}
export function stateUpdateOrigins(project: ProjectData, effectId: ID): Entity[] {
  return project.entities.filter(entity => adoptedRecord(entity) && (entity.kind === 'flow_edge' && entity.data.effectIds?.includes(effectId) || entity.kind === 'disclosure' && entity.data.knowledgeEffects?.includes(effectId)));
}
