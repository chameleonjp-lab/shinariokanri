import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createEntity,createProject,newId} from '../../src/domain/model';
import type {ProjectData} from '../../src/domain/types';

const stores:ScenarioStore[]=[];
const open=()=>{const value=new ScenarioStore({databaseName:`p205-owner-${newId()}`});stores.push(value);return value;};
type Internals={db:Dexie;cachedProjects:Map<string,ProjectData>;contentHeads:Map<string,string|undefined>;cachedHistoryIds:Map<string,string[]>;completeHistories:Set<string>;cacheEpochs:Map<string,unknown>};
const raw=(store:ScenarioStore)=>store as unknown as Internals;
const keys=(value:Map<string,unknown>|Set<string>)=>[...value.keys()].sort();
const barrier=()=>{let release!:()=>void;const ready=new Promise<void>(resolve=>release=resolve);return{ready,release};};
afterEach(async()=>{vi.restoreAllMocks();for(const value of stores.splice(0))await value.deleteDatabase();});

it('bounds inactive graphs together while retained dirty and clean history tokens remain saveable',async()=>{
 const store=open(),first=(await store.saveProject(createProject('retained editor'),{reason:'first'})).project;
 const clean=(await store.getProjectForEditing(first.projectId))!,dirty={...clean,name:'retained author input'};
 for(let index=0;index<12;index++)await store.saveProject(createProject(`other ${index}`),{reason:'other'});
 const state=raw(store);
 expect(state.cachedProjects.size).toBeLessThanOrEqual(4);
 expect(keys(state.contentHeads)).toEqual(keys(state.cachedProjects));expect(keys(state.cachedHistoryIds)).toEqual(keys(state.cachedProjects));
 expect(keys(state.completeHistories).every(id=>state.cachedProjects.has(id))).toBe(true);
 expect(state.cacheEpochs.size).toBeLessThanOrEqual(4);
 expect(store.getHistoryCount(clean)).toBe(1);expect(dirty.name).toBe('retained author input');
 const saved=await store.saveProject(dirty,{reason:'after pressure',includeHistory:false});
 expect(saved.project).toMatchObject({name:'retained author input',revision:'2'});expect(store.getHistoryCount(saved.project)).toBe(2);
 expect((await store.listOutbox(first.projectId)).map(row=>row.command.after.name)).toEqual(['retained editor','retained author input']);
});

for(const kind of ['editing','full'] as const)it(`saves the actual ${kind} hydrate result when release prevents cache publication`,async()=>{
 const store=open(),initial=await store.saveProject(createProject('native parent'),{reason:'first'});
 const draft=kind==='editing'?(await store.getProjectForEditing(initial.project.projectId))!:(await store.getProject(initial.project.projectId))!;
 store.releaseEditor(draft.projectId);
 const method=kind==='editing'?'getProjectForEditing':'getProject',original=store[method].bind(store);
 const spy=vi.spyOn(store,method).mockImplementationOnce(async(...args:Parameters<typeof original>)=>{const value=await original(args[0],args[1]);store.releaseEditor(draft.projectId);return value;});
 const result=await store.saveProject({...draft,name:`saved ${kind}`},{reason:'after hydrated release',includeHistory:false});spy.mockRestore();
 expect(result.project.revision).toBe('2');expect(store.getHistoryCount(result.project)).toBe(2);
 const command=await raw(store).db.table('commands').get(result.operationId);
 expect(command.delta.parentOperationId).toBe(initial.operationId);expect(command.delta.checkpoint).toBeUndefined();
 const full=(await store.getProject(draft.projectId))!;expect(full.history.map(row=>row.reason)).toEqual(['first','after hydrated release']);
 expect((await store.listOutbox(draft.projectId))).toHaveLength(2);expect(draft.name).toBe('native parent');
});

it('does not publish a committed late save after its editor was released',async()=>{
 const store=open(),initial=(await store.saveProject(createProject('before release'),{reason:'first'})).project;
 const input=(await store.getProjectForEditing(initial.projectId))!,state=raw(store),captured=barrier(),resume=barrier();
 const original=state.db.transaction.bind(state.db);
 vi.spyOn(state.db,'transaction').mockImplementation(((...args:unknown[])=>{
  const pending=(original as (...values:unknown[])=>Promise<unknown>)(...args);
  return pending.then(async value=>{if((value as {kind?:string})?.kind==='saved'){captured.release();await resume.ready;}return value;});
 }) as typeof state.db.transaction);
 const saving=store.saveProject({...input,name:'committed author input'},{reason:'second',includeHistory:false});
 await captured.ready;store.releaseEditor(input.projectId);resume.release();const result=await saving;
 expect(result.project.revision).toBe('2');
 for(const collection of [state.cachedProjects,state.contentHeads,state.cachedHistoryIds,state.completeHistories,state.cacheEpochs])expect(collection.size).toBe(0);
 expect((await state.db.table('projects').get(input.projectId)).name).toBe('committed author input');
 expect(await state.db.table('outbox').count()).toBe(2);
});

