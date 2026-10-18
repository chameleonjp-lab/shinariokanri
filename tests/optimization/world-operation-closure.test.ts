import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createEntity,createProject,newId,textToRichText,validateProject} from '../../src/domain/model';
import {createWorldSnapshot,previewWorldVersion} from '../../src/domain/world';
import {exportScenario,inspectScenario,verifySnapshotHashes,worldSnapshotContents} from '../../src/storage/archive';
import {validateColdRead} from '../../src/storage/readValidation';
import type {ProjectData} from '../../src/domain/types';

const stores:ScenarioStore[]=[];
const open=()=>{const value=new ScenarioStore({databaseName:`p205-closure-${newId()}`});stores.push(value);return value;};
const db=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const registry=async(store:ScenarioStore):Promise<Record<string,ProjectData>>=>Object.fromEntries((await db(store).table('worlds').toArray()).map(row=>[row.id,row.project]));
afterEach(async()=>{vi.restoreAllMocks();for(const store of stores.splice(0))await store.deleteDatabase();});

async function pin(store:ScenarioStore,label:string){
 const source=createProject(label);source.entities.push(createEntity(source.projectId,'character',`${label} character`));
 const world=await createWorldSnapshot(source,`${label} immutable`),snapshot=world.snapshots[0];
 const work=(await store.saveProject(createProject(`${label} work`),{reason:'initial'})).project;
 const next=(await previewWorldVersion(work,world,snapshot.id)).candidate;
 const saved=(await store.saveProject(next,{reason:'pin',worldPin:{world,snapshotId:snapshot.id}})).project;
 return{world,snapshot,saved};
}

it('uses known current/save/full-history dependencies and matches an independent full-registry validation',async()=>{
 const store=open(),selected=await pin(store,'selected'),other=await pin(store,'unrelated');
 const all=await registry(store);expect(Object.keys(all).sort()).toEqual([selected.snapshot.id,other.snapshot.id].sort());
 const full=(await store.getProject(selected.saved.projectId))!;
 // The oracle receives every immutable row, never the selected implementation's registry.
 expect(validateProject(full,{worldSnapshots:worldSnapshotContents(all)}).ok).toBe(true);await verifySnapshotHashes([full,...Object.values(all)]);
 await validateColdRead({...full,history:[]},all);
 const scanning=vi.spyOn((db(store) as Dexie&{worlds:Dexie['tables'][number]}).worlds,'toArray');
 store.releaseEditor(full.projectId);const current=(await store.getProjectForEditing(full.projectId))!;
 expect(current.worldReferences).toEqual([{projectId:selected.world.projectId,immutableSnapshotId:selected.snapshot.id,contentHash:selected.snapshot.contentHash}]);
 expect(current.entities).toEqual(full.entities);expect(scanning).not.toHaveBeenCalled();
 store.releaseEditor(full.projectId);expect(await store.getProject(full.projectId)).toEqual(full);expect(scanning).not.toHaveBeenCalled();
 const saved=await store.saveProject({...current,name:'only selected dependencies'},{reason:'rename',includeHistory:false});
 expect(saved.project.revision).toBe('3');expect(scanning).not.toHaveBeenCalled();
 expect(await db(store).table('worlds').count()).toBe(2);
});

it('keeps healthy no-reference reads and saves isolated from unrelated corrupt immutable bodies',async()=>{
 const store=open(),saved=(await store.saveProject(createProject('healthy'),{reason:'seed'})).project;
 const corruptId=newId(),corrupt={id:corruptId,project:{schemaVersion:'999.0',projectId:newId(),snapshots:[]}};
 await db(store).table('worlds').put(corrupt);store.releaseEditor(saved.projectId);
 expect((await store.getProjectForEditing(saved.projectId))?.name).toBe('healthy');
 const result=await store.saveProject({...saved,name:'healthy changed'},{reason:'healthy edit'});
 expect(result.project.revision).toBe('2');expect(await db(store).table('worlds').get(corruptId)).toEqual(corrupt);
});

