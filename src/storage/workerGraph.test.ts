import {afterEach, expect, it, vi} from 'vitest';
import {captureImmutablePlainData} from '../domain/immutablePlainData';
import {createEntity,createProject,textToRichText} from '../domain/model';
import {createWorldSnapshot} from '../domain/world';
import {exportScenario,inspectScenario} from './archive';
import {exportScenarioData} from './archiveData';
import {canonicalJson} from './json';
import {sendWorkerGraph,WorkerGraphReceiver,type WorkerGraphChunk} from './workerGraph';

class ExportWorker {
  static instances: ExportWorker[]=[];
  static onChunk: (()=>void)|undefined;
  messages: unknown[]=[];
  terminated=0;
  received: any;
  receiver=new WorkerGraphReceiver();
  onmessage: ((event:MessageEvent)=>void)|null=null;
  onerror: (()=>void)|null=null;
  constructor(){ExportWorker.instances.push(this);}
  postMessage(message:any){
    this.messages.push(structuredClone(message));
    if(message.type==='graph-chunk'){this.receiver.accept(structuredClone(message));ExportWorker.onChunk?.();return;}
    this.received=message.type==='graph-end'?this.receiver.finish(message.root):structuredClone(message);
    void exportScenarioData(this.received.input,this.received.options).then(bytes=>this.onmessage?.({data:{type:'done',bytes}} as MessageEvent),()=>this.onerror?.());
  }
  terminate(){this.terminated++;}
}
afterEach(()=>{vi.unstubAllGlobals();ExportWorker.instances=[];ExportWorker.onChunk=undefined;});

it('preserves all ordered values, alias identities and canonical bytes while yielding across a large private graph',async()=>{
  const shared={text:'😀𠮷の共有本文',values:[null,-0,true,NaN]},author={rows:Array.from({length:20_000},(_,id)=>({id,shared})),same:shared};
  const captured=captureImmutablePlainData(author).value,receiver=new WorkerGraphReceiver();
  let ticks=0;const timer=setInterval(()=>ticks++,0);let chunks=0,result:unknown;
  try{await sendWorkerGraph(captured,message=>{if(message.type==='graph-chunk'){chunks++;receiver.accept(structuredClone(message));}else result=receiver.finish(message.root);});}
  finally{clearInterval(timer);}
  expect(ticks).toBeGreaterThan(0);expect(chunks).toBeGreaterThan(1);expect(result).toEqual(author);
  const actual=result as typeof author;expect(actual.rows[0].shared).toBe(actual.same);expect(actual.rows.at(-1)!.shared).toBe(actual.same);expect(Object.is(actual.same.values[1],-0)).toBe(true);
  expect(Object.isFrozen(author)).toBe(false);expect(Object.isFrozen(author.rows[0])).toBe(false);
  // NaN is transported unchanged, so the existing JSON boundary still rejects
  // it; transport cannot turn invalid values into a valid JSON representation.
  expect(()=>canonicalJson(actual)).toThrow();expect(()=>canonicalJson(author)).toThrow();
});

it('exports the complete same project through the streamed worker path with the same payload hashes, assets and immutable snapshot',async()=>{
  let p=createProject('同じ完全保存の受渡し');p.entities.push(createEntity(p.projectId,'note','本文',{body:textToRichText('😀元の本文と旧版を保つ')}));
  p=await createWorldSnapshot(p,'旧公開版');
  p.snapshots[0].content.entities[0]=p.entities[0]; // Same exact JSON, deliberately shared identity.
  const author=structuredClone(p),captured=captureImmutablePlainData(p).value;
  const direct=await inspectScenario(await exportScenarioData(captured),{worker:false});
  vi.stubGlobal('window',{});vi.stubGlobal('Worker',ExportWorker);
  const streamed=await inspectScenario(await exportScenario(captured),{worker:false});
  expect(streamed.project).toEqual(direct.project);expect(streamed.project).toEqual(author);expect(streamed.assets).toEqual(direct.assets);
  expect(streamed.manifest.files).toEqual(direct.manifest.files);expect(streamed.manifest.requiredFeatures).toEqual(direct.manifest.requiredFeatures);
  const worker=ExportWorker.instances[0];expect(worker.messages[0]).toMatchObject({type:'graph-chunk'});expect(worker.terminated).toBe(1);
  expect(worker.received.input.entities[0]).toBe(worker.received.input.snapshots[0].content.entities[0]);
  expect(p).toEqual(author);expect(Object.isFrozen(p)).toBe(false);expect(Object.isFrozen(p.entities[0])).toBe(false);
});

it('keeps mutable caller input on the original atomic worker clone and never freezes the author',async()=>{
  const p=createProject('作者の可変入力');p.entities.push(createEntity(p.projectId,'note','元の本文',{body:textToRichText('元の文章')}));
  const before=structuredClone(p);vi.stubGlobal('window',{});vi.stubGlobal('Worker',ExportWorker);
  const file=await inspectScenario(await exportScenario(p),{worker:false});expect(file.project).toEqual(before);
  expect(ExportWorker.instances[0].messages[0]).toHaveProperty('input');expect(ExportWorker.instances[0].messages[0]).not.toHaveProperty('type');
  expect(Object.isFrozen(p)).toBe(false);p.entities[0].name='次の作者入力';expect(file.project.entities[0].name).toBe('元の本文');
});

it('cancels between transport chunks, terminates the worker and ignores its late result without mutating any input',async()=>{
  const p=createProject('受渡し取消');p.entities.push(createEntity(p.projectId,'note','取消前の文章',{body:textToRichText('😀入力を保つ')}));
  const author=structuredClone(p),captured=captureImmutablePlainData(p).value,controller=new AbortController();
  vi.stubGlobal('window',{});vi.stubGlobal('Worker',ExportWorker);ExportWorker.onChunk=()=>controller.abort();
  await expect(exportScenario(captured,{signal:controller.signal})).rejects.toMatchObject({code:'CANCELLED'});
  const worker=ExportWorker.instances[0];expect(worker.terminated).toBe(1);expect(worker.messages.some((m:any)=>m.type==='graph-end')).toBe(false);
  worker.onmessage?.({data:{type:'done',bytes:new Uint8Array([1,2,3])}} as MessageEvent);expect(worker.terminated).toBe(1);expect(p).toEqual(author);
});

it('rejects unsafe transport keys and dangling references before completing the worker graph',()=>{
  for(const value of [{value:'pollute'}, {reference:9}]){
    const receiver=new WorkerGraphReceiver();const chunk:WorkerGraphChunk={type:'graph-chunk',declarations:[{id:0}],properties:[{id:0,key:'reference' in value?'missing':'__proto__',value}]};
    expect(()=>receiver.accept(chunk)).toThrow();expect(({} as any).pollute).toBeUndefined();
  }
});
