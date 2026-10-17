import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createProject,createEntity} from '../../src/domain/model';
import {packRecordData} from '../../src/storage/recordPartsCore';
import {createWorldSnapshot} from '../../src/domain/world';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {startProbe} from '../../src/observability/probe';
const stores:ScenarioStore[]=[];
const open=()=>{const store=new ScenarioStore({databaseName:`summary-${crypto.randomUUID()}`});stores.push(store);return store;};
const db=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
afterEach(async()=>{vi.restoreAllMocks();for(const store of stores.splice(0))await store.deleteDatabase();});
it('lists exact active counts without hydrating any current bodies after a cold reopen',async()=>{
 const store=open(), input=createProject('Count'); input.entities=[createEntity(input.projectId,'note','Deleted'),createEntity(input.projectId,'note','Active')]; input.entities[0].deletedAt=new Date().toISOString(); input.entities[0].deletionOperationId=crypto.randomUUID();
 const saved=(await store.saveProject(input,{reason:'seed'})).project;store.close();await store.reopen();
 const probe=startProbe();const summaries=await store.listProjectSummaries();const measured=probe.stop();
 expect(summaries.map(p=>[p.projectId,p.name,p.revision,p.entityCount,p.contentState])).toEqual([[saved.projectId,saved.name,saved.revision,saved.entities.filter(e=>!e.deletedAt).length,'unloaded']]);
 expect(summaries[0].saveState).toMatchObject({pendingCount:1,recoveredPendingCount:0,pendingAssetCount:'unloaded'});
 for(const table of ['entities','relations','blocks','snapshots','commands','assets','recordParts'])expect(measured.counters[`db.read.rows.${table}`]??0,table).toBe(0);
});
it('repairs a missing or corrupt summary without changing canonical content and isolates invalid works',async()=>{
 const store=open(), good=(await store.saveProject(createProject('Healthy'),{reason:'seed'})).project,bad=(await store.saveProject(createProject('Broken'),{reason:'seed'})).project;
 await db(store).table('projectSummaries').clear();await db(store).table('projects').put({...await db(store).table('projects').get(bad.projectId),schemaVersion:'999.0'});store.close();await store.reopen();
 const rows=await store.listProjectSummaries();expect(rows.find(p=>p.projectId===good.projectId)).toMatchObject({name:'Healthy',contentState:'unloaded',entityCount:0});
 expect(rows.find(p=>p.projectId===bad.projectId)?.contentState).toBe('error');
 expect((await store.loadEditor(good.projectId))?.name).toBe('Healthy');await expect(store.loadEditor(bad.projectId)).rejects.toThrow();
 expect((await db(store).table('projects').get(bad.projectId)).schemaVersion).toBe('999.0');
});
it('captures cancellation/options and refuses an expected revision mismatch',async()=>{
 const store=open(), saved=(await store.saveProject(createProject('Selected'),{reason:'seed'})).project;store.close();await store.reopen();
 const controller=new AbortController(),options={signal:controller.signal,expectedRevision:saved.revision,immutableView:true,onStage:()=>controller.abort()};
 const pending=store.loadEditor(saved.projectId,options);options.signal=new AbortController().signal;
 await expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 await expect(store.loadEditor(saved.projectId,{expectedRevision:'0'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 expect(await store.loadEditor(crypto.randomUUID())).toBeUndefined();
});

for(const count of [1,10,50])it(`lists ${count} works in canonical ID order with independently expected fields and zero body rows`,async()=>{
 const store=open(),expected=[];
 for(let i=0;i<count;i++){const p=createProject(`Work ${i}`);p.entities=[createEntity(p.projectId,'note',`Note ${i}`)];const saved=(await store.saveProject(p,{reason:'seed'})).project;expected.push({projectId:saved.projectId,name:`Work ${i}`,revision:'1',entityCount:1});}
 expected.sort((a,b)=>a.projectId.localeCompare(b.projectId));store.close();await store.reopen();
 const probe=startProbe();const rows=await store.listProjectSummaries();const measured=probe.stop();
 expect(rows.map(({projectId,name,revision,entityCount})=>({projectId,name,revision,entityCount}))).toEqual(expected);
 expect(measured.counters['db.read.rows.projectSummaries']).toBe(count);
 expect(measured.counters['db.read.rows.projects']).toBe(count);
 for(const table of ['entities','relations','blocks','snapshots','commands','assets','worlds','recordParts'])expect(measured.counters[`db.read.rows.${table}`]??0,table).toBe(0);
 expect((store as unknown as {cachedProjects:Map<string,unknown>}).cachedProjects.size).toBe(0);
});
it('rebuilds corrupt and stale metadata, preserves recovered queue counts and never alters canonical rows',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Original'),{reason:'seed'})).project;
 const header=await db(store).table('projects').get(saved.projectId);
 await db(store).table('projectSummaries').put({...await db(store).table('projectSummaries').get(saved.projectId),entityCount:999});
 await db(store).table('recoveredPending').put({key:'retained',projectId:saved.projectId,status:'needs_reconnect'});
 expect((await store.listProjectSummaries())[0]).toMatchObject({name:'Original',entityCount:0,saveState:{pendingCount:1,recoveredPendingCount:1}});
 expect(await db(store).table('projects').get(saved.projectId)).toEqual(header);
 await db(store).table('projects').put({...header,name:'Changed header'});
 expect((await store.listProjectSummaries())[0]).toMatchObject({name:'Changed header',entityCount:0});
 expect(await db(store).table('projects').get(saved.projectId)).toEqual({...header,name:'Changed header'});
});
it('keeps summary and content atomic on final-stage quota failure and retries failed backfill',async()=>{
 let fail=false;const store=new ScenarioStore({databaseName:`summary-fault-${crypto.randomUUID()}`,faultInjector:stage=>{if(fail&&stage==='before-commit')throw new DOMException('test quota','QuotaExceededError');}});stores.push(store);
 const saved=(await store.saveProject(createProject('Committed'),{reason:'seed'})).project;
 const before=await db(store).table('projectSummaries').get(saved.projectId);fail=true;
 await expect(store.saveProject({...saved,name:'Must roll back'},{reason:'fail'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
 expect(await db(store).table('projectSummaries').get(saved.projectId)).toEqual(before);
 expect((await store.getProject(saved.projectId))?.name).toBe('Committed');
 await db(store).table('projectSummaries').clear();expect((await store.listProjectSummaries())[0].contentState).toBe('error');expect(await db(store).table('projectSummaries').count()).toBe(0);
 fail=false;expect((await store.listProjectSummaries())[0]).toMatchObject({name:'Committed',contentState:'unloaded'});
});
it('cancels backfill without modifying canonical rows and captures list options',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Retained'),{reason:'seed'})).project;
 const before=await db(store).table('projects').get(saved.projectId);await db(store).table('projectSummaries').clear();
 const controller=new AbortController(),options={signal:controller.signal,onProgress:()=>controller.abort()};const pending=store.listProjectSummaries(options);options.signal=new AbortController().signal;
 await expect(pending).rejects.toMatchObject({code:'CANCELLED'});expect(await db(store).table('projectSummaries').count()).toBe(0);expect(await db(store).table('projects').get(saved.projectId)).toEqual(before);
 expect((await store.listProjectSummaries())[0].name).toBe('Retained');
});
it('rejects a revoked author read before returning or caching permitted content',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Private'),{reason:'seed'})).project;
 await db(store).table('syncBases').put({projectId:saved.projectId});store.setAuthorAccess({[saved.projectId]:'owner'});
 await expect(store.loadEditor(saved.projectId,{onStage:()=>store.setAuthorAccess({[saved.projectId]:'reviewer'})})).rejects.toMatchObject({code:'CANCELLED'});
 expect((store as unknown as {cachedProjects:Map<string,unknown>}).cachedProjects.has(saved.projectId)).toBe(false);
 await expect(store.loadEditor(saved.projectId)).rejects.toMatchObject({code:'CANCELLED'});expect(await store.listProjectSummaries()).toEqual([]);
});
it('rejects an old captured editor after a concurrent save and retains the newer cache',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Before'),{reason:'seed'})).project;store.releaseEditor(saved.projectId);
 const internals=store as unknown as {editorWorlds:(...args:unknown[])=>Promise<unknown>};const original=internals.editorWorlds.bind(store);
 let entered!:()=>void,resume!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>resume=resolve);
 vi.spyOn(internals,'editorWorlds').mockImplementationOnce(async(...args)=>{entered();await held;return original(...args);});
 const pending=store.loadEditor(saved.projectId);const rejected=expect(pending).rejects.toMatchObject({code:'REVISION_CONFLICT'});await ready;
 await store.saveProject({...saved,name:'Newer'},{reason:'concurrent'});resume();await rejected;
 expect((await store.loadEditor(saved.projectId))?.name).toBe('Newer');
});

for(const version of [1,7])it(`lazily backfills an actual version ${version} database without rewriting canonical rows`,async()=>{
 const name=`summary-old-${version}-${crypto.randomUUID()}`,old=new Dexie(name);
 const original={projects:'projectId,name',entities:'[projectId+id],projectId,[projectId+kind]',relations:'[projectId+id],projectId,[projectId+fromId],[projectId+toId]',blocks:'[projectId+id],projectId,[projectId+entityId]',snapshots:'[projectId+id],projectId',commands:'operationId,projectId,[projectId+revision]',outbox:'operationId,projectId,accountId',assets:'contentHash',views:'[projectId+id],projectId',viewStates:'key,projectId',syncMetadata:'projectId',acks:'operationId,projectId',restorePoints:'id,projectId,createdAt',worlds:'id',importLogs:'operationId,projectId'};
 old.version(1).stores(original);
 if(version===7){old.version(2).stores({importDrafts:'key'});old.version(3).stores({recoveredPending:'key,projectId'});old.version(4).stores({authorToolDrafts:'key,projectId'});old.version(5).stores({syncBases:'projectId',preparedSync:'operationId,projectId',syncConflicts:'operationId,projectId',syncAckEvidence:'operationId,projectId',retainedSyncRecovery:'key,projectId',syncAssetAcks:'key,projectId',sharedSnapshots:'id,createdAt'});old.version(6).stores({workspaceInputs:'key'});old.version(7).stores({recordParts:'key,scope'});}
 const {entities:_e,relations:_r,history:_h,snapshots:_s,views:_v,...p}=createProject(`Legacy ${version}`),header={...p,entityIds:[],relationIds:[],historyIds:[],snapshotIds:[],viewIds:[]};
 await old.table('projects').put(header);old.close();const store=new ScenarioStore({databaseName:name});stores.push(store);
 expect(await store.listProjectSummaries()).toMatchObject([{name:`Legacy ${version}`,entityCount:0,contentState:'unloaded'}]);
 expect(db(store).backendDB().version).toBe(80);expect(await db(store).table('projects').get(p.projectId)).toEqual(header);
 const probe=startProbe();await store.listProjectSummaries();const measured=probe.stop();expect(measured.counters['db.read.rows.entities']??0).toBe(0);
});
it('maintains summary derivation for new and clone imports and their cold editor images',async()=>{
 const input=createProject('Imported source');input.entities=[createEntity(input.projectId,'note','Imported note')];
 const prepared=await inspectScenario(await exportScenario(input),{worker:false});
 for(const mode of ['new','clone'] as const){const store=open(),result=await store.importScenario(prepared,{mode});store.close();await store.reopen();
 const probe=startProbe();const summaries=await store.listProjectSummaries();const measured=probe.stop();expect(summaries).toMatchObject([{projectId:result.project.projectId,name:result.project.name,revision:result.project.revision,entityCount:1,contentState:'unloaded'}]);expect(measured.counters['db.read.rows.entities']??0).toBe(0);
 expect((await store.loadEditor(result.project.projectId))?.entities).toEqual(result.project.entities);}
});
it('does not load an unrelated corrupt world when the selected project has no world dependencies',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Independent'),{reason:'seed'})).project;
 await db(store).table('worlds').put({id:crypto.randomUUID(),project:{snapshots:null}});store.releaseEditor(saved.projectId);
 const probe=startProbe();expect((await store.loadEditor(saved.projectId))?.name).toBe('Independent');const measured=probe.stop();expect(measured.counters['db.read.rows.worlds']??0).toBe(0);
});
it('falls back to the registry for a typed historical snapshot retained under a different world key',async()=>{
 const store=open(),world=createProject('World');world.entities=[createEntity(world.projectId,'place','Retained place')];
 const first=await createWorldSnapshot(world,'Historical');const citation=createEntity(world.projectId,'note','World historical citation');citation.data.body=[{id:crypto.randomUUID(),kind:'paragraph',text:'Place',links:[{start:0,end:5,target:{entityId:world.entities[0].id,sourceVersionId:first.snapshots[0].id}}]}];const second=await createWorldSnapshot({...first,entities:[...first.entities,citation]},'Current');
 await db(store).table('worlds').put({id:second.snapshots[1].id,project:second});
 const work=createProject('Cites historical world'),note=createEntity(work.projectId,'note','Citation');note.data.body=[{id:crypto.randomUUID(),kind:'paragraph',text:'Place',links:[{start:0,end:5,target:{entityId:world.entities[0].id,sourceVersionId:first.snapshots[0].id}}]}];work.entities=[note];work.worldReferences=[{projectId:world.projectId,immutableSnapshotId:second.snapshots[1].id,contentHash:second.snapshots[1].contentHash}];
 const {entities,relations,history,snapshots,views,...header}=work;
 await db(store).table('projects').put({...header,entityIds:entities.map(e=>e.id),relationIds:[],historyIds:[],snapshotIds:[],viewIds:[]});await db(store).table('entities').put({id:note.id,projectId:work.projectId,kind:note.kind,record:note});
 const baseline=await store.getProjectForEditing(work.projectId);store.releaseEditor(work.projectId);const loaded=await store.loadEditor(work.projectId);
 expect(loaded).toEqual(baseline);expect(Object.keys(await store.listEditorWorldSnapshots(loaded!))).toContain(second.snapshots[1].id);
});

