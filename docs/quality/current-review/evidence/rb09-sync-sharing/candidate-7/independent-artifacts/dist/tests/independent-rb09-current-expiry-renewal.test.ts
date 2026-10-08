import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {it,expect,afterEach,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {newId} from '../src/domain/model';
import {ScopedEditorStore,currentEditorImage,type EditorImage,type EditorWork} from '../src/sync/editorStore';
import {valueHash,type SyncAck} from '../src/sync/protocol';
import {threeWayMerge} from '../src/sync/merge';
const root='/tmp/shinariokanri-independent-rb09-cfaebcb/independent',stores:ScopedEditorStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const s of stores.splice(0))await s.delete();});
function proof(id:string,data:unknown){writeFileSync(`${root}/fixtures/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function fixed(){const initial=JSON.parse(readFileSync(`${root}/fixed-fixtures/R9E00.json`,'utf8')).initial;return initial.base as EditorImage;}
async function image(revision='1',expiresAt:string|null=null){return {...fixed(),authorizationRevision:revision,authorizationExpiresAt:expiresAt};}
async function seed(expiresAt:string|null=null){const s=new ScopedEditorStore(newId());stores.push(s);const x=await image('1',expiresAt);await s.receive(x);return {s,x,id:x.documents[0].id};}
it('R9E10 an expired old ACK cannot override a newly verified same-content/same-authority current A-only fieldset after B expires; current A remains writable and old evidence is exact',async()=>{
 const expires=Date.now()+60000,f=await seed(new Date(expires).toISOString()),project=f.x.projectId;await f.s.saveField(project,f.id,'name','確定A');const op=(await f.s.prepare(project))!,remote=structuredClone(op.targets[0].local);remote.revision='2';const ack:SyncAck={schemaVersion:1,operationId:op.operationId,scope:op.scope,operationHash:await valueHash(op),status:'applied',serverRevision:'2',authorizationRevision:'1',authorizationExpiresAt:new Date(expires).toISOString(),documents:[remote],confirmedDocuments:f.x.documents.map(d=>d.id===f.id?remote:d),conflicts:[]};await f.s.acknowledge(ack);
 vi.spyOn(Date,'now').mockReturnValue(expires+1);const fresh={projectId:project,serverRevision:'2',authorizationRevision:'1',authorizationExpiresAt:null,documents:[remote],contentHash:await valueHash([remote])};await f.s.receive(fresh);const before=(await f.s.get(project))!,effective=currentEditorImage(before);let error;try{await f.s.saveField(project,f.id,'name','現在有効なAへの正常入力');}catch(e){error=e;}const after=(await f.s.get(project))!;
 proof('R9E10',{ack,fresh,before,effective,after,error:String(error),clock:'B grant expiry passes; membership revision stays1, current fresh A-only descriptor has expiry=null',expected:'Successful new A input under fresh verified descriptor; old exact ACK retained as historical evidence, not current expired authorization'});
 expect(error).toBeUndefined();expect(after.documents[0].fields.name).toBe('現在有効なAへの正常入力');expect(after.acks).toEqual(before.acks);expect(after.retained).toEqual(before.retained);
});
