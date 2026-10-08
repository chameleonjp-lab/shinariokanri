import {remapEditedTextReferences,remapEditedTextRelationReferences} from '../domain/text';
import {reconcileDeliverables} from '../domain/production';
import type {ProjectData,ProjectContent} from '../domain/types';
import {validateProject} from '../domain/model';
import {validateProjectIntegrity} from '../domain/projectRecordValidation';
import {verifySnapshotHashes,verifyWorlds,worldSnapshotContents} from '../storage/archive';
import {assertOperation,clone,sameValue,valueHash,SyncProtocolError,type SyncDocument,type SyncOperation,type SyncAck} from './protocol';
import {threeWayMerge} from './merge';
import {nativeDocuments,nativeFromDocuments,sameDocumentContent} from './nativeBridge';
export interface ServerIdentity {accountId:string;sessionId:string}
export interface ServerState {projectId:string;serverRevision:string;documents:SyncDocument[];nativeImage:ProjectData;baseDocuments:SyncDocument[]|null;worlds:Record<string,ProjectData>;role:'owner'|'editor';previousAck:SyncAck|null}
/** Implemented by the dedicated PostgreSQL RPCs, never by a browser/global mutable memory server. */
export interface AtomicSyncRepository {
 read(identity:ServerIdentity,projectId:string,baseRevision:string|null,operationId:string|null):Promise<ServerState>;
 bootstrap(identity:ServerIdentity,input:{project:ProjectData;documents:SyncDocument[];worlds:Record<string,ProjectData>}):Promise<{projectId:string;serverRevision:string;documents:SyncDocument[]}>;
 commit(identity:ServerIdentity,input:{projectId:string;expectedRevision:string;operation:SyncOperation;operationHash:string;ack:SyncAck;documents:SyncDocument[];image:ProjectData;derivedIds?:string[]}):Promise<SyncAck>;
}
function fail(code:'FORBIDDEN'|'PROTOCOL_INVALID'|'BASE_UNAVAILABLE'):never{throw new SyncProtocolError(code);}
export async function reconcileServerReferences(previous:ProjectData,candidate:ProjectData){let next=candidate;for(const changed of candidate.entities){const old=previous.entities.find(e=>e.id===changed.id);if(old&&JSON.stringify(old.data)!==JSON.stringify(changed.data))next={...next,entities:remapEditedTextReferences(next.entities,old,changed),relations:remapEditedTextRelationReferences(next.relations,old,changed)};}return reconcileDeliverables(previous,next);}
export async function validateServerImage(project:ProjectData,worlds:Record<string,ProjectData>){const contents:Record<string,ProjectContent>=worldSnapshotContents(worlds),result=validateProject(project,{worldSnapshots:contents});if(!result.ok)fail('PROTOCOL_INVALID');await verifySnapshotHashes([project,...Object.values(worlds)]);verifyWorlds([project],worlds);if((await validateProjectIntegrity(project,{worldSnapshots:contents},false)).length)fail('PROTOCOL_INVALID');}
export async function bootstrapNativeProject(repository:AtomicSyncRepository,identity:ServerIdentity,input:{project:ProjectData;worlds:Record<string,ProjectData>}){
 const submitted=clone(input),actor=clone(identity);submitted.project.history=[];await validateServerImage(submitted.project,submitted.worlds);const documents=nativeDocuments(submitted.project,'1'),result=await repository.bootstrap(actor,{...submitted,documents});
 if(result.projectId!==submitted.project.projectId||result.serverRevision!=='1'||!sameValue(result.documents,documents))fail('PROTOCOL_INVALID');return {...result,contentHash:await valueHash(documents)};
}
/** The same merge/typed/native/replay rules run before PostgreSQL's optimistic atomic commit. */
export async function applyNativeOperation(repository:AtomicSyncRepository,identity:ServerIdentity,input:SyncOperation):Promise<SyncAck>{
 const operation=clone(input),actor=clone(identity);if(operation.scope.accountId!==actor.accountId)fail('FORBIDDEN');await assertOperation(operation);
 const state=await repository.read(actor,operation.scope.projectId,operation.baseRevision,operation.operationId),hash=await valueHash(operation);if(state.role!=='owner')fail('FORBIDDEN');
 if(state.previousAck){if(state.previousAck.operationHash!==hash)throw new SyncProtocolError('OPERATION_REUSED');return clone(state.previousAck);}
 if(!state.baseDocuments)fail('BASE_UNAVAILABLE');const base=new Map(state.baseDocuments!.map(doc=>[doc.id,doc])),current=new Map(state.documents.map(doc=>[doc.id,doc])),candidates:SyncDocument[]=[],conflicts=[];
 for(const target of operation.targets){const before=base.get(target.targetId)??null,server=current.get(target.targetId)??null;if(!sameValue(before,target.base)||before?.fields.kind!==undefined&&!sameValue(before.fields.kind,target.local.fields.kind)||before?.fields.createdAt!==undefined&&!sameValue(before.fields.createdAt,target.local.fields.createdAt))fail('PROTOCOL_INVALID');
  const merged=threeWayMerge(before,target.local,server);if(merged.status==='conflict')conflicts.push(merged.conflict);else candidates.push(merged.document);
 }
 const common={schemaVersion:1 as const,operationId:operation.operationId,scope:clone(operation.scope),operationHash:hash};let ack:SyncAck,image=clone(state.nativeImage),documents=clone(state.documents);
 if(conflicts.length)ack={...common,status:'conflict',serverRevision:state.serverRevision,documents:operation.targets.map(target=>clone(current.get(target.targetId)??null)),confirmedDocuments:documents,conflicts};
 else{const changed=candidates.some(doc=>!sameDocumentContent(current.get(doc.id),doc)),revision=changed?(BigInt(state.serverRevision)+1n).toString():state.serverRevision;
  for(const candidate of candidates){if(!sameDocumentContent(current.get(candidate.id),candidate))candidate.revision=revision;current.set(candidate.id,clone(candidate));}
  documents=[...current.values()];image=nativeFromDocuments(image,documents,new Date().toISOString());image.history=[];image=await reconcileServerReferences(state.nativeImage,image);documents=nativeDocuments(image,revision).map(d=>sameDocumentContent(state.documents.find(old=>old.id===d.id),d)?state.documents.find(old=>old.id===d.id)!:d);for(const d of documents)current.set(d.id,d);await validateServerImage(image,state.worlds);
  ack={...common,status:'applied',serverRevision:revision,documents:operation.targets.map(target=>clone(current.get(target.targetId)!)),confirmedDocuments:documents,conflicts:[]};
 }
 // Session, membership, original historical base, every target, revision and idempotency are checked again under the DB lock.
 return repository.commit(actor,{projectId:operation.scope.projectId,expectedRevision:state.serverRevision,operation,operationHash:hash,ack,documents,image,derivedIds:documents.filter(d=>!sameDocumentContent(state.documents.find(old=>old.id===d.id),d)&&!operation.targets.some(t=>t.targetId===d.id)).map(d=>d.id)});
}