it('rejects a save that races the final world publication fence',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Before worlds'),{reason:'seed'})).project;
 const internals=store as unknown as {editorWorlds:(...args:unknown[])=>Promise<unknown>};const original=internals.editorWorlds.bind(store);
 let entered!:()=>void,resume!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>resume=resolve);
 vi.spyOn(internals,'editorWorlds').mockImplementationOnce(async(...args)=>{entered();await held;return original(...args);});
 const pending=store.listEditorWorldSnapshots(saved);const rejected=expect(pending).rejects.toMatchObject({code:'REVISION_CONFLICT'});await ready;
 await store.saveProject({...saved,name:'Saved during world read'},{reason:'concurrent'});resume();await rejected;
});

it('recognizes current-project snapshot references without reading unrelated worlds',async()=>{
 const store=open(),work=createProject('Current edition'),target=createEntity(work.projectId,'character','Person'),note=createEntity(work.projectId,'note','Current citation');note.data.body=[{id:crypto.randomUUID(),kind:'paragraph',text:'Person',links:[{start:0,end:6,target:{entityId:target.id,sourceVersionId:work.projectId}}]}];work.entities=[target,note];
 const saved=(await store.saveProject(work,{reason:'seed'})).project;await db(store).table('worlds').put({id:crypto.randomUUID(),project:{snapshots:null}});store.releaseEditor(saved.projectId);
 const probe=startProbe();expect((await store.loadEditor(saved.projectId))?.entities).toEqual(saved.entities);const measured=probe.stop();expect(measured.counters['db.read.rows.worlds']??0).toBe(0);
});
it('binds a legacy packed-header summary to its native envelope without reading part bodies on steady list',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Packed header'),{reason:'seed'})).project,header=await db(store).table('projects').get(saved.projectId),packed=await packRecordData(header,'legacy-summary-header');
 await new Promise<void>((resolve,reject)=>{const tx=db(store).backendDB().transaction(['projects','projectSummaries','recordParts'],'readwrite');tx.objectStore('projectSummaries').clear();tx.objectStore('projects').put({projectId:saved.projectId,name:saved.name,__scenarioRecordParts:packed.packed});for(const part of packed.parts)tx.objectStore('recordParts').put(part);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});store.releaseEditor(saved.projectId);
 expect((await store.listProjectSummaries())[0]).toMatchObject({name:'Packed header',entityCount:0});
 const probe=startProbe();expect((await store.listProjectSummaries())[0].contentState).toBe('unloaded');const measured=probe.stop();expect(measured.counters['db.read.rows.recordParts']??0).toBe(0);expect(measured.counters['db.read.rows.projects']).toBe(1);
 await db(store).table('recordParts').delete(packed.parts[0].key);store.releaseEditor(saved.projectId);
 expect((await store.listProjectSummaries())[0].contentState).toBe('unloaded');await expect(store.loadEditor(saved.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});
it('never reports fully synced while asset acknowledgement detail is unloaded',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('Asset unknown'),{reason:'seed'})).project;
 await db(store).table('outbox').clear();await db(store).table('syncMetadata').put({projectId:saved.projectId,serverRevision:saved.revision,state:'synced'});
 expect((await store.listProjectSummaries())[0].saveState).toMatchObject({pendingCount:0,pendingAssetCount:'unloaded',syncState:'unloaded'});
});
it('offers registry-only world sources to unrelated works without reading their bodies in a steady catalog',async()=>{
 const store=open(),world=await createWorldSnapshot(createProject('Registry only'),'Pinned');
 const owner=createProject('A owns imported reference');owner.worldReferences=[{projectId:world.projectId,immutableSnapshotId:world.snapshots[0].id,contentHash:world.snapshots[0].contentHash}];
 await store.importScenario(await inspectScenario(await exportScenario(owner,{worlds:{[world.snapshots[0].id]:world}}),{worker:false}),{mode:'new'});
 await store.saveProject(createProject('Independent B'),{reason:'seed'});store.close();await store.reopen();
 const probe=startProbe();const choices=await store.listWorldSourceSummaries();const measured=probe.stop();
 expect(choices).toMatchObject([{projectId:world.projectId,name:'Registry only',registryOnly:true}]);expect(measured.counters['db.read.rows.worlds']??0).toBe(0);expect(measured.counters['db.read.rows.recordParts']??0).toBe(0);
 const loaded=await store.loadWorldSource(world.projectId);expect(loaded?.world.snapshots).toEqual(world.snapshots);
 expect(await db(store).table('projects').get(world.projectId)).toBeUndefined();
});

