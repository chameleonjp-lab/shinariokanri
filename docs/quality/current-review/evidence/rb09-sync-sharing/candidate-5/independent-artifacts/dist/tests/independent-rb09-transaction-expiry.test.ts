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
for(const action of ['receive','saveField','prepare','acknowledge','resolve','adoptRecovery'] as const){
 it('R9ATX-'+action+' deadline crossing while IndexedDB transaction reads must refuse all active-state writes and preserve exact evidence',async()=>{
  const expires=Date.now()+60000,f=await seed(new Date(expires).toISOString()),project=f.x.projectId;let task:()=>Promise<unknown>;
  if(action==='receive')task=()=>f.s.receive(f.x);
  else if(action==='saveField')task=()=>f.s.saveField(project,f.id,'name','期限中に保存を依頼した入力');
  else if(action==='prepare'){await f.s.saveField(project,f.id,'name','期限中の編集');task=()=>f.s.prepare(project);}
  else if(action==='adoptRecovery'){const old=(await f.s.get(project))!;old.documents[0].fields.name='旧証跡入力';await f.s.retainRecovery(old);const plan=await f.s.previewRecovery(project,0);task=()=>f.s.adoptRecovery(plan);}
  else {
   await f.s.saveField(project,f.id,'name','端末案');const op=(await f.s.prepare(project))!,base=op.targets[0].base!,remote=structuredClone(action==='resolve'?base:op.targets[0].local);remote.fields.name=action==='resolve'?'遠隔案':'端末案';remote.revision='2';const merged=threeWayMerge(base,op.targets[0].local,remote);
   const ackFields={schemaVersion:1 as const,operationId:op.operationId,scope:op.scope,operationHash:await valueHash(op),serverRevision:'2',authorizationRevision:'1',authorizationExpiresAt:new Date(expires).toISOString(),documents:[remote],confirmedDocuments:f.x.documents.map(d=>d.id===f.id?remote:d)};const ack:SyncAck=action==='resolve'?{...ackFields,status:'conflict',conflicts:merged.status==='conflict'?[merged.conflict]:[]}:{...ackFields,status:'applied',conflicts:[]};
   if(action==='acknowledge')task=()=>f.s.acknowledge(ack);else{await f.s.acknowledge(ack);const saved=(await f.s.get(project))!;task=()=>f.s.resolve(project,{[f.id]:{strategy:'server'}},saved.revision);}
  }
  const before=await f.s.get(project),get=IDBObjectStore.prototype.get;let reads=0,armed=true;const clock=vi.spyOn(Date,'now');
  vi.spyOn(IDBObjectStore.prototype,'get').mockImplementation(function(this:IDBObjectStore,key:IDBValidKey|IDBKeyRange){if(armed&&this.name==='works'&&++reads===2)clock.mockReturnValue(expires+1);return get.call(this,key);});
  let error;try{await task!();}catch(e){error=e;}armed=false;const after=await f.s.get(project);
  proof('R9ATX-'+action,{before,after,error:String(error),deadline:new Date(expires).toISOString(),indexedDBReadCount:reads,expected:'public operation begins while authorized, deadline crosses during final atomic transaction read; no active write permitted'});
  expect(reads).toBeGreaterThanOrEqual(2);expect(error).toMatchObject({code:'FORBIDDEN'});expect(after).toEqual(before);
 });
}
