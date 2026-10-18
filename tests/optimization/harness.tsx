import React from 'react';
import {createRoot} from 'react-dom/client';
import type Dexie from 'dexie';
import App from '../../src/App';
import {ScenarioStoreProvider} from '../../src/ui/StoreContext';
import {ScenarioStore, type SaveMetrics, type AssetInput} from '../../src/storage/store';
import {startProbe,probeDuration} from '../../src/observability/probe';
import {createMaterialPerformanceFixture,createPerformanceFixture} from '../../src/testing/performanceFixture';
import {filterCatalogEntities} from '../../src/domain/catalog';
import {referenceChoices} from '../../src/domain/referenceChoices';
import {jsonBytes,sha256} from '../../src/storage/json';
import {GROWTH_MANIFEST,growthProject,historySeries} from './fixtures';
import '../../src/styles.css';

declare global { interface Window { phase1: typeof api } }
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const require=(condition:unknown)=>{if(!condition)throw new Error('Independent phase1 expectation failed');};
const store=(name:string,onSaveMetrics?:(metrics:SaveMetrics)=>void)=>new ScenarioStore({databaseName:name,onSaveMetrics});
async function observe<T>(task:()=>Promise<T>|T){
  const probe=startProbe(),started=performance.now();
  try {const result=await task(),milliseconds=performance.now()-started;await probe.settle();return {result,milliseconds,probe:probe.stop()};}
  finally {probe.stop();}
}
const heap=()=>{const memory=(performance as unknown as {memory?:{usedJSHeapSize:number;totalJSHeapSize:number;jsHeapSizeLimit:number}}).memory;return memory?{used:memory.usedJSHeapSize,total:memory.totalJSHeapSize,limit:memory.jsHeapSizeLimit}:null;};

async function growth(){
  const projects=[],history=[];
  for(const count of [1,10,50]){
    const name=`phase1-growth-${count}`,seed=store(name),hashes=[];
    try{
      for(let i=0;i<count;i++){const input=growthProject(i);hashes.push(await sha256(jsonBytes(input)));await seed.saveProject(input,{reason:'計測用初期化',includeHistory:false,immutableView:true});}
      seed.close();const reader=store(name);
      try{
        const read=await observe(async()=>{const values=await reader.listProjectsForEditing({immutableView:true});require(values.length===count);return {count:values.length,records:values.reduce((sum,p)=>sum+p.entities.length+p.relations.length,0)};});
        require(read.result.records===count*10);
        const closed=await observe(()=>{reader.close();return heap();});
        projects.push({count,fixtureHashes:hashes,read,closed});
      }finally{reader.close();}
    }finally{await seed.deleteDatabase();}
  }
  for(const count of [100,1000,10000] as const){
    const name=`phase1-history-${count}`,reader=store(name),series=historySeries(count);
    try{
      await raw(reader).transaction('rw','projects','commands',async()=>{await raw(reader).table('projects').put(series.header);await raw(reader).table('commands').bulkPut(series.rows);});
      const pages=[];
      for(const page of [0,Math.floor(count/60),Math.floor((count-1)/30)]){
        const measured=await observe(async()=>{const value=await reader.historyPage(series.header.projectId,{page});require(value.total===count&&value.entries[0].revision===String(count-page*30));return {page:value.page,total:value.total,displayed:value.entries.length,firstRevision:value.entries[0].revision,lastRevision:value.entries.at(-1)!.revision};});
        require(measured.probe.counters['db.read.rows.commands']===count);pages.push(measured);
      }
      history.push({count,fixtureSHA256:await sha256(jsonBytes(series)),pages});
    }finally{await reader.deleteDatabase();}
  }
  return {manifest:GROWTH_MANIFEST,projects,history};
}

