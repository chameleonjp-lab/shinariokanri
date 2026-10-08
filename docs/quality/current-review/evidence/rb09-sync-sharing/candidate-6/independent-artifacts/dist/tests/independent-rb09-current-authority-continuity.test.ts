import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {it,expect,afterEach,vi} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {newId} from '../src/domain/model';
import {ScopedEditorStore,type EditorImage,type EditorWork} from '../src/sync/editorStore';
import {valueHash,type SyncAck} from '../src/sync/protocol';
import {threeWayMerge} from '../src/sync/merge';
const root='/tmp/shinariokanri-independent-rb09-73a279a/independent',stores:ScopedEditorStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const s of stores.splice(0))await s.delete();});
function proof(id:string,data:unknown){writeFileSync(`${root}/fixtures/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function fixed(){const initial=JSON.parse(readFileSync(`${root}/fixed-fixtures/R9E00.json`,'utf8')).initial;return initial.base as EditorImage;}
async function image(revision='1',expiresAt:string|null=null){return {...fixed(),authorizationRevision:revision,authorizationExpiresAt:expiresAt};}
async function seed(expiresAt:string|null=null){const s=new ScopedEditorStore(newId());stores.push(s);const x=await image('1',expiresAt);await s.receive(x);return {s,x,id:x.documents[0].id};}
for(const phase of ['prepared','conflict'] as const){it('R9E07C-'+phase+' current coherent authority keeps full old work cold, resumes only still-allowed later input and never restores revoked command as active prepared',async()=>{
 const f=await seed(),project=f.x.projectId,b=f.x.documents[1].id;await f.s.saveField(project,f.id,'name','撤回前A');const op=(await f.s.prepare(project))!;await f.s.saveField(project,b,'name','送信中の独立した後発B');let remote=f.x.documents;
 if(phase==='conflict'){const common=op.targets[0].base!,server=structuredClone(common);server.fields.name='遠隔A';server.revision='2';remote=f.x.documents.map(d=>d.id===f.id?server:d);const merge=threeWayMerge(common,op.targets[0].local,server);if(merge.status!=='conflict')throw Error('REVIEW_CONFLICT_NOT_CONSTRUCTED');await f.s.acknowledge({schemaVersion:1,operationId:op.operationId,scope:op.scope,operationHash:await valueHash(op),status:'conflict',serverRevision:'2',authorizationRevision:'1',authorizationExpiresAt:null,documents:[server],confirmedDocuments:remote,conflicts:[merge.conflict]});}
 const original=(await f.s.get(project))!,fresh={...structuredClone(f.x),serverRevision:phase==='conflict'?'2':'1',documents:structuredClone(remote),authorizationRevision:'2'};delete fresh.documents[0].fields.name;fresh.contentHash=await valueHash(fresh.documents);await f.s.receive(fresh);const after=(await f.s.get(project))!;
 expect(after.recovered).toContainEqual(original);expect(after.prepared).toBeUndefined();expect(after.conflict).toBeUndefined();expect(after.documents).toEqual(fresh.documents);expect(after.documents[0].fields).not.toHaveProperty('name');
 f.s.close();stores.splice(stores.indexOf(f.s),1);const reopened=new ScopedEditorStore(f.s.accountId);stores.push(reopened);const cold=(await reopened.get(project))!;expect(cold).toEqual(after);
 const plan=await reopened.previewRecovery(project,cold.recovered!.length-1);expect(plan.documents[0].fields).not.toHaveProperty('name');expect(plan.documents[1].fields.name).toBe('送信中の独立した後発B');await reopened.adoptRecovery(plan);const adopted=(await reopened.get(project))!;expect(adopted.recovered).toContainEqual(original);expect(adopted.prepared).toBeUndefined();expect(adopted.documents[0].fields).not.toHaveProperty('name');expect(adopted.documents[1].fields.name).toBe('送信中の独立した後発B');const newOperation=await reopened.prepare(project);expect(newOperation!.targets.map(t=>t.targetId)).toEqual([b]);expect(newOperation!.operationId).not.toBe(op.operationId);
 proof('R9E07C-'+phase,{original,fresh,after,cold,plan,adopted,newOperation,expected:'Original entire work retained exactly cold; removed A never active; permitted later B resumes only after explicit current approval; new operation only B'});
 });}
