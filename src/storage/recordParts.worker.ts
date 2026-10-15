import {packWorkerRecordData,unpackRecordData} from './recordPartsCore';
import {freezeCapturedPlainData} from '../domain/immutablePlainData';
import {sendWorkerGraph} from './workerGraph';
const scope=self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async event=>{
 try{
  if(event.data.action==='pack'){
   const value=await packWorkerRecordData(event.data.value,event.data.scope);
   // These newly encoded buffers are owned by this worker.
   scope.postMessage({ok:true,value},[...new Set(value.parts.map(part=>part.bytes.buffer as ArrayBuffer))]);
  }else{
   const value=await unpackRecordData(event.data.packed,event.data.parts);
   // Transfer the private decoded graph in bounded messages; unusual legacy
   // own values retain the existing atomic response and final header checks.
   if(value&&typeof value==='object'&&freezeCapturedPlainData(value))await sendWorkerGraph(value,chunk=>scope.postMessage(chunk));
   else scope.postMessage({ok:true,value});
  }
 }catch(error){const cause=error as {code?:string};scope.postMessage({ok:false,code:cause.code??'SAVE_FAILED'});}
};
