import type {PackedRecord,RecordPart} from './recordPartsCore';
import {RECORD_PART_TOTAL_LIMIT} from './recordPartsCore';
import {checkCancelled,StorageError} from './errors';
import {sha256} from './json';

const targetBytes=128*1024;
type EncodedRecord={packed:PackedRecord;parts:RecordPart[]};

/** @internal Repartition only the private, already-encoded v1 JSON arrays.
 * Every item byte, order, graph reference and complete row stays unchanged.
 * Smaller native values avoid accumulating large temporary blobs while an
 * import's single transaction retains all full pending commands. No part is
 * shared with another row and the existing decoder needs no new format. */
export async function partitionImportRecord(encoded:EncodedRecord,signal?:AbortSignal):Promise<EncodedRecord>{
 checkCancelled(signal);
 const chunks:{kind:RecordPart['kind'];bytes:Uint8Array;sha256?:string}[]=[];
 let total=0;
 for(const part of encoded.parts){
  const bytes=part.bytes;
  if(bytes.byteLength<=targetBytes){
   // Never retain a large backing buffer behind a small native typed view.
   const captured=bytes.byteOffset===0&&bytes.buffer.byteLength===bytes.byteLength?bytes:bytes.slice();
   chunks.push({kind:part.kind,bytes:captured,sha256:part.sha256});total+=captured.byteLength;continue;
  }
  if(bytes[0]!==91||bytes.at(-1)!==93)throw new StorageError('SAVE_FAILED','取り込む分割記録の配列が不正です。');
  let start=1,item=1,depth=0,quoted=false,escaped=false;
  const emit=(end:number)=>{
   // A single wide array node or author string remains one original v1 item;
   // this target is not a new author-data limit.
   const next=new Uint8Array(end-start+2);next[0]=91;next.set(bytes.subarray(start,end),1);next[next.length-1]=93;
   chunks.push({kind:part.kind,bytes:next});total+=next.byteLength;
  };
  for(let index=1;index<bytes.length;index++){
   if(index%4096===0)checkCancelled(signal);
   const byte=bytes[index]!;
   if(quoted){if(escaped)escaped=false;else if(byte===92)escaped=true;else if(byte===34)quoted=false;continue;}
   if(byte===34){quoted=true;continue;}
   const end=index===bytes.length-1;
   if(!end&&(byte===91||byte===123)){depth++;continue;}
   if(!end&&(byte===93||byte===125)){depth--;continue;}
   if((end||byte===44&&depth===0)&&index-start+2>targetBytes&&item>start){emit(item-1);start=item;}
   if(end)emit(index);else if(byte===44&&depth===0)item=index+1;
  }
 }
 // Additional array brackets cannot make a formerly legal record fail the
 // unchanged v1 total-byte guard. Retain the original encoding at that edge.
 if(total>RECORD_PART_TOTAL_LIMIT)return encoded;
 const parts:RecordPart[]=[];
 for(const chunk of chunks){
  checkCancelled(signal);const sequence=parts.length;
  const digest=chunk.sha256??await sha256(chunk.bytes);checkCancelled(signal);
  parts.push({key:`${encoded.packed.scope}:${sequence}`,scope:encoded.packed.scope,sequence,kind:chunk.kind,bytes:chunk.bytes,sha256:digest});
 }
 return{packed:{...encoded.packed,parts:parts.map(part=>({key:part.key,kind:part.kind,bytes:part.bytes.byteLength,sha256:part.sha256}))},parts};
}
