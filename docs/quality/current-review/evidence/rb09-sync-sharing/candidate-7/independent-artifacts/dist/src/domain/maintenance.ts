import type { DomainReference } from './model';
import type { Entity, ID, ProjectData, Relation } from './types';
import { collectReferences, collectRelationReferences, newId, validateProject } from './model';
export interface ReferenceImpact { sourceId: ID; sourceName: string; sourceKind: string; path: string; snapshotId?: ID }
export function deletionImpact(project: ProjectData, targetId: ID): ReferenceImpact[] {
 const impacts: ReferenceImpact[]=[];
 for(const entity of project.entities) {
  if(entity.deletedAt||entity.id===targetId)continue;
  for(const ref of collectReferences(entity))if(ref.id===targetId) {
   const snapshotId=immutableReferenceVersion(entity,ref);
   impacts.push({sourceId:entity.id,sourceName:entity.name,sourceKind:entity.kind,path:ref.path,...(snapshotId?{snapshotId}:{})});
  }
 }
 for(const relation of project.relations)if(!relation.deletedAt)for(const ref of collectRelationReferences(relation))if(ref.id===targetId) {
  const snapshotId=immutableReferenceVersion(relation,ref);
  impacts.push({sourceId:relation.id,sourceName:relation.relationType,sourceKind:'relation',path:ref.path,...(snapshotId?{snapshotId}:{})});
 }
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
const BLOCK_KINDS = new Set(['paragraph', 'heading', 'list_item', 'quote']);

function pathParts(path: string): string[] { return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); }

export function immutableReferenceVersion(record: Entity | Relation, reference: DomainReference): ID | undefined {
 if (reference.scope === 'snapshot' && reference.id !== record.projectId) return reference.id;
 if ('kind' in record && record.kind === 'projection_profile' && record.data.sourceVersionId && record.data.sourceVersionId !== record.projectId && reference.path.startsWith('data.')) return record.data.sourceVersionId;
 if ('kind' in record && record.kind === 'review' && record.data.targetVersionId !== record.projectId && (reference.path === 'data.target' || reference.path.startsWith('data.target.'))) return record.data.targetVersionId;
 if ('kind' in record && record.kind === 'checkpoint' && record.data.contentVersionId !== record.projectId && (reference.path.startsWith('data.runtimeState.') || reference.path.startsWith('data.presentationResults['))) return record.data.contentVersionId;
 if ('kind' in record && record.kind === 'trace' && record.data.contentVersionId !== record.projectId && (reference.path.startsWith('data.steps[') || reference.path.startsWith('data.initialExternalValues.'))) return record.data.contentVersionId;
 let cursor: unknown = record;
 for (const part of pathParts(reference.path)) {
  if (cursor && typeof cursor === 'object') {
   const object = cursor as Record<string, unknown>;
   if (typeof object.entityId === 'string' && typeof object.sourceVersionId === 'string' && object.sourceVersionId !== record.projectId) return object.sourceVersionId;
   cursor = object[part];
  } else return undefined;
 }
 return undefined;
}

function pinnedReference(record: Entity | Relation, reference: DomainReference): boolean {
 return immutableReferenceVersion(record, reference) !== undefined;
}

function anchorForReference(record: Entity | Relation, reference: DomainReference): Record<string, unknown> | undefined {
 let cursor: unknown = record;
 for (const part of pathParts(reference.path)) {
  if (!cursor || typeof cursor !== 'object') return undefined;
  const object = cursor as Record<string, unknown>;
  if (typeof object.entityId === 'string') return object;
  cursor = object[part];
 }
 return undefined;
}

/** Rewrite only references resolved against the current project. Version-pinned anchors remain exact. */
function rewriteVersionedReferences<T extends Entity | Relation>(record: T, idMap: Map<ID, ID>, references: DomainReference[], onlyBlocks = false, remappedBlocks?: Map<ID, ID>, remappedEntities?: Map<ID, ID>, remappedAliases?: Map<ID, ID>): T {
 const copy = structuredClone(record) as unknown as Record<string, unknown>;
 const ordered = [...references].sort((a, b) => {
  const aKey = a.path.endsWith('.$key'), bKey = b.path.endsWith('.$key');
  return Number(aKey) - Number(bKey) || (aKey ? pathParts(b.path).length - pathParts(a.path).length : 0);
 });
 for (const reference of ordered) {
  if (pinnedReference(record, reference)) continue;
  if (onlyBlocks ? !['block', 'presentation', 'projection_record'].includes(reference.scope) : reference.scope === 'block' || reference.scope === 'snapshot') continue;
  if (['identity', 'calendar', 'project', 'relation'].includes(reference.scope)) continue;
  if (reference.scope === 'alias' && !remappedAliases) continue;
  if (!onlyBlocks && remappedBlocks && remappedEntities) {
   const anchor = anchorForReference(record, reference);
   if (anchor && typeof anchor.entityId === 'string' && remappedEntities.has(anchor.entityId) && typeof anchor.blockId === 'string' && !remappedBlocks.has(anchor.blockId)) continue;
  }
  const replacement = reference.scope === 'alias' ? remappedAliases?.get(reference.id) : reference.scope === 'projection_record' ? remappedAliases?.get(reference.id) ?? idMap.get(reference.id) : idMap.get(reference.id);
  if (!replacement) continue;
  const parts = pathParts(reference.path), dictionaryKey = parts.at(-1) === '$key';
  if (dictionaryKey) parts.pop();
  const field = parts.pop(); if (!field) continue;
  let cursor = copy;
  for (const part of parts) cursor = cursor[part] as Record<string, unknown>;
  if (dictionaryKey) {
   if (replacement === field) continue;
   if (Object.hasOwn(cursor, replacement)) throw new Error('REFERENCE_INVALID: 参照の統合で辞書キーが衝突します。保持する内容を選んでください。');
   cursor[replacement] = cursor[field]; delete cursor[field];
  } else cursor[field] = replacement;
 }
 return copy as unknown as T;
}

