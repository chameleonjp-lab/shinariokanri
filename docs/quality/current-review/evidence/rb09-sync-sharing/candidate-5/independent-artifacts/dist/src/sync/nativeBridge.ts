import type { Entity, Relation, ProjectData } from '../domain/types';
import { newId, validateProject } from '../domain/model';
import { toSyncDocument } from './adapter';
import { clone, createSyncOperation, sameValue, SyncProtocolError, type SyncAck, type SyncConflict, type SyncDocument, type SyncOperation, type SyncScope } from './protocol';
import { threeWayMerge, type ConflictResolution } from './merge';

export interface ConfirmedSyncBase { projectId:string; serverRevision:string; documents:SyncDocument[]; contentHash:string }
export interface PreparedNativeOperation { operationId:string; projectId:string; operation:SyncOperation; localRevision:string; localDocuments:SyncDocument[]; outboxIds:string[]; origin?:'prepared_operation'|'received_image'; createdAt:string }
export interface PreservedNativeConflict { operationId:string; projectId:string; prepared:PreparedNativeOperation; ack:SyncAck; conflicts:SyncConflict[]; createdAt:string }
export interface NativeSyncAck { operationId:string; projectId:string; operation:SyncOperation; ack:SyncAck; origin?:'prepared_operation'|'received_image'; createdAt:string }