it('discovers the actual outer owner of a historical typed snapshot and retains the complete row through export/new/clone/cold',async()=>{
 const sourceStore=open(),source=createProject('retained editions'),character=createEntity(source.projectId,'character','old immutable person');source.entities.push(character);
 const first=await createWorldSnapshot(source,'old edition'),old=first.snapshots[0];
 const body=textToRichText('old quoted body');body[0].links=[{start:0,end:3,target:{entityId:character.id,sourceVersionId:old.id}}];
 first.entities.push(createEntity(source.projectId,'note','new edition quotes old',{body}));
 const newer=await createWorldSnapshot(first,'new edition'),current=newer.snapshots[1];
 const holder=(await sourceStore.saveProject(createProject('registry holder'),{reason:'holder'})).project;
 await sourceStore.saveProject((await previewWorldVersion(holder,newer,current.id)).candidate,{reason:'retain whole immutable row',worldPin:{world:newer,snapshotId:current.id}});
 const all=await registry(sourceStore),originalRow=all[current.id];
 expect(Object.keys(all)).toEqual([current.id]);expect(all[old.id]).toBeUndefined();expect(originalRow.snapshots.map(row=>row.id)).toEqual([current.id,old.id]);
 const workBody=structuredClone(body);workBody[0].id=newId();
 const work=createProject('typed retained edition');work.entities.push(createEntity(work.projectId,'note','literal old quote',{body:workBody}));
 work.worldReferences=[{projectId:source.projectId,immutableSnapshotId:current.id,contentHash:current.contentHash}];
 expect(validateProject(work,{worldSnapshots:worldSnapshotContents(all)}).ok).toBe(true);
 const saved=(await sourceStore.saveProject(work,{reason:'typed old edition only'})).project;
 const fullOracle=await inspectScenario(await exportScenario(saved,{worlds:all}),{worker:false});
 expect(fullOracle.project.entities[0].data).toEqual({body:workBody,attachmentIds:[],convertedToIds:[],originNoteId:null});expect(fullOracle.worlds[current.id]).toEqual(originalRow);
 await pin(sourceStore,'unrelated retained owner');
 sourceStore.releaseEditor(work.projectId);const editing=(await sourceStore.loadEditor(work.projectId))!;expect(editing.entities).toEqual(saved.entities);
 expect(Object.keys(await sourceStore.listEditorWorldSnapshots(editing))).toEqual([current.id]);
 const archive=await inspectScenario(await sourceStore.exportProject(work.projectId,{worker:false}),{worker:false});
 expect(archive.project).toEqual(saved);expect(Object.keys(archive.worlds)).toEqual([current.id]);expect(archive.worlds[current.id]).toEqual(originalRow);
 expect(archive.worlds[current.id].snapshots.find(row=>row.id===old.id)).toEqual(old);
 expect(archive.recovery?.pending).toHaveLength(1);
 const restored=open();await restored.importScenario(archive,{mode:'new'});restored.close();await restored.reopen();
 expect((await restored.getProject(work.projectId))?.entities).toEqual(saved.entities);
 const clone=(await restored.importScenario(archive,{mode:'clone'})).project;
 expect(clone.projectId).not.toBe(work.projectId);expect(clone.entities[0].kind).toBe('note');
 expect((await registry(sourceStore))[current.id]).toEqual(originalRow);
});

it('retains history-only pins in full export while current closure needs no world',async()=>{
 const store=open(),selected=await pin(store,'historical');
 const removed=(await store.saveProject({...selected.saved,worldReferences:[]},{reason:'remove current pin'})).project;
 store.releaseEditor(removed.projectId);const current=(await store.loadEditor(removed.projectId))!;
 expect(await store.listEditorWorldSnapshots(current)).toEqual({});
 const archive=await inspectScenario(await store.exportProject(removed.projectId,{worker:false}),{worker:false});
 expect(archive.project.worldReferences).toEqual([]);expect(archive.project.history).toHaveLength(3);
 expect(Object.keys(archive.worlds)).toEqual([selected.snapshot.id]);
 expect(archive.project.history[1].after.worldReferences[0].contentHash).toBe(selected.snapshot.contentHash);
 const command=await store.historyCommand(removed.projectId,removed.history[1].operationId);expect(command.after.worldReferences[0].immutableSnapshotId).toBe(selected.snapshot.id);
});
