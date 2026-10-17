import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createProject,newId} from '../../src/domain/model';
import {nativeDocuments} from '../../src/sync/nativeBridge';
import {valueHash} from '../../src/sync/protocol';
const stores:ScenarioStore[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
async function registered(){
 const store=new ScenarioStore({accountId:newId(),databaseName:`access-refresh-${newId()}`});stores.push(store);store.setAuthorAccess({});
 const project=(await store.saveProject(createProject('登録直後'),{reason:'新規'})).project,documents=nativeDocuments(project,project.revision);
 await store.bindBootstrapBase(project,{serverRevision:project.revision,documents,contentHash:await valueHash(documents),outboxIds:(await store.listOutbox(project.projectId)).map(row=>row.operationId)});
 return {store,project};
}
it('publishes authoritative refreshed roles after bootstrap so the selected editor can load',async()=>{
 const {store,project}=await registered();await expect(store.loadEditor(project.projectId)).rejects.toMatchObject({code:'CANCELLED'});
 await store.refreshAuthorAccess(async()=>({[project.projectId]:'owner'}));expect((await store.loadEditor(project.projectId))?.projectId).toBe(project.projectId);
});
for(const boundary of ['revocation','close','abort'] as const)it(`rejects an older owner response after ${boundary}`,async()=>{
 const {store,project}=await registered(),controller=new AbortController();let resolve!:(roles:Record<string,string>)=>void;
 const pending=store.refreshAuthorAccess(()=>new Promise(done=>{resolve=done;}),{signal:controller.signal});const rejected=expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 if(boundary==='revocation')store.setAuthorAccess({[project.projectId]:'viewer'});else if(boundary==='close')store.close();else controller.abort();
 resolve({[project.projectId]:'owner'});await rejected;
 if(boundary!=='close')await expect(store.loadEditor(project.projectId)).rejects.toMatchObject({code:'CANCELLED'});
});
it('does not publish an owner result after its captured session stops being current',async()=>{
 const {store,project}=await registered();let current=true,resolve!:(roles:Record<string,string>)=>void;
 const pending=store.refreshAuthorAccess(()=>new Promise(done=>{resolve=done;}),{isCurrent:()=>current});const rejected=expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 current=false;resolve({[project.projectId]:'owner'});await rejected;await expect(store.loadEditor(project.projectId)).rejects.toMatchObject({code:'CANCELLED'});
});
it('does not grant access from malformed roles and respects an authoritative omission',async()=>{
 const {store,project}=await registered();await expect(store.refreshAuthorAccess(async()=>({[project.projectId]:'administrator'}))).rejects.toMatchObject({code:'PROTOCOL_INVALID'});await expect(store.loadEditor(project.projectId)).rejects.toMatchObject({code:'CANCELLED'});
 await store.refreshAuthorAccess(async()=>({}));await expect(store.loadEditor(project.projectId)).rejects.toMatchObject({code:'CANCELLED'});
});
