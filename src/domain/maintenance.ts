import type { Entity, ID, ProjectData } from './types';
import { collectReferences, rewriteEntityReferences, rewriteRelationReferences, validateProject } from './model';
export interface ReferenceImpact { sourceId: ID; sourceName: string; sourceKind: string; path: string; snapshotId?: ID }
export function deletionImpact(project: ProjectData, targetId: ID): ReferenceImpact[] {
 const impacts: ReferenceImpact[]=[];
 for(const entity of project.entities) {
  if(entity.deletedAt||entity.id===targetId)continue;
  for(const ref of collectReferences(entity))if(ref.id===targetId)impacts.push({sourceId:entity.id,sourceName:entity.name,sourceKind:entity.kind,path:ref.path});
 }
 for(const relation of project.relations)if(!relation.deletedAt&&(relation.fromId===targetId||relation.toId===targetId||relation.evidenceIds.includes(targetId)))impacts.push({sourceId:relation.id,sourceName:relation.relationType,sourceKind:'relation',path:'relation'});
 for(const snapshot of project.snapshots) {
  if(snapshot.content.entities.some(e=>e.id===targetId))impacts.push({sourceId:targetId,sourceName:snapshot.versionLabel,sourceKind:'immutable_snapshot',path:'snapshot.content',snapshotId:snapshot.id});
 }
 return impacts;
}
export function duplicateCandidates(project: ProjectData): {kind:string;name:string;ids:ID[]}[] {
 const groups=new Map<string,Entity[]>();
 for(const entity of project.entities) {
  if(entity.deletedAt||!entity.name.trim())continue;
  const key=entity.kind+'\0'+entity.name.normalize('NFKC').trim().toLocaleLowerCase('ja');
  groups.set(key,[...(groups.get(key)??[]),entity]);
 }
 return [...groups.values()].filter(group=>group.length>1).map(group=>({kind:group[0]!.kind,name:group[0]!.name,ids:group.map(e=>e.id)}));
}
export interface MergePlan { sourceId: ID; survivorId: ID; fields: Record<string,'source'|'survivor'>; operationId: ID; deletedAt: string }
/** Preview and validate a candidate; callers commit the whole result as one compensable command. */
export function previewMerge(project: ProjectData, plan: MergePlan) {
 if(plan.sourceId===plan.survivorId)throw new Error('VALIDATION_FAILED: 統合元と残す対象は別のIDです。');
 const source=project.entities.find(e=>e.id===plan.sourceId&&!e.deletedAt),survivor=project.entities.find(e=>e.id===plan.survivorId&&!e.deletedAt);
 if(!source||!survivor||source.kind!==survivor.kind)throw new Error('VALIDATION_FAILED: 同じ種類の既存項目を選んでください。');
 const next=structuredClone(project);
 const selected=next.entities.find(e=>e.id===survivor.id)!;
 const sourceData=source.data as unknown as Record<string,unknown>,targetData=selected.data as unknown as Record<string,unknown>;
 const changes:{field:string;from:unknown;to:unknown}[]=[];
 for(const [field,choice] of Object.entries(plan.fields)) {
  if(!Object.hasOwn(sourceData,field)&&!Object.hasOwn(targetData,field))throw new Error('VALIDATION_FAILED: 未知の統合項目です。');
  if(choice==='source'){changes.push({field,from:structuredClone(targetData[field]),to:structuredClone(sourceData[field])});if(Object.hasOwn(sourceData,field))targetData[field]=structuredClone(sourceData[field]);else delete targetData[field];}
 }
 const idMap=new Map([[source.id,survivor.id]]);
 next.entities=next.entities.map(entity=>rewriteEntityReferences(entity,idMap));
 next.relations=next.relations.map(relation=>rewriteRelationReferences(relation,idMap));
 const removed=next.entities.find(e=>e.id===source.id)!;removed.deletedAt=plan.deletedAt;removed.deletionOperationId=plan.operationId;
 // Snapshot contents are untouched. The old ID remains as a tombstone and in history.
 const validated=validateProject(next);
 if(!validated.ok)throw new Error(validated.issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n'));
 return {project:next,idMap:Object.fromEntries(idMap),changes,impact:deletionImpact(project,source.id)};
}
export function unreferencedEntities(project: ProjectData): ID[] {
 const refs=new Set<ID>();
 for(const e of project.entities)if(!e.deletedAt)for(const ref of collectReferences(e))refs.add(ref.id);
 for(const r of project.relations)if(!r.deletedAt){refs.add(r.fromId);refs.add(r.toId);r.evidenceIds.forEach(id=>refs.add(id));}
 return project.entities.filter(e=>!e.deletedAt&&!refs.has(e.id)).map(e=>e.id);
}