type ProfileMode='disabled-baseline'|'product-default';
async function profile(size:'standard'|'large',profileMode:ProfileMode='disabled-baseline'){
  if(profileMode!=='disabled-baseline'&&profileMode!=='product-default')throw new Error('Unknown derived-index profile mode');
  // Preserve the historical two-real-build observation in its explicit baseline lane.
  // Growth, calibration and App/UI continue to use the normal factory above.
  const profileStore=(name:string,onSaveMetrics?:(metrics:SaveMetrics)=>void)=>profileMode==='disabled-baseline'
    ?new ScenarioStore({databaseName:name,onSaveMetrics,derivedIndexes:false})
    :store(name,onSaveMetrics);
  const fixture=size==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
  const name=`phase1-profile-${size}`,seed=profileStore(name),metrics:Array<Omit<SaveMetrics,'projectId'|'operationId'>>=[];
  const metadata={seed:fixture.seed,size,counts:fixture.counts,assetBytes:fixture.assetBytes,sha256:fixture.sha256};
  try{
    await seed.saveProject(fixture.project,{reason:'元fixtureの初期化',includeHistory:false,immutableView:true,assets:'assets'in fixture?fixture.assets as AssetInput[]:[]});
    seed.close();const reader=profileStore(name,({operationId:_id,projectId:_pid,...row})=>metrics.push(row));
    try{
      const beforeHeap=heap();let current:Awaited<ReturnType<ScenarioStore['getProjectForEditing']>>;
      const cold=await observe(async()=>{current=await reader.getProjectForEditing(fixture.project.projectId,{immutableView:true});require(current);return {records:current!.entities.length+current!.relations.length,history:reader.getHistoryCount(current!)};});
      const operations=[];
      for(const operation of ['rename-one','dialogue-one'] as const){
        const measured=await observe(async()=>{
          const before=current!,changed=before.entities.find(entity=>entity.kind===(operation==='rename-one'?'character':'dialogue_line'))!;
          const entities=before.entities.map(entity=>entity!==changed?entity:entity.kind==='dialogue_line'?{...entity,data:{...entity.data,text:entity.data.text.map((block,i)=>i?block:{...block,text:'計測した一件の台詞'})}}:{...entity,name:'計測した一件の改名'});
          current=(await reader.saveProject({...before,entities},{reason:operation,includeHistory:false,immutableView:true})).project;
          require(current!.entities.length===before.entities.length&&reader.getHistoryCount(current!)===reader.getHistoryCount(before)+1);
          require(current!.entities.find(e=>e.id===changed.id)!.id===changed.id);
          return {changedEntities:current!.entities.filter((e,i)=>e!==before.entities[i]).length,records:current!.entities.length+current!.relations.length};
        });require((measured.probe.counters['db.write.committed.entities']??0)===1);require((measured.probe.counters['db.write.committed.commands']??0)===1);require((measured.probe.counters['db.write.committed.outbox']??0)===1);operations.push({operation,...measured,metrics:metrics.at(-1)});
      }
      const search=await observe(()=>{
        const character=current!.entities.find(e=>e.kind==='character')!;
        const query={op:'participant' as const,characterId:character.id};
        const results=[filterCatalogEntities(current!,query),filterCatalogEntities(current!,query)];
        require(results[0].length===results[1].length&&results[0].every((e,i)=>e.id===results[1][i].id));
        return {counts:results.map(result=>result.length)};
      });
      if(profileMode==='disabled-baseline'){
        require(search.probe.counters['query.index.builds']===2);
      }else{
        require(search.probe.counters['query.index.builds']===1);
        require(search.probe.counters['derived.hit']===1);
      }
      const nonemptySearch=profileMode==='product-default'?await (async()=>{
        const character=current!.entities.filter(e=>e.kind==='character')[1]!;
        const events=new Set(current!.entities.filter(e=>!e.deletedAt&&e.kind==='event'&&e.data.participants?.some(p=>p.characterId===character.id)).map(e=>e.id));
        // Independent fixture oracle: direct model traversal, not the catalog index/query API.
        const expectedIds=current!.entities.filter(e=>!e.deletedAt&&(e.kind==='event'?events.has(e.id):e.kind==='scene'&&e.data.eventIds.some(id=>events.has(id)))).map(e=>e.id);
        require(expectedIds.length===15);
        const measured=await observe(()=>{
          const query={op:'participant' as const,characterId:character.id};
          return [filterCatalogEntities(current!,query).map(e=>e.id),filterCatalogEntities(current!,query).map(e=>e.id)];
        });
        require(measured.result.every(ids=>ids.length===expectedIds.length&&ids.every((id,i)=>id===expectedIds[i])));
        require((measured.probe.counters['query.index.builds']??0)===0);
        require(measured.probe.counters['derived.hit']===2);
        // Hashing and oracle assertions are outside the separately reported query clock.
        return {...measured,result:{counts:measured.result.map(ids=>ids.length)},expected:{count:expectedIds.length,sha256:await sha256(jsonBytes(expectedIds))},actualSHA256:await Promise.all(measured.result.map(ids=>sha256(jsonBytes(ids))))};
      })():undefined;
      const calendar=await observe(()=>({count:referenceChoices(current!,'calendar').length}));
      const afterHeap=heap(),closed=await observe(()=>{reader.close();return heap();});
      return {profileMode,scope:profileMode==='disabled-baseline'?'Historical no-sharing baseline: two actual index builds; not product-default performance.':'Normal product-default derived sharing; separate from the historical baseline.',fixture:metadata,beforeHeap,cold,operations,search,nonemptySearch,calendar,afterHeap,closed,derivedAfterClose:reader.derivedIndexRetention()};
    }finally{reader.close();}
  }finally{await seed.deleteDatabase();}
}

