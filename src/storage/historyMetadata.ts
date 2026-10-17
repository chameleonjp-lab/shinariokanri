import Dexie from 'dexie';
import type {CommandRecord} from '../domain/types';
import type {PackedRecord} from './recordParts';
import {needsRecordParts} from './recordParts';
import {jsonBytes,sha256,equalJson} from './json';
import {StorageError} from './errors';
import {probeCount,probePayload} from '../observability/probe';

const marker='__scenarioCommandMetadata';
type Metadata=Omit<CommandRecord,'before'|'after'>;
type NativeRow=Record<string,unknown>;
interface CanonicalMetadata {version:1;metadata:Metadata;digest:string}
const writes=new WeakSet<object>(),reads=new WeakSet<object>();
const invalid=():never=>{throw new StorageError('SAVE_FAILED','履歴の操作情報と本文の対応が破損しています。');};

/** Store-owned command writers only. Direct/legacy table writes retain v1. */
export function bindCanonicalHistoryWrites(){const tx=Dexie.currentTransaction?.idbtrans;if(tx)writes.add(tx);}
export const canonicalHistoryWrite=(transaction:object)=>writes.has(transaction);
export const metadataHistoryRead=(transaction:object)=>reads.has(transaction);
export const hasHistoryMetadata=(row:NativeRow)=>Object.hasOwn(row,marker);
export const recognizedHistoryMetadata=(row:NativeRow)=>!!row[marker]&&typeof row[marker]==='object'&&(row[marker] as CanonicalMetadata).version===1;

function metadataOf(value:NativeRow):Metadata|undefined {
 const command=(value.delta as {metadata?:CommandRecord}|undefined)?.metadata??value.record as CommandRecord|undefined;
 if(!command)return;
 const {before:_before,after:_after,...metadata}=command;
 return metadata;
}
function validMetadata(metadata:Metadata|undefined,row:NativeRow):metadata is Metadata {
 return !!metadata&&metadata.operationId===row.operationId&&metadata.projectId===row.projectId&&metadata.revision===row.revision
  &&!Object.hasOwn(metadata,'before')&&!Object.hasOwn(metadata,'after')
  &&['operationId','projectId','revision','baseRevision','reason','createdAt'].every(key=>typeof metadata[key as keyof Metadata]==='string')
  &&Array.isArray(metadata.targetIds)&&metadata.targetIds.every(id=>typeof id==='string');
}
function validDescriptor(value:unknown):value is PackedRecord {
 if(!value||typeof value!=='object')return false;
 const packed=value as PackedRecord;
 if(packed.version!==1||typeof packed.scope!=='string'||!packed.scope.startsWith('commands:')||packed.root!==0
  ||!Number.isSafeInteger(packed.nodes)||packed.nodes<1||packed.nodes>4_000_000
  ||!Number.isSafeInteger(packed.strings)||packed.strings<1||packed.strings>4_000_000
  ||!Array.isArray(packed.parts)||!packed.parts.length)return false;
 let bytes=0;
 return packed.parts.every((part,index)=>{
  if(!part||part.key!==`${packed.scope}:${index}`||!['strings','nodes'].includes(part.kind)
   ||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>8*1024*1024||typeof part.sha256!=='string'||!/^[a-f0-9]{64}$/.test(part.sha256))return false;
  bytes+=part.bytes;return bytes<=256*1024*1024;
 });
}
const seal=(row:NativeRow)=>{const value=row[marker] as CanonicalMetadata;return sha256(jsonBytes({...row,[marker]:{version:value.version,metadata:value.metadata}}));};

/** The complete original remains in unchanged v1 parts. Only the native header
 * gains metadata; large metadata itself stays on the original full-read path. */
export async function canonicalHistoryHeader(value:NativeRow,header:NativeRow):Promise<NativeRow> {
 const metadata=metadataOf(value);if(!validMetadata(metadata,header))return header;
 const candidate={...header,[marker]:{version:1,metadata,digest:'0'.repeat(64)}};
 if(needsRecordParts(candidate))return header;
 candidate[marker].digest=await seal(candidate);return candidate;
}

export async function verifyHistoryMetadata(row:NativeRow):Promise<Metadata> {
 if(!recognizedHistoryMetadata(row))return invalid();
 const value=row[marker] as CanonicalMetadata;
 if(!validMetadata(value.metadata,row)||!validDescriptor(row.__scenarioRecordParts)||typeof value.digest!=='string'||value.digest!==await seal(row)
  ||Object.keys(value).length!==3)return invalid();
 return value.metadata;
}

/** Full readers validate body hashes/graph first, then compare actual metadata
 * to the sealed canonical header. Unknown versions never grant a fast path. */
export async function verifyDecodedHistory(row:NativeRow,decoded:NativeRow,plainHeader:NativeRow) {
 const metadata=await verifyHistoryMetadata(row);
 const {[marker]:_metadata,...bodyHeader}=row;
 if(!equalJson(bodyHeader,plainHeader)||!equalJson(metadata,metadataOf(decoded)))return invalid();
}

/** Existence only, never a claim about unread bytes. Runs in the same native
 * transaction as the canonical commands/header read and observes every key. */
export async function verifyHistoryPartKeys(row:NativeRow,transaction:IDBTransaction) {
 const packed=row.__scenarioRecordParts as PackedRecord;
 await Promise.all(packed.parts.map(part=>new Dexie.Promise<void>((resolve,reject)=>{
  const request=transaction.objectStore('recordParts').getKey(part.key);
  request.onsuccess=()=>{probeCount('history.partKeys');probeCount('db.read.calls',1,'recordParts');probeCount('db.read.requested',1,'recordParts');probeCount('db.read.keys',request.result===undefined?0:1,'recordParts');request.result===part.key?resolve():reject(new StorageError('SAVE_FAILED','履歴の分割記録が不足しています。'));};
  request.onerror=()=>reject(request.error);
 })));
}

/** This scoped transaction is used only by historyPage. All other consumers,
 * including the frozen page oracle/rollback adapter, receive complete rows. */
export async function readHistoryPageCommands<T>(db:Dexie,ids:string[]):Promise<T[]> {
 return db.transaction('r',['commands'],async()=>{
  const transaction=Dexie.currentTransaction!.idbtrans;reads.add(transaction);
  try{return await db.table('commands').bulkGet(ids) as T[];}finally{reads.delete(transaction);}
 });
}

export function observeHistoryMetadata(row:NativeRow){probeCount('history.metadata.rows');probePayload('history.metadata.payloadBytes',row);}
