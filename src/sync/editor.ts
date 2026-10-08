import {reconcileDeliverables} from '../domain/production';
import {addChangeReviews} from '../domain/changeReviews';
import {assertOperation,fieldSlot,clone,createSyncOperation,sameValue,valueHash,SyncProtocolError,type SyncAck,type SyncDocument,type SyncOperation} from './protocol';
import {threeWayMerge} from './merge';
import {nativeDocuments,nativeFromDocuments,sameDocumentContent} from './nativeBridge';
import {reconcileServerReferences,validateServerImage,type AtomicSyncRepository,type ServerIdentity,type ServerState} from './server';
export interface EditorScope {id:string;fields:string[]}
export interface EditorServerState extends ServerState {scopes:EditorScope[]}
const immutable=new Set(['kind','visibility','createdAt']);
function fieldsFor(scopes:EditorScope[],id:string){const scope=scopes.find(s=>s.id===id);return scope?new Set([...scope.fields,...immutable]):null;}
export function scopedDocuments(state:EditorServerState,documents:SyncDocument[]=state.documents):SyncDocument[]{
 const allowed=new Set(state.scopes.map(s=>s.id));return documents.filter(doc=>allowed.has(doc.id)&&doc.fields.visibility==='team'&&doc.fields.kind!=='project').map(doc=>{
  const names=fieldsFor(state.scopes,doc.id)!;const fields=Object.fromEntries(Object.entries(doc.fields).filter(([key])=>names.has(key)));
  const localIds=new Set(allowed);const collect=(v:unknown):void=>{if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(typeof o.id==='string')localIds.add(o.id);Object.values(o).forEach(collect);}};Object.values(fields).forEach(collect);
  const inspect=(value:unknown):boolean=>typeof value==='string'?/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value)?localIds.has(value):true:Array.isArray(value)?value.every(inspect):value&&typeof value==='object'?Object.values(value).every(inspect):true;
  if(!Object.values(fields).every(inspect))throw new SyncProtocolError('FORBIDDEN');return {...clone(doc),fields:clone(fields)};
 });
}
/** The engine image remains private. Every returned conflict and ack uses the same field grant. */
export function editorAck(state:EditorServerState,ack:SyncAck):SyncAck{
 const trim=(doc:SyncDocument|null)=>{if(!doc)return null;const result=scopedDocuments(state,[doc])[0];if(!result)throw new SyncProtocolError('FORBIDDEN');return result;};
 const conflicts=ack.conflicts.map(row=>{const base=trim(row.base),local=trim(row.local),server=trim(row.server);if(!local)throw new SyncProtocolError('FORBIDDEN');const merged=threeWayMerge(base,local,server);if(merged.status!=='conflict')throw new SyncProtocolError('PROTOCOL_INVALID');return merged.conflict;});
 return {...clone(ack),documents:ack.documents.map(trim),confirmedDocuments:scopedDocuments(state,ack.confirmedDocuments??state.documents),conflicts} as SyncAck;
}
export async function readEditorImage(repository:AtomicSyncRepository,identity:ServerIdentity,projectId:string){const state=await repository.read(clone(identity),projectId,null,null) as EditorServerState;if(state.role!=='editor'||!Array.isArray(state.scopes))throw new SyncProtocolError('FORBIDDEN');const documents=scopedDocuments(state);return {projectId,serverRevision:state.serverRevision,documents,contentHash:await valueHash(documents)};}
export async function applyEditorOperation(repository:AtomicSyncRepository,identity:ServerIdentity,input:SyncOperation):Promise<SyncAck>{
 const op=clone(input),actor=clone(identity);if(op.scope.accountId!==actor.accountId)throw new SyncProtocolError('FORBIDDEN');await assertOperation(op);const state=await repository.read(actor,op.scope.projectId,op.baseRevision,op.operationId) as EditorServerState,hash=await valueHash(op);
 if(state.role!=='editor'||!Array.isArray(state.scopes))throw new SyncProtocolError('FORBIDDEN');for(const target of op.targets){const currentFields=fieldsFor(state.scopes,target.targetId);if(!currentFields||Object.keys(target.local.fields).some(key=>!currentFields.has(key)))throw new SyncProtocolError('FORBIDDEN');}if(state.previousAck){if(state.previousAck.operationHash!==hash)throw new SyncProtocolError('OPERATION_REUSED');return editorAck(state,state.previousAck);}
 if(!state.baseDocuments)throw new SyncProtocolError('BASE_UNAVAILABLE');const base=new Map(state.baseDocuments.map(d=>[d.id,d])),current=new Map(state.documents.map(d=>[d.id,d])),visibleBase=new Map(scopedDocuments(state,state.baseDocuments).map(d=>[d.id,d])),visibleCurrent=new Map(scopedDocuments(state).map(d=>[d.id,d])),candidates:SyncDocument[]=[],conflicts=[],fullTargets=[];
 for(const target of op.targets){const before=base.get(target.targetId),remote=current.get(target.targetId),names=fieldsFor(state.scopes,target.targetId);if(!before||!remote||!names||!sameValue(visibleBase.get(target.targetId)??null,target.base)||Object.keys(target.local.fields).some(k=>!names.has(k))||[...immutable].some(k=>!sameValue(fieldSlot(before,k),fieldSlot(target.local,k))))throw new SyncProtocolError('FORBIDDEN');
  const merged=threeWayMerge(target.base,target.local,visibleCurrent.get(target.targetId)??null);if(merged.status==='conflict')conflicts.push(merged.conflict);else{const full=clone(remote);for(const key of names){if(immutable.has(key))continue;if(Object.hasOwn(merged.document.fields,key))full.fields[key]=clone(merged.document.fields[key]);else delete full.fields[key];}full.tombstone=clone(merged.document.tombstone);candidates.push(full);}
  const expanded=clone(before);for(const key of names){if(immutable.has(key))continue;if(Object.hasOwn(target.local.fields,key))expanded.fields[key]=clone(target.local.fields[key]);else delete expanded.fields[key];}expanded.tombstone=clone(target.local.tombstone);fullTargets.push({base:before,local:expanded});
 }
 const expanded=await createSyncOperation({...op,targets:fullTargets}),common={schemaVersion:1 as const,operationId:op.operationId,scope:clone(op.scope),operationHash:hash};let ack:SyncAck,image=clone(state.nativeImage),documents=clone(state.documents);
 if(conflicts.length){const rows=expanded.targets.map(t=>threeWayMerge(t.base,t.local,current.get(t.targetId)??null)).filter(r=>r.status==='conflict').map(r=>r.conflict);ack={...common,status:'conflict',serverRevision:state.serverRevision,documents:expanded.targets.map(t=>clone(current.get(t.targetId)!)),confirmedDocuments:documents,conflicts:rows};}
 else{const revision=candidates.some(d=>!sameDocumentContent(current.get(d.id),d))?(BigInt(state.serverRevision)+1n).toString():state.serverRevision;for(const d of candidates){if(!sameDocumentContent(current.get(d.id),d))d.revision=revision;current.set(d.id,d);}documents=[...current.values()];image=nativeFromDocuments(image,documents,new Date().toISOString());image.history=[];image=addChangeReviews(state.nativeImage,await reconcileServerReferences(state.nativeImage,image));documents=nativeDocuments(image,revision).map(d=>sameDocumentContent(state.documents.find(old=>old.id===d.id),d)?state.documents.find(old=>old.id===d.id)!:d);for(const d of documents)current.set(d.id,d);await validateServerImage(image,state.worlds);ack={...common,status:'applied',serverRevision:revision,documents:op.targets.map(t=>clone(current.get(t.targetId)!)),confirmedDocuments:documents,conflicts:[]};}
 const committed=await repository.commit(actor,{projectId:op.scope.projectId,expectedRevision:state.serverRevision,operation:expanded,operationHash:hash,ack,documents,image,derivedIds:documents.filter(d=>!sameDocumentContent(state.documents.find(old=>old.id===d.id),d)&&!op.targets.some(t=>t.targetId===d.id)).map(d=>d.id)});return editorAck(state,committed);
}
