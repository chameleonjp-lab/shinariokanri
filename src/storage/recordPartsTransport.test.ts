// Real packed bytes/core and controlled worker transport; not physical evidence.
import {afterEach,expect,it,vi} from 'vitest';
import {packRecordData,unpackRecordData} from './recordPartsCore';
import {unpackRecord} from './recordParts';
import {freezeCapturedPlainData} from '../domain/immutablePlainData';
import {sendWorkerGraph} from './workerGraph';
import {deepStrictEqual} from 'node:assert/strict';

class GraphWorker{
 static instances:GraphWorker[]=[];static hold=false;
 onmessage:((event:MessageEvent)=>void)|null=null;onerror:(()=>void)|null=null;
 terminated=0;sent=0;held=false;
 constructor(){GraphWorker.instances.push(this);}
 emit(data:unknown){this.onmessage?.({data} as MessageEvent);}
 postMessage(message:unknown){
  const captured=structuredClone(message) as {packed:Parameters<typeof unpackRecordData>[0];parts:Parameters<typeof unpackRecordData>[1]};
  void unpackRecordData(captured.packed,captured.parts).then(async value=>{
   expect(freezeCapturedPlainData(value)).toBe(true);
   await sendWorkerGraph(value as object,chunk=>{this.sent++;if(GraphWorker.hold){this.held=true;if(this.sent===1)this.emit(chunk);}else this.emit(chunk);},undefined,()=>!this.terminated);
  }).catch(error=>{if(!this.terminated)this.emit({ok:false,code:error.code});});
 }
 terminate(){this.terminated++;}
}
afterEach(()=>{vi.unstubAllGlobals();GraphWorker.instances=[];GraphWorker.hold=false;});
const browser=()=>{vi.stubGlobal('window',{});vi.stubGlobal('Worker',GraphWorker);};

it('returns every real decoded field and alias only after the complete bounded graph arrives',async()=>{
 const shared={id:'same-node',body:'😀元の本文',present:undefined,zero:-0},input={records:Array.from({length:20000},(_,i)=>({id:i,shared})),also:shared};
 const actual=await packRecordData(input,'real-streamed-native-capture');
 const baseline=await unpackRecordData(actual.packed,actual.parts) as typeof input;const before=actual.parts.map(p=>p.bytes.slice());browser();
 const decoded=await unpackRecord(actual.packed,actual.parts) as typeof input;
 deepStrictEqual(decoded,baseline);expect(decoded.records[0].shared).toBe(decoded.also);expect(decoded.records.at(-1)!.shared).toBe(decoded.also);expect(Object.hasOwn(decoded.also,'present')).toBe(true);expect(Object.is(decoded.also.zero,baseline.also.zero)).toBe(true);
 expect(GraphWorker.instances[0].sent).toBeGreaterThan(1);expect(GraphWorker.instances[0].terminated).toBe(1);expect(actual.parts.length).toBe(before.length);expect(actual.parts.every((p,i)=>Buffer.from(p.bytes).equals(Buffer.from(before[i])))).toBe(true);
});
it('cancels a partial graph, ignores late completion and retries the same exact packed bytes',async()=>{
 const input={records:Array.from({length:800},(_,id)=>({id,text:'😀変更しない'}))},actual=await packRecordData(input,'cancelled-streamed-native-capture'),before=actual.parts.map(p=>p.bytes.slice());browser();GraphWorker.hold=true;
 const controller=new AbortController(),pending=unpackRecord(actual.packed,actual.parts,controller.signal),rejected=expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 await vi.waitFor(()=>expect(GraphWorker.instances[0].held).toBe(true));const worker=GraphWorker.instances[0];controller.abort();worker.emit({type:'graph-end',root:0});await rejected;expect(worker.terminated).toBe(1);
 GraphWorker.hold=false;deepStrictEqual(await unpackRecord(actual.packed,actual.parts),input);expect(actual.parts.length).toBe(before.length);expect(actual.parts.every((p,i)=>Buffer.from(p.bytes).equals(Buffer.from(before[i])))).toBe(true);
});
