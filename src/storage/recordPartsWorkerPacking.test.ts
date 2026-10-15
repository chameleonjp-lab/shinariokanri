import {expect,it,vi} from 'vitest';
import {packRecordData,packWorkerRecordData,unpackRecordData} from './recordPartsCore';

function expectSameParts(actual:Awaited<ReturnType<typeof packRecordData>>,expected:Awaited<ReturnType<typeof packRecordData>>){
  expect(actual.packed).toStrictEqual(expected.packed);
  const metadata=(value:typeof actual)=>value.parts.map(({bytes,...part})=>({...part,byteLength:bytes.byteLength}));
  expect(metadata(actual)).toStrictEqual(metadata(expected));
  for(const [index,part] of actual.parts.entries())expect(Buffer.from(part.bytes).equals(Buffer.from(expected.parts[index]!.bytes))).toBe(true);
}

it('emits exactly the legacy v1 parts for a captured wide history, with Unicode, aliases, ordered own values and present undefined',async()=>{
  const shared={id:'shared',kind:'note',text:'😀日本語\0e\u0301',present:undefined,numbers:[0,-123,1.5],empty:[]};
  const history=Array.from({length:5000},(_,index)=>({operationId:`operation-${index}`,before:{shared,index},after:{shared,index:index+1},present:undefined}));
  const captured=structuredClone({history,shared,again:shared}),legacy=await packRecordData(captured,'same-native-scope'),worker=await packWorkerRecordData(captured,'same-native-scope');
  expectSameParts(worker,legacy);
  const decoded=await unpackRecordData(worker.packed,worker.parts) as typeof captured;
  expect(decoded).toStrictEqual(captured);expect(decoded.shared).toBe(decoded.again);expect(decoded.history[4999]!.after.shared).toBe(decoded.shared);
  expect(Object.hasOwn(decoded.shared,'present')).toBe(true);expect(Reflect.ownKeys(decoded.history[4999]!)).toEqual(Reflect.ownKeys(captured.history[4999]!));
});

it('keeps the exact legacy string-part boundaries and hashes across ASCII, escaped controls and multibyte strings',async()=>{
  const captured=structuredClone({texts:['ascii'.repeat(110000),'\0\n\t"\\'.repeat(70000),'あé'.repeat(180000),'😀𠮷'.repeat(140000),'\u2028\u2029'.repeat(130000)]});
  const legacy=await packRecordData(captured,'same-boundaries'),worker=await packWorkerRecordData(captured,'same-boundaries');
  expect(worker.parts.filter(part=>part.kind==='strings').length).toBeGreaterThan(1);
  expectSameParts(worker,legacy);expect(await unpackRecordData(worker.packed,worker.parts)).toStrictEqual(captured);
});

it('preserves public evaluation order for caller getters instead of selecting the worker-only path',async()=>{
  const calls:string[]=[],nested={get value(){calls.push('nested');return 7;}},input={nested,get later(){calls.push('later');return calls.includes('nested');}};
  const packed=await packRecordData(input,'public-getters');
  expect(calls).toEqual(['later','nested']);expect(await unpackRecordData(packed.packed,packed.parts)).toEqual({nested:{value:7},later:false});
});

it('falls back to the exact legacy node encoding when inherited JSON hooks appear during an asynchronous digest',async()=>{
  const value=structuredClone({text:'😀独立した完全記録',values:[1e-7,-0,Number.MAX_VALUE,undefined,{number:7,undefined:true}]}),expected=await packRecordData(value,'digest-hooks');
  const prototypes=[Object.prototype,Array.prototype,Number.prototype],descriptors=prototypes.map(prototype=>Object.getOwnPropertyDescriptor(prototype,'toJSON'));
  const digest=crypto.subtle.digest.bind(crypto.subtle);let calls=0,actual:Awaited<ReturnType<typeof packRecordData>>|undefined;
  try{
    vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{
      const result=await digest(...args);
      for(const prototype of prototypes)Object.defineProperty(prototype,'toJSON',{configurable:true,value:()=>{calls++;throw Error('inherited hook called');}});
      return result;
    });
    actual=await packWorkerRecordData(value,'digest-hooks');
  }finally{
    vi.restoreAllMocks();
    prototypes.forEach((prototype,index)=>{const descriptor=descriptors[index];if(descriptor)Object.defineProperty(prototype,'toJSON',descriptor);else Reflect.deleteProperty(prototype,'toJSON');});
  }
  expect(calls).toBe(0);expectSameParts(actual!,expected);
});

it.each(['nonfinite','date','cycle','sparse','unicode'] as const)('keeps both packing paths rejecting captured %s before publishing a packed record',async variant=>{
  let value:unknown;
  if(variant==='nonfinite')value={value:Infinity};
  if(variant==='date')value={value:new Date(0)};
  if(variant==='cycle'){const graph:{self?:unknown}={};graph.self=graph;value=graph;}
  if(variant==='sparse')value={value:new Array(3)};
  if(variant==='unicode')value={value:'\ud800'};
  const captured=structuredClone(value);
  await expect(packRecordData(captured,'public-invalid')).rejects.toThrow();
  await expect(packWorkerRecordData(captured,'worker-invalid')).rejects.toThrow();
});

it('preserves pre-abort refusal in both paths without reading the captured graph',async()=>{
  const controller=new AbortController();controller.abort();let reads=0;
  const value={get body(){reads++;return 'unread';}};
  await expect(packRecordData(value,'public-abort',controller.signal)).rejects.toMatchObject({code:'CANCELLED'});
  await expect(packWorkerRecordData(value,'worker-abort',controller.signal)).rejects.toMatchObject({code:'CANCELLED'});
  expect(reads).toBe(0);
});