it('rebuilds catalog corruption atomically and surfaces native source corruption without rewriting worlds',async()=>{
 let fail=false;const store=new ScenarioStore({databaseName:`catalog-fault-${crypto.randomUUID()}`,faultInjector:()=>{if(fail)throw new DOMException('Quota','QuotaExceededError');}});stores.push(store);const world=await createWorldSnapshot(createProject('Catalog legacy'),'Pinned'),id=world.snapshots[0].id;await db(store).table('worlds').put({id,project:world});
 const canonical=await db(store).table('worlds').get(id);fail=true;
 expect((await store.listWorldSourceSummaries())[0].contentState).toBe('error');expect(await db(store).table('worldSources').count()).toBe(0);expect(await db(store).table('worlds').get(id)).toEqual(canonical);fail=false;
 expect((await store.listWorldSourceSummaries())[0].name).toBe(world.name);await db(store).table('worldSources').update(id,{name:'Tampered'});expect((await store.listWorldSourceSummaries())[0].name).toBe(world.name);
 const cancelled=new AbortController();cancelled.abort();await expect(store.loadWorldSource(world.projectId,{signal:cancelled.signal})).rejects.toMatchObject({code:'CANCELLED'});
 await db(store).table('worlds').put({id,project:{...world,schemaVersion:'999.0'}});await expect(store.loadWorldSource(world.projectId)).rejects.toBeDefined();expect((await db(store).table('worlds').get(id)).project.schemaVersion).toBe('999.0');
 await db(store).table('worldSources').clear();expect((await store.listWorldSourceSummaries())[0].contentState).toBe('error');await expect(store.loadWorldSource(world.projectId)).rejects.toMatchObject({code:'VALIDATION_FAILED'});expect((await db(store).table('worlds').get(id)).project.schemaVersion).toBe('999.0');
});
