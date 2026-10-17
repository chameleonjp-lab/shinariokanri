import type Dexie from 'dexie';
import {ScenarioStore,type AssetInput} from '../../src/storage/store';
import type {CommandRecord,ProjectData} from '../../src/domain/types';
import {createPerformanceFixture,createMaterialPerformanceFixture} from '../../src/testing/performanceFixture';
import {historySeries} from './fixtures';
import {heavyHistoryFixture,HEAVY_HISTORY_BYTES,HEAVY_HISTORY_SHA256} from './history-measurement-fixtures';
import {jsonBytes,sha256,equalJson} from '../../src/storage/json';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {startProbe} from '../../src/observability/probe';

export type HistorySuite='legacy100'|'legacy1000'|'legacy10000'|'standard'|'large'|'added-heavy';
export interface MeasurementOptions {suite:HistorySuite;mode:'check'|'capture';historyCountersSupported:boolean;runId:string}
type Row=Record<string,any>; // Native evidence only; never fed back into product writes.
function require(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const same=(actual:unknown,expected:unknown,label:string)=>require(equalJson(actual,expected),label);
const record=async(value:unknown)=>{const bytes=jsonBytes(value);return{bytes:bytes.byteLength,sha256:await sha256(bytes)};};
const errorData=(error:unknown)=>error instanceof Error?{name:error.name,message:error.message}:{name:'Unknown',message:String(error)};
const historyMetrics=['history.write.candidates','history.write.fallbackShape','history.write.fallbackSize','history.write.canonical','history.write.sealCalls','history.write.sealBytes','history.metadata.rows','history.metadata.payloadBytes','history.legacy.rows','history.legacy.payloadBytes','history.header.payloadBytes','history.partKeys','history.body.rows','history.body.partRows','history.body.partBytes'];

/** Deliberately complete-reader oracle, independent of the canonical implementation. */
export async function fullReaderPage(db:Dexie,projectId:string,options:{query?:string;page?:number;size?:number}={}) {
 const query=(options.query??'').normalize('NFKC').toLocaleLowerCase(),size=options.size??30,page=options.page??0;
 require(Number.isSafeInteger(size)&&size>=1&&size<=60&&Number.isSafeInteger(page)&&page>=0,'oracle bounds');
 const header=await db.table('projects').get(projectId);require(header,'oracle project missing');
 const rows=await db.table('commands').bulkGet(header.historyIds);
 const entries=rows.map((row,index)=>{
  const value=row?.delta?.metadata??row?.record;require(value&&value.operationId===header.historyIds[index]&&value.projectId===projectId,'oracle complete identity');
  const {before:_before,after:_after,...metadata}=value as CommandRecord;return metadata;
 }).reverse().filter(value=>!query||[value.reason,value.revision,value.baseRevision,value.operationId,value.createdAt,...value.targetIds].some(text=>text.normalize('NFKC').toLocaleLowerCase().includes(query)));
 const maximum=Math.max(0,Math.ceil(entries.length/size)-1),bounded=Math.min(page,maximum);
 return{entries:entries.slice(bounded*size,(bounded+1)*size),page:bounded,maximum,total:entries.length,size};
}
async function nativeRead(db:Dexie,table:string,key?:IDBValidKey):Promise<any>{
 return new Promise((resolve,reject)=>{const tx=db.backendDB().transaction(table),store=tx.objectStore(table),request=key===undefined?store.getAll():store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
/** Outside all intervals/probes. Serialized UTF-8 envelopes are not physical IDB bytes. */
export async function nativeHistoryInventory(db:Dexie,projectId:string){
 const commands=(await nativeRead(db,'commands') as Row[]).filter(row=>row.projectId===projectId),header=await nativeRead(db,'projects',projectId);
 const partKeys=new Set<string>(),bodyParts:Row[]=[],headerParts:Row[]=[],representations={inline:0,packedFallback:0,canonical:0};
 const envelopes=[];
 for(const row of commands){
  const descriptor=row.__scenarioRecordParts,canonical=row.__scenarioCommandMetadata?.version===1;
  representations[canonical?'canonical':descriptor?'packedFallback':'inline']++;
  envelopes.push({operationId:row.operationId,representation:canonical?'canonical':descriptor?'packedFallback':'inline',serializedNative:await record(row),metadata:canonical?await record(row.__scenarioCommandMetadata):null,descriptor:descriptor?await record(descriptor):null});
  for(const part of descriptor?.parts??[]){require(!partKeys.has(part.key),'independent bodies must not share part keys');partKeys.add(part.key);const actual=await nativeRead(db,'recordParts',part.key);require(actual?.bytes instanceof Uint8Array,'body part missing');const actualHash=await sha256(actual.bytes);require(actual.bytes.byteLength===part.bytes&&actualHash===part.sha256,'body descriptor byte/hash correspondence');bodyParts.push({key:part.key,bytes:actual.bytes.byteLength,sha256:actualHash,declaredBytes:part.bytes,declaredSHA256:part.sha256});}
 }
 for(const part of header?.__scenarioRecordParts?.parts??[]){const actual=await nativeRead(db,'recordParts',part.key);require(actual?.bytes instanceof Uint8Array,'header part missing');headerParts.push({key:part.key,bytes:actual.bytes.byteLength,sha256:await sha256(actual.bytes)});}
 return{representations,envelopes,bodyParts,bodyBytes:bodyParts.reduce((sum,row)=>sum+row.bytes,0),headerParts,headerBytes:headerParts.reduce((sum,row)=>sum+row.bytes,0),serializedNativeHeader:await record(header),bodyHashesComparedWithDescriptors:true,bodyContentDecodedByInventory:false,pageBodyVerification:'UNLOADED for canonical metadata; this independent inventory is outside page interval'};
}

/** Persist intent before the API clock/probe: checkpoint I/O is excluded.
 * A process lost in that tiny gap cannot prove invocation, so its persisted
 * pre-invocation checkpoint deliberately reports completion UNKNOWN. */
export function createHistoryObserver(options:Pick<MeasurementOptions,'mode'|'historyCountersSupported'>,result:Row,send:()=>Promise<void>,dependencies={clock:()=>performance.now(),startProbe}) {
 return async function observe<T>(label:string,enabled:boolean,operation:()=>Promise<T>):Promise<T>{
  const probeEnabled=options.mode==='capture'&&enabled;
  result.activeOperation={label,mode:options.mode,probeEnabled,phase:'pre-invocation',apiCompletion:'UNKNOWN',apiInvocation:'UNKNOWN: intent persisted before invocation',counterCompleteness:probeEnabled?'UNKNOWN: no settled snapshot':'not captured'};
  await send();
  const probe=probeEnabled?dependencies.startProbe():undefined,started=options.mode==='capture'&&!enabled?dependencies.clock():undefined;
  result.activeOperation={...result.activeOperation,phase:'api-running',apiInvocation:'invoked'};
  let output!:T,operationError:unknown,apiSucceeded=false,milliseconds:number|undefined;
  try{output=await operation();apiSucceeded=true;}catch(error){operationError=error;}
  finally{if(started!==undefined)milliseconds=dependencies.clock()-started;}
  const row:Row={label,probeEnabled,status:probe?'pending-observation':apiSucceeded?'ok':'error',apiCompletion:apiSucceeded?'fulfilled':'rejected',...(milliseconds===undefined?{}:{milliseconds}),...(!apiSucceeded?{error:errorData(operationError)}:{})};
  result.operations.push(row);
  if(probe){
   // Persist the actual API boundary before potentially interrupted settlement.
   // The original rejection is retained even if observation itself also fails.
   result.activeOperation={label,mode:options.mode,probeEnabled,phase:'probe-settling',apiCompletion:row.apiCompletion,counterCompleteness:'UNKNOWN: settlement pending'};
   const partial=probe.snapshot();row.probe=partial;row.counterCompleteness='UNKNOWN: unsettled partial snapshot';
   try{await send();await probe.settle();}
   catch(error){row.observationError=errorData(error);}
   finally{row.probe=probe.stop();}
   const complete=!row.observationError&&row.probe.pendingTransactions===0;
   row.counterCompleteness=complete?'settled capture':'UNKNOWN: unsettled partial snapshot';
   row.historyCounters=Object.fromEntries(historyMetrics.map(name=>[name,!options.historyCountersSupported?'UNKNOWN: unsupported by product source':!complete?'UNKNOWN: unsettled partial snapshot':row.probe.counters[name]??0]));
   row.status=apiSucceeded&&!row.observationError?'ok':'error';
  }
  delete result.activeOperation;await send();
  if(!apiSucceeded)throw operationError;
  if(row.observationError)throw Error(`Probe observation failed: ${row.observationError.message}`);
  return output;
 };
}

/** check mode never starts the interval clock or numeric probe. Product code may
 * use its own clocks internally; no timing observation is returned here. */
export async function runHistoryMeasurement(options:MeasurementOptions,checkpoint:(value:unknown)=>Promise<void>=async()=>{}){
 const result:Row={version:1,...options,operations:[],runs:[],fixture:null,status:'running',scope:'Supplemental single API observations, not formal acceptance/distribution; ON timings are not latency; worker hash work UNKNOWN'};
 const send=()=>checkpoint(structuredClone(result));
 const observe=createHistoryObserver(options,result,send);
 try{
  const direct=options.suite.startsWith('legacy')?historySeries(Number(options.suite.slice(6)) as 100|1000|10000):undefined;
  const fixture=direct?undefined:options.suite==='added-heavy'?{project:heavyHistoryFixture(),seed:'p204-heavy-history-v1',assetBytes:0,counts:{history:2,oldNotes:10,currentNotes:0},assets:[]}:options.suite==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
  const input=direct??fixture!.project,assets:AssetInput[]=fixture&&'assets'in fixture?fixture.assets:[];
  result.fixture={seed:direct?`unchanged-historySeries(${direct.rows.length})`:fixture!.seed,input:await record(input),originalAssetBytes:fixture?.assetBytes??0,assetManifests:await Promise.all(assets.map(async asset=>({contentHash:asset.contentHash,bytes:asset.bytes.byteLength,sha256:await sha256(asset.bytes)}))),counts:direct?{history:direct.rows.length}:fixture!.counts,addedInput:options.suite==='added-heavy'};
  if(options.suite==='large')require(result.fixture.originalAssetBytes===72*1024*1024,'original actual 72MiB materials');
  if(options.suite==='added-heavy'){require(result.fixture.input.bytes===HEAVY_HISTORY_BYTES&&result.fixture.input.sha256===HEAVY_HISTORY_SHA256,'added input frozen byte identity');}
  const archive=options.suite==='added-heavy'?await exportScenario(fixture!.project):undefined,prepared=archive?await inspectScenario(archive):undefined;
  if(archive)result.fixture.actualPreparedArchive={bytes:archive.byteLength,sha256:await sha256(archive)};
  await send();
  for(const enabled of options.mode==='check'?[false]:[false,true]){
   const databaseName=`p204-measure-${options.runId}-${options.suite}-${enabled}`,run:Row={enabled,operationsScope:options.mode==='check'?'correctness only':enabled?'numeric ON work; no latency':'single OFF API intervals'};result.runs.push(run);
   let store=new ScenarioStore({databaseName});
   const reopen=()=>{store.close();store=new ScenarioStore({databaseName});};
   try{
    let project:ProjectData|undefined,projectId:string;run.writerInputs=[];
    if(direct){projectId=direct.header.projectId;await raw(store).transaction('rw',['projects','commands'],async()=>{await raw(store).table('projects').put(direct.header);await raw(store).table('commands').bulkAdd(direct.rows);});run.writer='UNKNOWN: original direct legacy seeding excluded, no store-owned writer claim';}
    else if(prepared){project=(await observe('initial-import-added-heavy',enabled,()=>store.importScenario(prepared,{mode:'new'}))).project;projectId=project.projectId;same(project.history,fixture!.project.history,'import exact original two commands');}
    else{
     run.writerInputs.push({label:'initial-save',input:await record(fixture!.project),assets:result.fixture.assetManifests});
     project=(await observe('initial-save',enabled,()=>store.saveProject(fixture!.project,{reason:'元fixtureの初期化',includeHistory:false,immutableView:true,assets}))).project;projectId=project.projectId;
     for(const operation of ['rename-one','dialogue-one'] as const){
      const before:ProjectData=project!,changed=before.entities.find(row=>row.kind===(operation==='rename-one'?'character':'dialogue_line'));require(changed,'original fixture selected entity');
      const entities=before.entities.map(entity=>entity!==changed?entity:entity.kind==='dialogue_line'?{...entity,data:{...entity.data,text:entity.data.text.map((block,index)=>index?block:{...block,text:'計測した一件の台詞'})}}:{...entity,name:'計測した一件の改名'});
      const next:ProjectData={...before,entities}; // Input construction excluded from API interval.
      run.writerInputs.push({label:operation,input:await record(next)});
      project=(await observe(operation,enabled,()=>store.saveProject(next,{reason:operation,includeHistory:false,immutableView:true}))).project;
      require(project.entities.length===before.entities.length&&project.relations.length===before.relations.length,'literal retained counts');
     }
    }
    run.native=await nativeHistoryInventory(raw(store),projectId);
    if(direct)require(run.native.representations.inline===direct.rows.length&&run.native.representations.canonical===0,'original direct fixtures remain entirely inline fallback');
    const header=await raw(store).table('projects').get(projectId),ids:string[]=header.historyIds;
    require(new Set(ids).size===ids.length&&ids.length===(direct?direct.rows.length:prepared?2:3),'every history ID count/uniqueness');
    if(direct)same(ids,direct.header.historyIds,'all original direct history IDs');
    run.historyIDs=await record(ids);run.historyCount=ids.length;
    const query=direct?'計測変更1':prepared?'abc重い旧稿':'rename-one';
    for(const [label,pageOptions] of [['page-first',{}],['page-last',{page:Math.ceil(ids.length/30)-1}],['page-query',{query}]] as const){
     reopen();const actual=await observe(label,enabled,()=>store.historyPage(projectId,pageOptions));
     const expected=await fullReaderPage(raw(store),projectId,pageOptions);same(actual,expected,`${label} exact complete-reader result`);
     if(label==='page-first')require(actual.entries[0]?.operationId===ids.at(-1),'literal newest ID first');
     if(label==='page-last')require(actual.entries.at(-1)?.operationId===ids[0],'literal earliest ID last');
     if(label==='page-query'&&prepared)require(actual.total===1&&actual.entries[0]?.reason==='ＡＢＣ重い旧稿','literal normalized Japanese query');
     run[label]={result:await record(actual),total:actual.total,revisions:actual.entries.map(entry=>entry.revision)};
    }
    reopen();const fullRows=await observe('cold-full-command-rows',enabled,()=>raw(store).table('commands').bulkGet(ids));
    require(fullRows.every((row,index)=>row?.operationId===ids[index]&&(row.delta?.patch||row.record?.before)),'actual full readers return all complete bodies');
    if(direct)same(fullRows,direct.rows,'exact original full direct rows');run.fullCommands=await record(fullRows);
    reopen();const selectedId=prepared?ids[0]:ids.at(-1)!,selected=await observe('cold-selected-command',enabled,()=>store.historyCommand(projectId,selectedId));
    if(direct){require(selected.before.revision===String(direct.rows.length-1)&&selected.after.revision===String(direct.rows.length),'literal selected revisions');require(selected.after.name===`履歴${direct.rows.length}`,'literal selected name');}
    else{
     reopen();const full=await observe('cold-full-project',enabled,()=>store.getProject(projectId));require(full,'cold full project');same(selected,full.history.find(row=>row.operationId===selectedId),'selected/full exact body correspondence');require(full.history.length===ids.length,'cold full all commands');
     if(prepared)same(full,fixture!.project,'added fixture exact cold full project');
     else{require(full.entities.some(row=>row.name==='計測した一件の改名'),'literal rename preserved');require(full.entities.some(row=>row.kind==='dialogue_line'&&row.data.text[0]?.text==='計測した一件の台詞'),'literal dialogue preserved');}
     run.coldFullProject=await record(full);
    }
    run.selected=await record(selected);
    reopen();const oracle=await observe('cold-full-reader-page-oracle',enabled,()=>fullReaderPage(raw(store),projectId));same(oracle,await store.historyPage(projectId),'measured complete-reader oracle exact result');
    run.status='ok';await send();
   }finally{await store.deleteDatabase();}
  }
  result.status='ok';await send();return result;
 }catch(error){result.status='error';result.error=errorData(error);await send();throw error;}
}
