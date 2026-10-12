import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {createEntity,createProject,newId,textToRichText} from '../domain/model';
import {inspectScenario,assetPath} from './archive';
import {canonicalJson,sha256} from './json';
import {exportNativeScenarioData} from './nativeExport';
import {ScenarioStore} from './store';
import {WorkerGraphReceiver} from './workerGraph';

class NativeExportWorker{
  static instances:NativeExportWorker[]=[];
  messages:any[]=[];terminated=0;received:any;
  receiver=new WorkerGraphReceiver();assets=new Map<number,(bytes:Uint8Array|undefined)=>void>();next=0;
  onmessage:((event:MessageEvent)=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(){NativeExportWorker.instances.push(this);}
  emit(data:unknown){this.onmessage?.({data} as MessageEvent);}
  postMessage(message:any){
    this.messages.push(structuredClone(message));
    if(message.type==='asset'){this.assets.get(message.id)?.(message.bytes);this.assets.delete(message.id);return;}
    if(message.type==='graph-chunk'){this.receiver.accept(structuredClone(message));return;}
    this.received=message.type==='graph-end'?this.receiver.finish(message.root):structuredClone(message);
    void exportNativeScenarioData(this.received.native,{...this.received.options,onProgress:progress=>this.emit({type:'progress',progress}),loadAsset:hash=>new Promise(resolve=>{const id=++this.next;this.assets.set(id,resolve);this.emit({type:'asset',id,hash});})})
      .then(bytes=>this.emit({type:'done',bytes}),error=>this.emit({type:'error',code:error.code,message:error.message,path:error.path}));
  }
  terminate(){this.terminated++;}
}
const stores:ScenarioStore[]=[];
afterEach(async()=>{vi.unstubAllGlobals();NativeExportWorker.instances=[];for(const s of stores.splice(0))await s.deleteDatabase();});

it('computes every actual native pending hash in the export worker and keeps payloads, origins, binary assets and all native tables unchanged',async()=>{
  const store=new ScenarioStore({databaseName:'native-export-worker-'+newId()});stores.push(store);
  const project=createProject('実nativeから同じ完全ファイル');project.entities.push(createEntity(project.projectId,'note','原稿',{body:textToRichText('😀全履歴と素材を保つ')}));
  const bytes=new Uint8Array([0,11,128,255,32,77]),hash=await sha256(bytes);
  project.entities.push(createEntity(project.projectId,'attachment','実素材',{contentHash:hash,byteSize:bytes.length,mediaType:'application/octet-stream',assetPath:assetPath(hash)}));
  let saved=(await store.saveProject(project,{reason:'実素材と原稿',assets:[{contentHash:hash,bytes,mediaType:'application/octet-stream'}]})).project;
  saved.entities[0].name='改稿';saved=(await store.saveProject(saved,{reason:'通常の改稿'})).project;
  const sourcePending=await store.listOutbox(project.projectId),direct=await inspectScenario(await store.exportProject(project.projectId),{worker:false});
  const db=(store as unknown as {db:Dexie}).db,capture=async()=>Object.fromEntries(await Promise.all(db.tables.map(async t=>[t.name,await t.toArray()]))),before=await capture();
  vi.stubGlobal('window',{});vi.stubGlobal('Worker',NativeExportWorker);
  const progress:string[]=[];const actual=await inspectScenario(await store.exportProject(project.projectId,{onProgress:p=>progress.push(p.stage)}),{worker:false});
  expect(actual.project).toEqual(saved);expect(actual.project).toEqual(direct.project);expect(actual.recovery).toEqual(direct.recovery);
  expect(actual.manifest.files).toEqual(direct.manifest.files);expect(actual.assets).toEqual(direct.assets);expect(actual.assets[0].bytes).toEqual(bytes);
  expect(actual.recovery?.pending).toHaveLength(2);
  for(const [i,row]of actual.recovery!.pending.entries()){
    expect(row.commandHash).toBe(createHash('sha256').update(canonicalJson(saved.history[i])).digest('hex'));
    expect(row.command).toEqual(saved.history[i]);expect(row.origin).toEqual({projectId:project.projectId,operationId:row.operationId,serverRevision:sourcePending[i].baseRevision});
  }
  const worker=NativeExportWorker.instances[0];expect(worker.received.native.project.history).toEqual(saved.history);expect(worker.received).not.toHaveProperty('input');
  expect(worker.messages[0]).toMatchObject({type:'graph-chunk'});expect(worker.messages.some(m=>m.type==='asset'&&m.bytes)).toBe(true);expect(worker.terminated).toBe(1);
  expect(progress).toContain('hashes');expect(progress).toContain('validating');expect(await capture()).toEqual(before);
});