async function calibration(){
  const samples=[];
  // AB/BA ordering on fresh equal synthetic inputs; timing is supplementary.
  for(let i=0;i<10;i++)for(const enabled of i%2?[true,false]:[false,true]){
    const value=store(`phase1-calibration-${i}-${enabled}`),input=growthProject();
    try{
      const first=(await value.saveProject(input,{reason:'初期化',includeHistory:false,immutableView:true})).project;
      const run=()=>value.saveProject({...first,name:'同じ変更'},{reason:'同じ変更',includeHistory:false,immutableView:true});
      const start=performance.now();
      if(enabled){const result=await observe(run);samples.push({iteration:i,enabled,milliseconds:performance.now()-start,probe:result.probe});}
      else{await run();samples.push({iteration:i,enabled,milliseconds:performance.now()-start});}
    }finally{await value.deleteDatabase();}
  }
  return {scope:'Synthetic small fixture AB/BA calibration. Not a formal30 metric or Large overhead bound.',samples};
}

let uiStore:ScenarioStore|undefined,uiProbe:ReturnType<typeof startProbe>|undefined,uiStart=0;
const api={growth,profile,calibration,
  async mount(){
    const name='phase1-ui',seed=store(name);const initial=(await seed.saveProject(growthProject(),{reason:'UI用初期化',includeHistory:false,immutableView:true})).project;seed.close();
    uiStore=store(name);uiProbe=startProbe();uiStart=performance.now();
    localStorage.setItem('scenario-last-project:guest',initial.projectId);
    createRoot(document.getElementById('root')!).render(<ScenarioStoreProvider store={uiStore}><App/></ScenarioStoreProvider>);
  },
  async uiReady(){const milliseconds=performance.now()-uiStart;probeDuration('ui.startup',milliseconds);await uiProbe!.settle();return {milliseconds,probe:uiProbe!.stop()};},
  beginSave(){uiProbe=startProbe();uiStart=performance.now();},
  async saveVisible(){const milliseconds=performance.now()-uiStart;probeDuration('ui.save',milliseconds);await uiProbe!.settle();return {milliseconds,probe:uiProbe!.stop()};},
  async cleanup(){uiProbe?.stop();await uiStore?.deleteDatabase();},
};
window.phase1=api;
