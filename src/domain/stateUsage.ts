import type { Entity, ID, ProjectData } from './types';
import { collectReferences } from './model';
import { adoptedRecord } from './adoption';
import {resolveReuseContent,reuseOrigin,reuseFieldOrigin} from './reuse';
import {beginDerivedEvaluation} from './derivedIndexes';

export interface StateUsage { entityId: ID; path: string; operation: 'read' | 'update' | 'reset'; reason: string; sourceEntityId?:ID; sourceVersionId?:ID; reuseOwnerId?:ID }
export function requiresFixedStateUsageVerification(project:ProjectData):boolean {
  return beginDerivedEvaluation(project)?.get('state.fixed-required','current',()=>({value:fixedRequired(project),cost:{references:0}}))??fixedRequired(project);
}
const fixedRequired=(project:ProjectData)=>project.entities.some(entity=>adoptedRecord(entity)&&(entity.kind==='scene'||entity.kind==='flow_node')&&entity.data.reuse&&entity.data.reuse.mode!=='clone');
/** Author-declared uses retain stable IDs across rename, reorder and clone.
 * Saved trial values and review targets still protect references, but are not
 * declarations that read, update or reset a state during a story. */
function regenerateStateUsageIndex(project: ProjectData): Map<ID, StateUsage[]> {
  // This is a declaration index. Callers that assess untrusted pins must verify
  // their expected hashes first; the catalog keeps that pending/failed work
  // unconfirmed rather than interpreting an incomplete index as unused.
  const execution=resolveReuseContent(project,project.snapshots);
  const index = new Map<ID, StateUsage[]>();
  const add = (id: ID, use: StateUsage) => {
    const list=index.get(id)??[],field=/^data\.([^.[\]]+)/u.exec(use.path)?.[1],origin=field?reuseFieldOrigin(execution,use.entityId,field):reuseOrigin(execution,use.entityId);
    list.push(origin?{...use,sourceEntityId:origin.entityId,sourceVersionId:origin.sourceVersionId,reuseOwnerId:origin.ownerId}:use);index.set(id,list);
  };
  for (const entity of execution.entities.filter(adoptedRecord)) {
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
export function stateUsageIndex(project:ProjectData):Map<ID,StateUsage[]>{
  const evaluation=beginDerivedEvaluation(project);
  if(!evaluation)return regenerateStateUsageIndex(project);
  const fixed=evaluation.get('state.fixed-required','current',()=>({value:fixedRequired(project),cost:{references:0}}));
  // A cached declaration map cannot stand in for required fixed-pin hash verification.
  if(fixed)return regenerateStateUsageIndex(project);
  const index=evaluation.get('state.usage/v1','current',()=>{
    const value=regenerateStateUsageIndex(project);let references=2*value.size,textCodeUnits=0;
    for(const [id,uses] of value){references+=uses.length;textCodeUnits+=id.length;for(const use of uses)textCodeUnits+=Object.values(use).reduce((n,value)=>n+(typeof value==='string'?value.length:0),0);}
    return {value,cost:{references,textCodeUnits}};
  });
  return evaluation.peek('state.usage/v1','current')===index?new Map([...index].map(([id,uses])=>[id,uses.map(use=>({...use}))])):index;
}
export function stateUsage(project: ProjectData, variableId: ID): StateUsage[] { return stateUsageIndex(project).get(variableId) ?? []; }
export function stateUpdateOrigins(project: ProjectData, effectId: ID): Entity[] {
  return project.entities.filter(entity => adoptedRecord(entity) && (entity.kind === 'flow_edge' && entity.data.effectIds?.includes(effectId) || entity.kind === 'disclosure' && entity.data.knowledgeEffects?.includes(effectId)));
}
