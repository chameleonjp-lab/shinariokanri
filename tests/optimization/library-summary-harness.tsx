import React from 'react';
import {createRoot,type Root} from 'react-dom/client';
import type Dexie from 'dexie';
import App from '../../src/App';
import BaselineApp from './libraryBaselineApp';
import {ScenarioStoreProvider} from '../../src/ui/StoreContext';
import {ScenarioStore,type AssetInput} from '../../src/storage/store';
import {nativeProjectHeader} from '../../src/storage/projectSummary';
import type {ProjectData} from '../../src/domain/types';
import {startProbe} from '../../src/observability/probe';
import {createMaterialPerformanceFixture,createPerformanceFixture} from '../../src/testing/performanceFixture';
import {jsonBytes,sha256} from '../../src/storage/json';
import {growthProject,GROWTH_MANIFEST} from './fixtures';
import '../../src/styles.css';
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const assert=(value:unknown)=>{if(!value)throw new Error('Independent P2-01 measurement expectation failed');};
const open=(name:string)=>new ScenarioStore({databaseName:name});
function retained(store:ScenarioStore){const values=[...(store as unknown as {cachedProjects:Map<string,ProjectData>}).cachedProjects.values()];return {projects:values.length,records:values.reduce((sum,p)=>sum+p.entities.length+p.relations.length,0),canonicalBytes:values.reduce((sum,p)=>sum+jsonBytes(p).length,0)};}
async function measured(name:string,enabled:boolean,operation:(store:ScenarioStore)=>Promise<unknown>){
 const store=open(name);await store.reopen();const probe=enabled?startProbe():undefined,started=performance.now();
 try{const result=await operation(store),milliseconds=performance.now()-started;await probe?.settle();return {milliseconds,probe:probe?.stop(),result,retained:retained(store)};}
 finally{probe?.stop();store.close();}
}
let uiRoot:Root|undefined,uiStore:ScenarioStore|undefined,uiProbe:ReturnType<typeof startProbe>|undefined,uiStarted=0;
const api={
 async compare(size:'growth'|'standard'|'large',count=1){
  const fixture=size==='growth'?undefined:size==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
  const inputs=fixture?[fixture.project]:Array.from({length:count},(_,i)=>growthProject(i));
  const name=`p2-01-${size}-${count}`,seed=open(name),fixtureHashes=await Promise.all(inputs.map(p=>sha256(jsonBytes(p))));
  try{
   for(const input of inputs)await seed.saveProject(input,{reason:'元fixtureの初期化',includeHistory:false,immutableView:true,assets:fixture&&'assets'in fixture?fixture.assets as AssetInput[]:[]});
   const selected=inputs[0].projectId,expected=inputs.map(p=>({projectId:p.projectId,name:p.name,revision:'1',entityCount:p.entities.filter(e=>!e.deletedAt).length})).sort((a,b)=>a.projectId.localeCompare(b.projectId));
   const header=await raw(seed).transaction('r','projects',()=>nativeProjectHeader(selected));
   const nativeHeader={packed:!!header?.__scenarioRecordParts,canonicalBytes:jsonBytes(header).length};
   const summary=await raw(seed).table('projectSummaries').get(selected),summaryBytes=jsonBytes(summary).length;
   const decodedHeaderBytes=jsonBytes(await raw(seed).table('projects').get(selected)).length;seed.close();
   const operations={baseline:async(store:ScenarioStore)=>{const projects=await store.listProjectsForEditing({immutableView:true});assert(JSON.stringify(projects.map(p=>({projectId:p.projectId,name:p.name,revision:p.revision,entityCount:p.entities.filter(e=>!e.deletedAt).length})))===JSON.stringify(expected));return {projects:projects.length,records:projects.reduce((sum,p)=>sum+p.entities.length+p.relations.length,0)};},summaries:async(store:ScenarioStore)=>{const rows=await store.listProjectSummaries();assert(JSON.stringify(rows.map(({projectId,name,revision,entityCount})=>({projectId,name,revision,entityCount})))===JSON.stringify(expected));return {projects:rows.length,canonicalBytes:jsonBytes(rows).length};},selected:async(store:ScenarioStore)=>{const p=await store.loadEditor(selected,{immutableView:true,expectedRevision:'1'});assert(p?.entities.length===inputs[0].entities.length);return {projects:1,records:p!.entities.length+p!.relations.length};}};
   const off:Record<string,unknown>={},on:Record<string,unknown>={};for(const [key,operation]of Object.entries(operations))off[key]=await measured(name,false,operation);for(const [key,operation]of Object.entries(operations))on[key]=await measured(name,true,operation);
   await seed.reopen();await raw(seed).table('projectSummaries').clear();seed.close();const legacyBackfillOn=await measured(name,true,operations.summaries);
   return {size,count,fixture:{seed:fixture?.seed??GROWTH_MANIFEST.seed,hashes:fixtureHashes,counts:fixture?.counts??{projects:count,records:count*10},assetBytes:fixture?.assetBytes??0},nativeHeader,decodedHeaderBytes,summaryBytes,off,on,legacyBackfillOn};
  }finally{await seed.deleteDatabase();}
 },
 async mount(variant:'baseline'|'candidate',count:number,enabled:boolean){
  const name=`p2-01-ui-${variant}-${count}-${enabled}`,seed=open(name);let selected='';
  for(let i=0;i<count;i++){const saved=await seed.saveProject(growthProject(i),{reason:'UI用初期化',includeHistory:false,immutableView:true});if(!i)selected=saved.project.projectId;}seed.close();
  localStorage.removeItem('scenario-workspace-guest');localStorage.setItem('scenario-last-project:guest',selected);
  uiStore=open(name);uiProbe=enabled?startProbe():undefined;uiStarted=performance.now();uiRoot=createRoot(document.getElementById('root')!);uiRoot.render(<ScenarioStoreProvider store={uiStore}>{variant==='baseline'?<BaselineApp/>:<App/>}</ScenarioStoreProvider>);
 },
 async inputReady(){const milliseconds=performance.now()-uiStarted;await uiProbe?.settle();return {milliseconds,probe:uiProbe?.stop(),retained:retained(uiStore!)};},
 async cleanup(){uiRoot?.unmount();uiProbe?.stop();await uiStore?.deleteDatabase();uiRoot=undefined;uiStore=undefined;},
};
declare global{interface Window{libraryMeasurement:typeof api}}
window.libraryMeasurement=api;