it('keeps the previous cache tuple when cancellation arrives after native save commit',async()=>{
 const store=open(),initial=await store.saveProject(createProject('before postcommit cancellation'),{reason:'first'});
 const input=(await store.getProjectForEditing(initial.project.projectId))!,state=raw(store),captured=barrier(),resume=barrier(),controller=new AbortController();
 const before={project:state.cachedProjects.get(input.projectId),head:state.contentHeads.get(input.projectId),history:state.cachedHistoryIds.get(input.projectId),complete:state.completeHistories.has(input.projectId)};
 const original=state.db.transaction.bind(state.db);
 vi.spyOn(state.db,'transaction').mockImplementation(((...args:unknown[])=>{
  const pending=(original as (...values:unknown[])=>Promise<unknown>)(...args);
  return pending.then(async value=>{if((value as {kind?:string})?.kind==='saved'){captured.release();await resume.ready;}return value;});
 }) as typeof state.db.transaction);
 const saving=store.saveProject({...input,name:'native committed before abort'},{reason:'second',includeHistory:false,signal:controller.signal});
 await captured.ready;controller.abort();resume.release();const result=await saving;
 // Native commit and the successful API result are already authoritative.
 expect(result.project.revision).toBe('2');expect((await state.db.table('projects').get(input.projectId)).name).toBe('native committed before abort');
 expect(await state.db.table('outbox').count()).toBe(2);expect(await state.db.table('commands').count()).toBe(2);
 expect(state.cachedProjects.get(input.projectId)).toBe(before.project);expect(state.contentHeads.get(input.projectId)).toBe(before.head);expect(state.cachedHistoryIds.get(input.projectId)).toBe(before.history);expect(state.completeHistories.has(input.projectId)).toBe(before.complete);
 expect(state.cachedProjects.get(input.projectId)?.revision).toBe('1');
});

it('releases epoch metadata for failed missing reads and repeated project lifetimes',async()=>{
 const store=open();for(let index=0;index<20;index++){const project=createProject(`lifetime ${index}`);project.entities.push(createEntity(project.projectId,'note','retained canonical'));await store.saveProject(project,{reason:'seed'});store.releaseEditor(project.projectId);expect(await store.getProject(newId())).toBeUndefined();}
 const state=raw(store);for(const collection of [state.cachedProjects,state.contentHeads,state.cachedHistoryIds,state.completeHistories,state.cacheEpochs])expect(collection.size).toBe(0);
 expect(await state.db.table('projects').count()).toBe(20);expect(await state.db.table('outbox').count()).toBe(20);
});

it('never reuses an evicted identity when an old full read resumes after release and reacquisition',async()=>{
 const store=open(),initial=(await store.saveProject(createProject('stable revision'),{reason:'seed'})).project;store.releaseEditor(initial.projectId);
 const state=store as unknown as Internals&{validationWorlds:(...args:unknown[])=>Promise<unknown>};
 const captured=barrier(),resume=barrier(),original=state.validationWorlds.bind(store);
 vi.spyOn(state,'validationWorlds').mockImplementationOnce(async(...args:unknown[])=>{const worlds=await original(...args);captured.release();await resume.ready;return worlds;});
 const reading=store.getProject(initial.projectId);await captured.ready;
 const oldIdentity=state.cacheEpochs.get(initial.projectId);store.releaseEditor(initial.projectId);
 const current=(await store.getProjectForEditing(initial.projectId))!;expect(state.cacheEpochs.get(initial.projectId)).not.toBe(oldIdentity);
 const remembered=state.cachedProjects.get(initial.projectId);resume.release();expect((await reading)?.revision).toBe('1');
 expect(state.cachedProjects.get(initial.projectId)).toBe(remembered);expect(store.getHistoryCount(current)).toBe(1);
 expect((await store.saveProject({...current,name:'after reacquisition'},{reason:'save'})).project.revision).toBe('2');
});
