import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {createProject,createEntity,newId} from '../domain/model';
import type {ContentState,ProjectData} from '../domain/types';
import {exportScenario,inspectScenario} from './archive';
import {ScenarioStore} from './store';
import {jsonBytes,sha256} from './json';

const stores:ScenarioStore[]=[];
const open=(databaseName=`shared-history-${newId()}`,faultInjector?:()=>void)=>{const store=new ScenarioStore({databaseName,faultInjector});stores.push(store);return store;};
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});

it('restores all shared editions beyond the engine string limit, rejects corruption, and cold reads an arbitrary old edition',async()=>{
 // NUL is valid manuscript Unicode and expands sixfold as canonical JSON.
 // Escaping reaches the real string limit with a smaller test work area.
 const project=createProject('共有履歴'),body='\0'.repeat(112_000),editions=51;
 project.entities=Array.from({length:8},(_,index)=>createEntity(project.projectId,'note',`旧版も保持${index}`,{body:[{id:newId(),kind:'paragraph' as const,text:body}]}));
 const {history:_history,...base}=project;
 const states:ContentState[]=Array.from({length:editions+1},(_,index)=>({...base,name:`共有履歴${index}`,revision:String(index)}));
 project.history=Array.from({length:editions},(_,index)=>({operationId:newId(),projectId:project.projectId,baseRevision:String(index),revision:String(index+1),targetIds:[project.projectId],createdAt:'2026-10-05T00:00:00Z',reason:'作品名を保存',before:states[index],after:states[index+1]}));
 Object.assign(project,{...states[editions],history:project.history});
 // The archive dictionary contains the shared bodies once; flattened history
 // would exceed the 512 MiB engine string limit while every field stays <1 MiB.
 expect((JSON.stringify(body).length-2)*8*editions*2).toBeGreaterThan(512*1024*1024);
 console.info('shared history regression: export');
 const bytes=await exportScenario(project,{worker:false});
 console.info('shared history regression: inspect');
 const prepared=await inspectScenario(bytes,{worker:false});
 expect(prepared.project.history).toHaveLength(editions);
 expect(prepared.manifest.requiredFeatures).toContain('shared-records-v1');
 const name=`shared-history-restore-${newId()}`;
 console.info('shared history regression: new restore');
 const target=open(name),saved=(await target.importScenario(prepared,{mode:'new'})).project;
 expect(saved.history).toHaveLength(editions);
 expect(saved.entities).toEqual(project.entities);
 expect(saved.revision).toBe(String(editions));
 console.info('shared history regression: cold and arbitrary old edition');
 target.close();const cold=open(name),current=(await cold.getProjectForEditing(project.projectId))!;
 const currentImage=({history:_history,...image}:ProjectData)=>image;
 expect(await sha256(jsonBytes(currentImage(current)))).toBe(await sha256(jsonBytes(currentImage(project))));
 expect(await cold.historyPage(project.projectId,{size:1})).toMatchObject({total:editions});
 const selected=await cold.historyCommand(project.projectId,project.history[7].operationId);
 expect(selected).toEqual(project.history[7]);
 console.info('shared history regression: corruption refused');
 const corrupt=structuredClone(prepared);corrupt.project.entities[0].name='\ud800';
 const empty=open();await expect(empty.importScenario(corrupt,{mode:'new'})).rejects.toMatchObject({code:'VALIDATION_FAILED'});
 expect(await empty.listProjects()).toEqual([]);
},180_000);