function remapCopiedContentIds(value: unknown, blockIds: Map<ID, ID>, aliasIds: Map<ID, ID>): unknown {
 if (Array.isArray(value)) return value.map(item => remapCopiedContentIds(item, blockIds, aliasIds));
 if (!value || typeof value !== 'object') return value;
 const object = value as Record<string, unknown>;
 const isBlock = typeof object.id === 'string' && typeof object.text === 'string' && BLOCK_KINDS.has(String(object.kind));
 const isAlias = typeof object.id === 'string' && 'isPublicDefault' in object;
 const copy: Record<string, unknown> = {};
 for (const [key, child] of Object.entries(object)) copy[key] = remapCopiedContentIds(child, blockIds, aliasIds);
 if (isBlock) {
  const blockId = object.id as ID;
  if (!blockIds.has(blockId)) blockIds.set(blockId, newId());
  copy.id = blockIds.get(blockId)!;
 }
 if (isAlias) {
  const aliasId = object.id as ID;
  if (!aliasIds.has(aliasId)) aliasIds.set(aliasId, newId());
  copy.id = aliasIds.get(aliasId)!;
 }
 return copy;
}

/** Preview and validate a candidate; callers commit the whole result as one compensable command. */
export function previewMerge(project: ProjectData, plan: MergePlan) {
 if(plan.sourceId===plan.survivorId)throw new Error('VALIDATION_FAILED: 統合元と残す対象は別のIDです。');
 const source=project.entities.find(e=>e.id===plan.sourceId&&!e.deletedAt),survivor=project.entities.find(e=>e.id===plan.survivorId&&!e.deletedAt);
 if(!source||!survivor||source.kind!==survivor.kind)throw new Error('VALIDATION_FAILED: 同じ種類の既存項目を選んでください。');
 const next={...structuredClone({...project,history:[]}),history:project.history};
 const selected=next.entities.find(e=>e.id===survivor.id)!;
 const sourceData=source.data as unknown as Record<string,unknown>,targetData=selected.data as unknown as Record<string,unknown>;
 const changes:{field:string;from:unknown;to:unknown}[]=[];
 for(const [field,choice] of Object.entries(plan.fields)) {
  if(!Object.hasOwn(sourceData,field)&&!Object.hasOwn(targetData,field))throw new Error('VALIDATION_FAILED: 未知の統合項目です。');
 }
 const idMap=new Map([[source.id,survivor.id]]), blockIds=new Map<ID,ID>(), aliasIds=new Map<ID,ID>();
 // A copied rich-text field needs fresh current-content block IDs because the archived source entity remains intact.
 for (const [field, choice] of Object.entries(plan.fields)) if (choice === 'source' && Object.hasOwn(sourceData,field)) {
  const from=structuredClone(targetData[field]);
  const adopted = remapCopiedContentIds(sourceData[field], blockIds, aliasIds);
  changes.push({field,from,to:structuredClone(adopted)});
  targetData[field]=adopted;
 } else if (choice === 'source') {
  changes.push({field,from:structuredClone(targetData[field]),to:undefined});
  delete targetData[field];
 }
 // Rewrite current entity/relation references, while keeping references explicitly tied to an immutable version.
 next.entities=next.entities.map(entity=>rewriteVersionedReferences(entity,idMap,collectReferences(entity),false,blockIds,idMap,aliasIds));
 next.relations=next.relations.map(relation=>rewriteVersionedReferences(relation,idMap,collectRelationReferences(relation),false,blockIds,idMap,aliasIds));
 if(blockIds.size){
  next.entities=next.entities.map(entity=>rewriteVersionedReferences(entity,blockIds,collectReferences(entity),true));
  next.relations=next.relations.map(relation=>rewriteVersionedReferences(relation,blockIds,collectRelationReferences(relation),true));
 }
 next.views=next.views.map(view=>({...view,entityIds:view.entityIds.map(id=>idMap.get(id)??id)}));
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
