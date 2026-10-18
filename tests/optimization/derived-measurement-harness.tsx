import React from 'react';
import {createRoot,type Root} from 'react-dom/client';
import App from '../../src/App';
import {ScenarioStoreProvider} from '../../src/ui/StoreContext';
import {ScenarioStore,type AssetInput} from '../../src/storage/store';
import {createPerformanceFixture,createMaterialPerformanceFixture} from '../../src/testing/performanceFixture';
import {studyFixtureIdentity} from '../../scripts/optimization/fixtureIdentity';
import {jsonBytes,sha256} from '../../src/storage/json';
import {filterCatalogEntities} from '../../src/domain/catalog';
import {startProbe} from '../../src/observability/probe';
import {createHistoryObserver} from './history-measurement-core';
import {restoreWorkspacePreferences,saveWorkspaceViewState} from '../../src/ui/viewPreferences';
import type {ProjectData,Query} from '../../src/domain/types';
import '../../src/styles.css';

// This additive harness mounts the unchanged actual App. No Auth/transport or
// mocked IDB. All oracle/digest/checkpoint work is outside latency intervals.
type Row=Record<string,any>;
type Options={suite:'standard'|'large';runId:string;enabled:boolean;textCodeUnits?:number};
let result:Row,store:ScenarioStore|undefined,root:Root|undefined,projectId='',databaseName='';
let pending:{label:string;expectation:Row;resolve:()=>void;reject:(e:unknown)=>void;promise:Promise<void>;started?:number;probe?:ReturnType<typeof startProbe>}|undefined;
let expectedIds:Record<string,string[]>,participantId='',participantIds:string[];
const userId='a2060000-0000-4000-8000-000000000777';
const require=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const digest=(value:unknown)=>sha256(new TextEncoder().encode(JSON.stringify(value)));
const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const send=()=>window.derivedCheckpoint?.(structuredClone(result))??Promise.resolve();
const retention=()=>{const value=store as unknown as {derivedIndexRetention?:()=>unknown};return value?.derivedIndexRetention?.()??null;};
const observe=()=>createHistoryObserver({mode:'capture',historyCountersSupported:true},result,send);
function makeStore(options:Options){
  // Old source ignores this new optional setting. Literal default cohorts never
  // pass it; a budget experiment is explicitly identified in the raw evidence.
  return new ScenarioStore({databaseName,...(options.textCodeUnits===undefined?{}:{derivedIndexes:{textCodeUnits:options.textCodeUnits}})} as ConstructorParameters<typeof ScenarioStore>[0]);
}
async function canonicalSource(store:ScenarioStore){const value=await store.loadEditor(projectId,{immutableView:true});require(value,'missing editor');const {history:_history,...current}=value!;return{current:await sha256(jsonBytes(current)),revision:value!.revision};}
async function start(options:Options){
  result={version:1,options,status:'running',operations:[],actions:[],scope:'Supplemental actual-App/native-IDB observations; not formal phase3 acceptance',inputUnchanged:null};
  await send();
  let fixture=options.suite==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
  const assets:AssetInput[]='assets'in fixture?fixture.assets as AssetInput[]:[],identity=await studyFixtureIdentity(fixture);
  result.fixture={seed:fixture.seed,counts:fixture.counts,assetBytes:fixture.assetBytes,...identity,assets:await Promise.all(assets.map(async a=>({bytes:a.bytes.byteLength,sha256:await sha256(a.bytes)})))};
  // Independent original-fixture oracle: explicit authored kinds/names and
  // participant declarations. It never calls the production collector/index.
  const textKinds=new Set(['character','event','scene','dialogue_line','foreshadow']);
  expectedIds={};result.expected={};
  for(const text of ['霧','霧の','門番','記録','']){
    const rows=fixture.project.entities.filter(e=>text===''||text==='門番'?text===''||e.kind==='character'&&e.name.startsWith('門番'):textKinds.has(e.kind));
    expectedIds[text]=rows.map(e=>e.id);result.expected[text]={count:rows.length,sha256:await digest(expectedIds[text]),firstNames:rows.slice(0,3).map(e=>e.name)};
  }
  participantId=fixture.project.entities.filter(e=>e.kind==='character')[1].id;
  const events=fixture.project.entities.filter(e=>e.kind==='event'&&e.data.participants?.some(p=>p.characterId===participantId)),eventIds=new Set(events.map(e=>e.id));
  participantIds=fixture.project.entities.filter(e=>eventIds.has(e.id)||e.kind==='scene'&&e.data.eventIds.some(id=>eventIds.has(id))).map(e=>e.id);
  result.expectedParticipant={count:participantIds.length,sha256:await digest(participantIds)};
  const last=fixture.project.entities.filter(e=>e.kind==='dialogue_line').at(-1)!;
  result.selection={id:last.id,name:last.name,index:fixture.project.entities.findIndex(e=>e.id===last.id),total:fixture.project.entities.length};
  projectId=fixture.project.projectId;databaseName=`p206-measure-${options.runId}-${options.enabled?'on':'off'}`;
  const seed=makeStore(options),NativeDate=Date;
  try{
    // Only the untimed seed's generated ISO timestamps are fixed. Date.now and
    // all measurement clocks stay native. Restore before any measured API.
    globalThis.Date=new Proxy(NativeDate,{construct(target,args,newTarget){return Reflect.construct(target,args.length?args:['2026-10-05T00:00:00.000Z'],newTarget);}});
    await seed.saveProject(fixture.project,{reason:'P206 unchanged original fixture seed',includeHistory:false,operationId:'a2060000-0000-4000-8000-000000000001',assets});
  }finally{globalThis.Date=NativeDate;}
  result.nativeAssets=[];
  for(const asset of assets){const actual=await seed.getAsset(asset.contentHash);require(actual&&actual.byteLength===asset.bytes.byteLength&&await sha256(actual)===asset.contentHash,'native material bytes differ');result.nativeAssets.push({bytes:actual!.byteLength,sha256:asset.contentHash});}
  localStorage.setItem('scenario-local-view-user',userId);
  await seed.saveViewState(projectId,saveWorkspaceViewState({userId,deviceClass:'desktop',preferences:{...restoreWorkspacePreferences(),page:'search'},lastOpenedId:null}));
  result.savedSource=await canonicalSource(seed);seed.close();
  // Release fixture and material arrays before timing/heap observations.
  fixture=null as unknown as typeof fixture;
  await send();return{expected:result.expected,selection:result.selection,savedSource:result.savedSource};
}
async function coreRead(options:Options){
  for(const label of ['listProjectSummaries','loadEditor','historyPage']){
    const fresh=makeStore(options);
    try{const value=await observe()<unknown>(label,options.enabled,()=>label==='listProjectSummaries'?fresh.listProjectSummaries():label==='historyPage'?fresh.historyPage(projectId,{page:0,size:30}):fresh.loadEditor(projectId,{immutableView:true}));require(value,'public read returned no result');}
    finally{fresh.close();}
  }
}
async function mount(options:Options){
  store=makeStore(options);localStorage.setItem('scenario-last-project:guest',projectId);localStorage.removeItem('scenario-opening-project:guest');
  result.startup={apiCompletion:'UNKNOWN',definition:'actual App mount to restored search, then two animation frames; excludes bundle download, seeding and Auth'};await send();
  const probe=options.enabled?startProbe():undefined,started=options.enabled?undefined:performance.now();
  root=createRoot(document.getElementById('root')!);root.render(<ScenarioStoreProvider store={store}><App/></ScenarioStoreProvider>);
  await new Promise<void>((resolve,reject)=>{const deadline=performance.now()+600000;const tick=()=>{if(document.querySelector('#catalog-search')&&document.querySelector('.search-page .list-heading span')?.textContent===`${result.expected[''].count}件`)resolve();else if(performance.now()>deadline)reject(Error('supplemental startup watchdog'));else requestAnimationFrame(tick);};tick();});
  await frame();const elapsed=started===undefined?undefined:performance.now()-started;
  result.startup={...result.startup,apiCompletion:'fulfilled',...(elapsed===undefined?{}:{milliseconds:elapsed})};
  if(probe){try{await probe.settle();result.startup.probe=probe.snapshot();}finally{probe.stop();}}
  result.afterStartup=retention();await send();
}
async function arm(label:string,expectation:Row){
  require(!pending,'pending action');let resolve!:()=>void,reject!:(e:unknown)=>void;
  const promise=new Promise<void>((a,b)=>{resolve=a;reject=b;});void promise.catch(()=>{});
  pending={label,expectation,resolve,reject,promise};
  result.activeAction={label,expectation,apiCompletion:'UNKNOWN',phase:'pre-event'};await send();
}
async function capture(event:Event){
  const action=pending;if(!action||action.started!==undefined||action.probe)return;
  const target=event.target as HTMLElement;
  if(event.type==='input'?target.id!=='catalog-search':!target.closest('[aria-label="検索結果表のページ"] button'))return;
  if(result.options.enabled)action.probe=startProbe();else action.started=performance.now();
  result.activeAction.phase='actual-event';
  try{
    await frame();const elapsed=action.started===undefined?undefined:performance.now()-action.started;
    const query=(document.querySelector('#catalog-search') as HTMLInputElement).value,count=document.querySelector('.search-page .list-heading span')?.textContent;
    const names=Array.from(document.querySelectorAll('.search-page .entity-card h3')).slice(0,3).map(e=>e.textContent),pager=document.querySelector('[aria-label="検索結果表のページ"] span')?.textContent;
    const expected=action.expectation;
    if(expected.query!==undefined){require(query===expected.query&&count===`${result.expected[query].count}件`,'actual search input/count differs');require(JSON.stringify(names)===JSON.stringify(result.expected[query].firstNames),'actual first card names differ');}
    if(expected.page!==undefined)require(pager?.startsWith(`${expected.page+1} / `),'actual selected/page differs');
    const row:Row={label:action.label,expectation:expected,status:'ok',apiCompletion:'fulfilled',query,count,names,pager,domNodes:document.querySelectorAll('*').length,...(elapsed===undefined?{}:{milliseconds:elapsed})};
    if(action.probe){await action.probe.settle();row.probe=action.probe.stop();}
    result.actions.push(row);delete result.activeAction;await send();action.resolve();
  }catch(error){action.probe?.stop();result.actions.push({label:action.label,status:'error',error:String(error),apiCompletion:'UNKNOWN'});await send();action.reject(error);}
}
document.addEventListener('input',event=>{void capture(event);},true);
document.addEventListener('click',event=>{void capture(event);},true);
async function done(){require(pending,'no armed action');try{await pending!.promise;}finally{pending=undefined;}}
async function verify(){
  require(store,'missing store');const current=await store!.loadEditor(projectId,{immutableView:true});require(current,'missing current');
  for(const text of Object.keys(expectedIds)){const actual=filterCatalogEntities(current!,{op:'text',value:text}).map(e=>e.id);require(await digest(actual)===result.expected[text].sha256,`independent ordered result mismatch ${text}`);}
  result.orderedResultsVerified=true;result.afterQueries=retention();result.postReadSource=await canonicalSource(store!);result.inputUnchanged=result.postReadSource.current===result.savedSource.current;require(result.inputUnchanged,'read-only UI changed author source');await send();
}
async function participant(options:Options){
  require(store,'missing store');const current=(await store!.loadEditor(projectId,{immutableView:true}))!,query:Query={op:'participant',characterId:participantId};
  for(let repetition=0;repetition<30;repetition++){
    const rows=await observe()(`participant-${repetition}`,options.enabled,async()=>filterCatalogEntities(current,query));
    require(await digest(rows.map(e=>e.id))===result.expectedParticipant.sha256,'participant independent ordered oracle');
  }
  result.afterParticipant=retention();await send();
}
async function closeUI(){
  root?.unmount();root=undefined;store?.close();result.afterClose=retention();store=undefined;await send();
}
async function rename(options:Options){
  const fresh=makeStore(options);
  try{
    const current=(await fresh.loadEditor(projectId))!;require(current,'missing editable');const target=current.entities[0];
    const input:ProjectData={...current,entities:current.entities.map(e=>e.id===target.id?{...e,name:`${e.name}計測改名`}:e)};
    result.renameInput=await sha256(jsonBytes(input));
    const saved=await observe()('rename-one',options.enabled,()=>fresh.saveProject(input,{reason:'P206 supplemental one-entity rename',operationId:'a2060000-0000-4000-8000-000000000002'}));
    require(saved.project.entities[0].name===input.entities[0].name,'rename not saved');result.renameOutput=await canonicalSource(fresh);
  }finally{fresh.close();}
  result.status='ok';await send();return result;
}
declare global{interface Window{derivedMeasurement:{start:typeof start;coreRead:typeof coreRead;mount:typeof mount;arm:typeof arm;done:typeof done;verify:typeof verify;participant:typeof participant;closeUI:typeof closeUI;rename:typeof rename;retention:typeof retention};derivedCheckpoint?:(value:unknown)=>Promise<void>}}
window.derivedMeasurement={start,coreRead,mount,arm,done,verify,participant,closeUI,rename,retention};
