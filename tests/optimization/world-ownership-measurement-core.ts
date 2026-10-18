import type Dexie from 'dexie';
import {ScenarioStore,type AssetInput} from '../../src/storage/store';
import type {ProjectData} from '../../src/domain/types';
import {createPerformanceFixture,createMaterialPerformanceFixture} from '../../src/testing/performanceFixture';
import {jsonBytes,sha256,equalJson} from '../../src/storage/json';
import {inspectScenario,verifySnapshotHashes,worldSnapshotContents} from '../../src/storage/archive';
import {validateProject} from '../../src/domain/model';
import {validateColdRead} from '../../src/storage/readValidation';
import {createHistoryObserver} from './history-measurement-core';
import {startProbe} from '../../src/observability/probe';
import {worldOwnershipFixtures,ownershipId} from './world-ownership-measurement-fixtures';

export interface WorldMeasurementOptions {suite:'supplemental'|'standard'|'large';mode:'check'|'capture';runId:string;worldCountersSupported:boolean}
type Row=Record<string,any>;
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
function require(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
const digest=async(value:unknown)=>{const bytes=jsonBytes(value);return{bytes:bytes.byteLength,sha256:await sha256(bytes)};};
const same=(actual:unknown,expected:unknown,label:string)=>require(equalJson(actual,expected),label);
export function storeRetention(store:ScenarioStore){
 const state=store as unknown as {cachedProjects:Map<string,ProjectData>;contentHeads:Map<string,unknown>;cachedHistoryIds:Map<string,unknown>;completeHistories:Set<string>;cacheEpochs:Map<string,unknown>};
 const projects=[...state.cachedProjects.values()];
 return{projects:projects.length,heads:state.contentHeads.size,histories:state.cachedHistoryIds.size,completeHistories:state.completeHistories.size,epochs:state.cacheEpochs.size,records:projects.reduce((sum,p)=>sum+p.entities.length+p.relations.length,0),canonicalBytes:projects.reduce((sum,p)=>sum+jsonBytes(p).byteLength,0),weakMetadata:'not enumerable; weak read/history tokens are owned by their caller keys',canonicalRowsAndDrafts:'outside this retention budget'};
}
const allWorlds=async(store:ScenarioStore):Promise<Record<string,ProjectData>>=>Object.fromEntries((await raw(store).table('worlds').toArray()).map(row=>[row.id,row.project]));

/** Shared reviewed observer preserves rejected OFF duration, ON partial/settled
 * evidence and active-operation intent. Check mode invokes neither clock/probe. */
export async function runWorldOwnershipMeasurement(options:WorldMeasurementOptions,checkpoint:(value:unknown)=>Promise<void>=async()=>{},dependencies={clock:()=>performance.now(),startProbe}){
 const result:Row={version:1,...options,operations:[],runs:[],status:'running',scope:'Supplemental operation observations; original Standard/Large inputs unchanged. OFF API elapsed excludes fixture construction/oracle/hashing/cleanup. ON raw work and retention are separate; no formal distribution/acceptance. Export/recovery still captures the complete native registry.'};
 const send=()=>checkpoint(structuredClone(result));
 const observe=createHistoryObserver({mode:options.mode,historyCountersSupported:true},result,send,dependencies);
 try{
  const supplement=await worldOwnershipFixtures();
  const fixture=options.suite==='supplemental'?undefined:options.suite==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
  const assets:AssetInput[]=fixture&&'assets'in fixture?fixture.assets as AssetInput[]:[];
  result.fixture={original:fixture?{seed:fixture.seed,size:fixture.size,input:await digest(fixture.project),counts:fixture.counts,assetBytes:fixture.assetBytes,assets:await Promise.all(assets.map(async asset=>({bytes:asset.bytes.byteLength,declaredHash:asset.contentHash,sha256:await sha256(asset.bytes)})))}:null,supplement:{seed:supplement.seed,input:await digest(supplement),worlds:6,works:6,oldRetainedSnapshot:ownershipId(3000),outerOwner:ownershipId(4000)},writerOutputs:'store-generated operation IDs/timestamps differ between independent DB runs; fixture hashes and literal entity/pin expectations are the comparison contract'};
  if(options.suite==='large')require(fixture?.assetBytes===72*1024*1024,'original actual 72MiB materials');await send();
  for(const enabled of options.mode==='check'?[false]:[false,true]){
   const store=new ScenarioStore({databaseName:`p205-${options.runId}-${options.suite}-${enabled}`}),run:Row={enabled,selections:[],retentionBoundaries:[]};result.runs.push(run);
   try{
    if(fixture){const initial=await observe('original-fixture-save',enabled,()=>store.saveProject(fixture.project,{reason:'unchanged original fixture',includeHistory:false,immutableView:true,assets}));require(initial.project.entities.length===fixture.project.entities.length,'literal original entity count');run.originalSaved={revision:initial.project.revision,entities:initial.project.entities.length,relations:initial.project.relations.length};}
    // Setup is outside the API observations. Both variants receive the same
    // literal fixture graphs, native guarded writer and source/work order.
    for(let index=0;index<6;index++){
     const world=supplement.worlds[index],work=supplement.works[index];
     await store.saveProject(world,{reason:'editable source setup',includeHistory:false});
     await store.saveProject(work,{reason:'pinned work setup',includeHistory:false,worldPin:{world,snapshotId:world.snapshots[0].id}});
    }
    run.retentionBoundaries.push({boundary:'after setup',...storeRetention(store)});
    const nativeBefore=await allWorlds(store);await verifySnapshotHashes(Object.values(nativeBefore));
    require(Object.keys(nativeBefore).length===6,'literal six complete world rows');
    require(nativeBefore[ownershipId(4000)].snapshots.map(row=>row.id).join(',')===[ownershipId(4000),ownershipId(3000)].join(','),'literal retained outer/old IDs');
    if(fixture){
     store.releaseEditor(fixture.project.projectId);
     const current=await observe('original-cold-editing-amid-six-worlds',enabled,()=>store.getProjectForEditing(fixture.project.projectId,{immutableView:true}));require(current,'original selected current');
     require(current.entities.length===fixture.project.entities.length&&current.relations.length===fixture.project.relations.length,'literal original current counts');
     same(current.entities.map(row=>row.id),fixture.project.entities.map(row=>row.id),'all original stable IDs in order');
     await validateColdRead(current,nativeBefore);
     const first=current.entities.find(row=>row.kind==='character');require(first,'original first character');
     const next={...current,entities:current.entities.map(row=>row.id===first.id?{...row,name:'P205 original one character renamed'}:row)};
     run.originalChangeInput=await digest(next);
     const saved=await observe('original-save-one-amid-six-worlds',enabled,()=>store.saveProject(next,{reason:'original one character renamed',includeHistory:false,immutableView:true}));
     require(saved.project.revision==='2'&&store.getHistoryCount(saved.project)===2,'literal original save history/revision');
     require(saved.project.entities.find(row=>row.id===first.id)?.name==='P205 original one character renamed','literal original renamed value');
     store.releaseEditor(fixture.project.projectId);
     const full=await observe('original-cold-full-history-amid-six-worlds',enabled,()=>store.getProject(fixture.project.projectId));require(full?.history.length===2,'original complete two-command history');
     require(full.history[0].after.entities.length===fixture.project.entities.length,'original first complete image retained');
     run.originalAfter={entities:full.entities.length,relations:full.relations.length,history:full.history.length,firstCharacter:full.entities.find(row=>row.id===first.id)?.name};
    }
    let retained:ProjectData|undefined;
    for(let index=0;index<6;index++){
     const input=supplement.works[index],project=await observe(`select-work-${index}`,enabled,()=>store.getProjectForEditing(input.projectId,{immutableView:true}));require(project,'selected work');if(index===0)retained=project;
     const worlds=await observe(`dependencies-work-${index}`,enabled,()=>store.listEditorWorldSnapshots(project));
     // Independent oracle always has ALL six raw native rows. It is never fed
     // the implementation's selected registry as its expected universe.
     await validateColdRead(project,nativeBefore);require(validateProject(project,{worldSnapshots:worldSnapshotContents(nativeBefore)}).ok,'complete registry oracle');
     same(project.worldReferences,input.worldReferences,'literal immutable pin ID/hash');require(project.name===`P205 work ${index}`&&project.revision==='1'&&project.entities[0].id===ownershipId(6000+index),'literal name/revision/record ID');
     const id=input.worldReferences[0].immutableSnapshotId;require(worlds[id]?.snapshots[0].contentHash===input.worldReferences[0].contentHash,'selected whole row content hash');
     same(worlds[id],nativeBefore[id],'selected immutable row byte contract');
     run.selections.push({name:project.name,worldKeys:Object.keys(worlds),expectedPin:input.worldReferences[0],result:await digest(project),dependencies:await digest(worlds)});
     const source=await observe(`preview-source-${index}`,enabled,()=>store.loadWorldSource(supplement.worlds[index].projectId));require(source?.world.projectId===supplement.worlds[index].projectId,'literal source project');
     require(source.world.snapshots.some(row=>row.id===id),'chosen source retains selected edition');
     run.retentionBoundaries.push({boundary:`after source ${index}`,...storeRetention(store)});
    }
    require(retained,'retained editor');
    const saved=await observe('save-retained-draft-after-pressure',enabled,()=>store.saveProject({...retained,name:'P205 retained author input'},{reason:'after pressure',includeHistory:false}));
    require(saved.project.revision==='2'&&store.getHistoryCount(saved.project)===2,'literal retained token history/revision');
    const selected=await observe('selected-history',enabled,()=>store.historyCommand(retained.projectId,saved.operationId));require(selected.before.name==='P205 work 0'&&selected.after.name==='P205 retained author input','literal selected history bodies');
    store.releaseEditor(retained.projectId);
    const full=await observe('cold-full-project',enabled,()=>store.getProject(retained.projectId));require(full?.history.length===2&&full.name==='P205 retained author input','literal full history after pressure');
    const archive=await observe('complete-export-with-history',enabled,()=>store.exportProject(retained.projectId));
    const inspected=await inspectScenario(archive);same(inspected.project,full,'full export all command images');
    run.exportedWorldKeys=Object.keys(inspected.worlds);same(run.exportedWorldKeys,[ownershipId(4000)],'complete export actual owner key');
    same(inspected.worlds[ownershipId(4000)],nativeBefore[ownershipId(4000)],'export whole immutable old/new row');require(inspected.recovery?.pending.length===2,'literal pending recovery count');run.export={bytes:archive.byteLength,sha256:await sha256(archive)};
    same(await allWorlds(store),nativeBefore,'canonical immutable rows never pruned');run.retention=storeRetention(store);
    for(const input of supplement.works)store.releaseEditor(input.projectId);for(const source of supplement.worlds)store.releaseEditor(source.projectId);
    run.released=storeRetention(store);store.close();run.closed=storeRetention(store);run.status='ok';await send();
   }finally{await store.deleteDatabase();}
  }
  result.status='ok';await send();return result;
 }catch(error){result.status='error';result.error={name:error instanceof Error?error.name:'Unknown',message:error instanceof Error?error.message:String(error)};await send();throw error;}
}
