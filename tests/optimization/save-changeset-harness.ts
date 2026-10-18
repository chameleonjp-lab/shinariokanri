import {ScenarioStore,type AssetInput,type SaveMetrics} from '../../src/storage/store';
import {createMaterialPerformanceFixture,createPerformanceFixture} from '../../src/testing/performanceFixture';
import {startProbe} from '../../src/observability/probe';
import {jsonBytes,sha256} from '../../src/storage/json';
const require=(value:unknown,message:string)=>{if(!value)throw Error(message);};
async function compare(size:'standard'|'large'){
 const fixture=size==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
 const observations=[];
 for(const enabled of [false,true]){
  const reports:SaveMetrics[]=[],store=new ScenarioStore({databaseName:`p2-03-${size}-${enabled}`,onSaveMetrics:row=>reports.push(row)});
  try{
   let project=(await store.saveProject(fixture.project,{reason:'元fixtureの初期化',includeHistory:false,immutableView:true,assets:'assets'in fixture?fixture.assets as AssetInput[]:[]})).project;
   const operations=[];
   for(const operation of ['rename-one','dialogue-one'] as const){
    const before=project,changed=before.entities.find(row=>row.kind===(operation==='rename-one'?'character':'dialogue_line'))!;
    const entities=before.entities.map(entity=>entity!==changed?entity:entity.kind==='dialogue_line'?{...entity,data:{...entity.data,text:entity.data.text.map((block,index)=>index?block:{...block,text:'計測した一件の台詞'})}}:{...entity,name:'計測した一件の改名'});
    const probe=enabled?startProbe():undefined,started=performance.now();
    try{
     project=(await store.saveProject({...before,entities},{reason:operation,includeHistory:false,immutableView:true})).project;
     const milliseconds=performance.now()-started;
     await probe?.settle();const capture=probe?.stop(),{operationId:_id,projectId:_projectId,...metrics}=reports.at(-1)!;
     require(project.entities.length===before.entities.length&&project.relations.length===before.relations.length,'record counts');
     require(store.getHistoryCount(project)===store.getHistoryCount(before)+1,'history append');
     require(metrics.written.entities===1&&metrics.written.relations===0&&metrics.written.commands===1&&metrics.written.outbox===1,'literal differential writes');
     require(metrics.written.blocks===(operation==='dialogue-one'?1:0),'literal block writes');
     if(capture)require(capture.counters['db.write.committed.entities']===1&&capture.counters['db.write.committed.commands']===1&&capture.counters['db.write.committed.outbox']===1,'native commit rows');
     operations.push({operation,milliseconds,metrics,...(capture?{probe:capture}:{})});
    }finally{probe?.stop();}
   }
   observations.push({enabled,operations});
  }finally{await store.deleteDatabase();}
 }
 return {fixture:{seed:fixture.seed,size,counts:fixture.counts,assetBytes:fixture.assetBytes,sha256:fixture.sha256,canonicalSHA256:await sha256(jsonBytes(fixture.project))},observations};
}
declare global{interface Window{saveChangesetMeasurement:{compare:typeof compare}}}
window.saveChangesetMeasurement={compare};