/** Server record revisions and local save revisions have different meanings. */
export function nativeDocuments(project:ProjectData,revision:string):SyncDocument[]{
 const {entities,relations,history:_history,...header}=project;
 return [toSyncDocument({...header,id:project.projectId,kind:'project',visibility:'private',revision,entityIds:entities.map(e=>e.id),relationIds:relations.map(r=>r.id)}),...entities.map(e=>{const doc=toSyncDocument({...e,revision});doc.fields.createdAt=e.createdAt;return doc;}),...relations.map(r=>toSyncDocument({...r,revision}))];
}
export function sameDocumentContent(a:SyncDocument|null|undefined,b:SyncDocument|null|undefined){return sameValue(a?{fields:a.fields,tombstone:a.tombstone}:null,b?{fields:b.fields,tombstone:b.tombstone}:null);}
function inflate(doc:SyncDocument):Record<string,unknown>{
 const result:Record<string,unknown>={id:doc.id,projectId:doc.projectId,revision:doc.revision};
 for(const [key,value]of Object.entries(doc.fields)){if(key.startsWith('data.')){const nested=key.slice(5);if(!nested||nested.includes('.')||['__proto__','prototype','constructor'].includes(nested))throw new SyncProtocolError('PROTOCOL_INVALID');result.data??={};(result.data as Record<string,unknown>)[nested]=clone(value);}else{if(['id','projectId','revision','updatedAt','deletedAt','deletionOperationId','__proto__','prototype','constructor'].includes(key))throw new SyncProtocolError('PROTOCOL_INVALID');result[key]=clone(value);}}
 if(doc.tombstone){result.deletedAt=doc.tombstone.deletedAt;result.deletionOperationId=doc.tombstone.operationId;}return result;
}
/** Construct a native candidate; validation and durable integrity are performed before the transaction. */
export function nativeFromDocuments(previous:ProjectData,documents:SyncDocument[],now:string):ProjectData{
 const byId=new Map(documents.map(doc=>[doc.id,doc]));if(byId.size!==documents.length)throw new SyncProtocolError('PROTOCOL_INVALID');
 const head=byId.get(previous.projectId);if(!head||head.fields.kind!=='project'||head.tombstone)throw new SyncProtocolError('PROTOCOL_INVALID');
 const raw=inflate(head),{id:_id,kind:_kind,visibility:_visibility,entityIds,relationIds,...header}=raw;
 if(!Array.isArray(entityIds)||!Array.isArray(relationIds)||[...entityIds,...relationIds].some(id=>typeof id!=='string')||new Set([...entityIds,...relationIds,head.id]).size!==documents.length)throw new SyncProtocolError('PROTOCOL_INVALID');
 const records=new Map([...previous.entities,...previous.relations].map(record=>[record.id,record]));
 const get=(id:unknown,entity:boolean)=>{const doc=byId.get(id as string);if(!doc||doc.projectId!==previous.projectId)throw new SyncProtocolError('PROTOCOL_INVALID');const record=inflate(doc),old=records.get(doc.id);if(entity){record.createdAt=record.createdAt??(old&&'createdAt'in old?old.createdAt:now);if(old&&'createdAt'in old&&old.createdAt!==record.createdAt)throw new SyncProtocolError('PROTOCOL_INVALID');record.updatedAt=old&&'updatedAt'in old?old.updatedAt:now;}record.revision=old?.revision??'0';if(!doc.tombstone){delete record.deletedAt;delete record.deletionOperationId;}return record;};
 return {...header,projectId:previous.projectId,revision:previous.revision,entities:entityIds.map(id=>get(id,true)) as Entity[],relations:relationIds.map(id=>get(id,false)) as unknown as Relation[],history:previous.history} as ProjectData;
}
export async function prepareNativeOperation(scope:SyncScope,base:ConfirmedSyncBase,project:ProjectData,outboxIds:string[],reason:string):Promise<PreparedNativeOperation|null>{
 scope=clone(scope);const captured=clone(project),confirmed=clone(base),ids=clone(outboxIds),local=nativeDocuments(captured,confirmed.serverRevision),old=new Map(confirmed.documents.map(doc=>[doc.id,doc]));
 const targets=local.filter(doc=>!sameDocumentContent(old.get(doc.id),doc)).map(doc=>({base:old.get(doc.id)??null,local:doc}));
 // Physical removal must already be represented by a native tombstone; silently losing records is forbidden.
 if(confirmed.documents.some(doc=>!local.some(value=>value.id===doc.id)))throw new SyncProtocolError('PROTOCOL_INVALID');
 if(!targets.length)return null;
 const operation=await createSyncOperation({scope:clone(scope),baseRevision:confirmed.serverRevision,operationId:newId(),targets,reason});
 return {operationId:operation.operationId,projectId:scope.projectId,operation,localRevision:captured.revision,localDocuments:local,outboxIds:ids,createdAt:new Date().toISOString()};
}
/** Reapply edits made after preparation. A contested new edit remains local and becomes a new conflict. */
export function acknowledgeNativeDocuments(prepared:PreparedNativeOperation,base:ConfirmedSyncBase,ack:SyncAck,current:ProjectData|SyncDocument[]){
 if(BigInt(ack.serverRevision)<BigInt(base.serverRevision)||!ack.confirmedDocuments)throw new SyncProtocolError('PROTOCOL_INVALID');
 const confirmed=new Map(ack.confirmedDocuments.map(doc=>[doc.id,clone(doc)]));
 const latest=Array.isArray(current)?current:nativeDocuments(current,ack.serverRevision),before=new Map(prepared.localDocuments.map(doc=>[doc.id,doc])),conflicts:SyncConflict[]=[],next:SyncDocument[]=[];
 for(const local of latest){const server=confirmed.get(local.id)??null,prior=before.get(local.id)??null;
  if(!prior&&!server){next.push(clone(local));continue;}
  const merged=threeWayMerge(prior,local,server);if(merged.status==='conflict'){conflicts.push(merged.conflict);next.push(clone(local));}else next.push(merged.document);
 }
 for(const server of confirmed.values())if(!next.some(doc=>doc.id===server.id))next.push(clone(server));
 return {confirmed:[...confirmed.values()],documents:next,conflicts};
}
export function resolveNativeConflict(saved:PreservedNativeConflict,choices:Record<string,ConflictResolution>,latest:SyncDocument[]){
 const byId=new Map(latest.map(doc=>[doc.id,doc]));
 if(!sameValue(Object.keys(choices).sort(),saved.conflicts.map(c=>c.targetId).sort()))throw new SyncProtocolError('PROTOCOL_INVALID');
 return saved.prepared.operation.targets.map((target,index)=>{
  const base=saved.ack.documents[index],server=byId.get(target.targetId)??null;if(!sameValue(base,server))throw new SyncProtocolError('REVISION_CHANGED');
  const conflict=saved.conflicts.find(c=>c.targetId===target.targetId);let local:SyncDocument;
  if(!conflict){const merged=threeWayMerge(target.base,target.local,server);if(merged.status!=='merged')throw new SyncProtocolError('REVISION_CHANGED');local=merged.document;}
  else{const choice=choices[target.targetId];if(choice.strategy==='fields'){
   if(conflict.reasons.some(reason=>reason!=='same-field')||!sameValue(Object.keys(choice.choices).sort(),conflict.fields.map(field=>field.field).sort())||!server)throw new SyncProtocolError('PROTOCOL_INVALID');
   local=clone(server);local.fields={};for(const [field,slot]of Object.entries(conflict.automaticFields))if(slot.present)local.fields[field]=clone(slot.value);
   for(const field of conflict.fields){const selected=choice.choices[field.field],slot=selected==='local'?field.local:selected==='server'?field.server:selected.value;if(slot.present)local.fields[field.field]=clone(slot.value);}
  }else{local=clone(choice.strategy==='local'?conflict.local:server??(()=>{throw new SyncProtocolError('BASE_UNAVAILABLE');})());}}
  return {base,local};
 });
}
/** Resolve the current local image. New uncontested edits and targets outside the sent batch stay present. */
export function resolveCurrentNativeConflict(saved:PreservedNativeConflict,choices:Record<string,ConflictResolution>,serverDocuments:SyncDocument[],current:ProjectData|SyncDocument[]){
 const server=new Map(serverDocuments.map(doc=>[doc.id,doc])),local=new Map((Array.isArray(current)?current:nativeDocuments(current,saved.ack.serverRevision)).map(doc=>[doc.id,doc]));
 if(!sameValue(Object.keys(choices).sort(),saved.conflicts.map(c=>c.targetId).sort()))throw new SyncProtocolError('PROTOCOL_INVALID');
 const ids=new Set([...saved.prepared.operation.targets.map(t=>t.targetId),...saved.conflicts.map(c=>c.targetId),...local.keys()]);
 const targets:{base:SyncDocument|null;local:SyncDocument}[]=[];
 for(const id of ids){const remote=server.get(id)??null,now=local.get(id),old=saved.prepared.operation.targets.find(t=>t.targetId===id),captured=saved.conflicts.find(c=>c.targetId===id);if(!now)throw new SyncProtocolError('PROTOCOL_INVALID');let resolved=clone(now);
  if(captured){if(!sameValue(captured.server,remote))throw new SyncProtocolError('REVISION_CHANGED');const fresh=threeWayMerge(captured.base,now,remote),choice=choices[id];
   if(fresh.status==='merged')resolved=fresh.document;
   else if(choice.strategy==='fields'){
    if(fresh.conflict.reasons.some(r=>r!=='same-field')||!sameValue(Object.keys(choice.choices).sort(),fresh.conflict.fields.map(f=>f.field).sort())||!remote)throw new SyncProtocolError('REVISION_CHANGED');
    resolved=clone(remote);resolved.fields={};for(const [field,slot]of Object.entries(fresh.conflict.automaticFields))if(slot.present)resolved.fields[field]=clone(slot.value);
    for(const field of fresh.conflict.fields){const pick=choice.choices[field.field],slot=pick==='local'?field.local:pick==='server'?field.server:pick.value;if(slot.present)resolved.fields[field.field]=clone(slot.value);}
   }else if(fresh.conflict.reasons.every(r=>r==='same-field')&&remote){
    resolved=clone(remote);resolved.fields={};for(const [field,slot]of Object.entries(fresh.conflict.automaticFields))if(slot.present)resolved.fields[field]=clone(slot.value);
    for(const field of fresh.conflict.fields){const slot=choice.strategy==='local'?field.local:field.server;if(slot.present)resolved.fields[field.field]=clone(slot.value);}
   }else resolved=clone(choice.strategy==='local'?now:remote??(()=>{throw new SyncProtocolError('BASE_UNAVAILABLE');})());
  }else if(saved.ack.status==='conflict'&&old){const fresh=threeWayMerge(old.base,now,remote);if(fresh.status==='conflict')throw new SyncProtocolError('REVISION_CHANGED');resolved=fresh.document;}
  if(old||captured||!sameDocumentContent(remote,resolved))targets.push({base:clone(remote),local:resolved});
 }
 return targets;
}
export function validateNativeSyncImage(project:ProjectData,worlds:Record<string,import('../domain/types').ProjectContent>={}){const result=validateProject(project,{worldSnapshots:worlds});if(!result.ok)throw new SyncProtocolError('PROTOCOL_INVALID');return result.value;}
