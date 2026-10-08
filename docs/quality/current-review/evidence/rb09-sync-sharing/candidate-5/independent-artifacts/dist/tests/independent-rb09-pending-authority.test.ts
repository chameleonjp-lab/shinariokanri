import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {it,expect,afterEach,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {newId} from '../src/domain/model';
import {ScopedEditorStore,type EditorImage,type EditorWork} from '../src/sync/editorStore';
import {valueHash,type SyncAck} from '../src/sync/protocol';
import {threeWayMerge} from '../src/sync/merge';
const root='/tmp/shinariokanri-independent-rb09-ff971b7/independent',stores:ScopedEditorStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const s of stores.splice(0))await s.delete();});
function proof(id:string,data:unknown){writeFileSync(`${root}/fixtures/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function fixed(){const initial=JSON.parse(readFileSync(`${root}/fixed-fixtures/R9E00.json`,'utf8')).initial;return initial.base as EditorImage;}
async function image(revision='1',expiresAt:string|null=null){return {...fixed(),authorizationRevision:revision,authorizationExpiresAt:expiresAt};}
async function seed(expiresAt:string|null=null){const s=new ScopedEditorStore(newId());stores.push(s);const x=await image('1',expiresAt);await s.receive(x);return {s,x,id:x.documents[0].id};}
for(const phase of ['prepared','conflict'] as const){it('R9E07-'+phase+' a newly verified field withdrawal must stop active writes while preserving the old prepared/conflict evidence',async()=>{
 const f=await seed();await f.s.saveField(f.x.projectId,f.id,'name','撤回前の未送信入力');const op=(await f.s.prepare(f.x.projectId))!;
 if(phase==='conflict'){const base=op.targets[0].base!,remote=structuredClone(base);remote.fields.name='遠隔案';remote.revision='2';const merge=threeWayMerge(base,op.targets[0].local,remote);if(merge.status!=='conflict')throw Error('REVIEW_CONFLICT_NOT_CONSTRUCTED');const ack:SyncAck={schemaVersion:1,operationId:op.operationId,scope:op.scope,operationHash:await valueHash(op),status:'conflict',serverRevision:'2',authorizationRevision:'1',authorizationExpiresAt:null,documents:[remote],confirmedDocuments:f.x.documents.map(d=>d.id===f.id?remote:d),conflicts:[merge.conflict]};await f.s.acknowledge(ack);}
 const original=(await f.s.get(f.x.projectId))!,fresh={...structuredClone(f.x),authorizationRevision:'2'};delete fresh.documents[0].fields.name;fresh.contentHash=await valueHash(fresh.documents);
 let receiveError;try{await f.s.receive(fresh);}catch(e){receiveError=e;}const before=await f.s.get(f.x.projectId);let error;try{await f.s.saveField(f.x.projectId,f.id,'name','撤回後の新規編集');}catch(e){error=e;}const after=await f.s.get(f.x.projectId);
 proof('R9E07-'+phase,{original,fresh,receiveError:String(receiveError),before,after,error:String(error),expected:'A current verified narrower fieldset may preserve old prepared/ACK as evidence or needs_reconnect, but never continues using the old grant as permission for new active writes'});
 expect(error).toMatchObject({code:'FORBIDDEN'});expect(after).toEqual(before);expect(JSON.stringify(after)).toContain(op.operationId);
 });}
