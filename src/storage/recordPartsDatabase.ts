import Dexie,{type DBCore,type DBCoreCursor,type DBCoreTransaction} from 'dexie';
import {newId} from '../domain/model';
import {packRecord,packImportRecord,unpackRecord,needsRecordParts,type PackedRecord,type RecordPart} from './recordParts';
import {StorageError} from './errors';
import {equalJson} from './json';
import {probeCount,probePayload,probeSpan} from '../observability/probe';
import {canonicalHistoryWrite,canonicalHistoryHeader,metadataHistoryRead,hasHistoryMetadata,recognizedHistoryMetadata,verifyHistoryMetadata,verifyDecodedHistory,verifyHistoryPartKeys,observeHistoryMetadata} from './historyMetadata';

const marker='__scenarioRecordParts';
const tables=new Set(['commands','outbox','recoveredPending','restorePoints','worlds','snapshots','syncBases','preparedSync','syncConflicts','syncAckEvidence','retainedSyncRecovery','projects','entities']);
type Envelope=Record<string,unknown>&{__scenarioRecordParts:PackedRecord};
const envelope=(value:unknown):value is Envelope=>!!value&&typeof value==='object'&&Object.hasOwn(value,marker);
const signals=new WeakMap<object,AbortSignal>();
const importPacking=new WeakSet<object>();
export function bindRecordPartsSignal(signal?:AbortSignal){const transaction=Dexie.currentTransaction?.idbtrans;if(transaction&&signal)signals.set(transaction,signal);}
/** Only an import's full command/pending rows share two packing workers.
 * Each row still owns its complete v1 parts and the same native transaction. */
export function bindRecordPartsImport(signal?:AbortSignal){bindRecordPartsSignal(signal);const transaction=Dexie.currentTransaction?.idbtrans;if(transaction)importPacking.add(transaction);}
/** Native row limits are independent of the portable archive quotas. Every
 * part and its row share one IndexedDB transaction, including rollback and
 * legacy rows. Callers always receive the original complete value. */
export function installRecordPartsDatabase(db:Dexie,threshold?:number){
 db.use({stack:'dbcore',name:'scenario-record-parts-v1',level:-2,create(down:DBCore):DBCore{
  if(!down.schema.tables.some(t=>t.name==='recordParts'))return down;
  const parts=down.table('recordParts');
  // A cursor callback can run outside Dexie's promise-local transaction zone.
  // Keep the actual native transaction alive throughout crypto/worker work.
  const wait=<T>(trans:DBCoreTransaction,task:()=>Promise<T>):Promise<T>=>new Promise<T>((resolve,reject)=>{const native=trans as IDBTransaction;let settled=false,value:T,failure:unknown,failed=false;const pump=()=>{try{const request=native.objectStore('recordParts').get('__scenario_keep_alive__');request.onsuccess=()=>{if(settled){failed?reject(failure):resolve(value);return;}pump();};request.onerror=()=>reject(request.error??new StorageError('SAVE_FAILED','履歴のトランザクションを維持できません。'));}catch(error){reject(error);}};pump();try{task().then(result=>{value=result;settled=true;},error=>{failure=error;failed=true;settled=true;});}catch(error){failure=error;failed=true;settled=true;}});
  return {...down,transaction(stores,mode,options){return down.transaction([...new Set([...stores,'recordParts'])],mode,options);},table(name){
   const table=down.table(name);if(!tables.has(name))return table;
   const encoded=(value:unknown)=>envelope(value)||name==='commands'&&!!value&&typeof value==='object'&&hasHistoryMetadata(value as Record<string,unknown>);
   const indexes=[table.schema.primaryKey,...table.schema.indexes];
   const header=(value:Record<string,unknown>,packed:PackedRecord)=>{const result:Record<string,unknown>={[marker]:packed};for(const index of indexes){const paths=typeof index.keyPath==='string'?[index.keyPath]:index.keyPath??[];for(const path of paths){if(path.includes('.'))throw new StorageError('SAVE_FAILED','分割保存の索引形式に対応していません。');if(Object.hasOwn(value,path))result[path]=value[path];}}return result;};
   const decode=async(value:unknown,trans:DBCoreTransaction,metadataOnly=false)=>{
    const native=value as Record<string,unknown>|undefined;
    if(!envelope(value)){
     if(name==='commands'&&native&&hasHistoryMetadata(native))throw new StorageError('SAVE_FAILED','履歴の内部表現が破損しています。');
     if(name==='commands'&&metadataOnly){probeCount('history.legacy.rows',value?1:0);probePayload('history.legacy.payloadBytes',value);}
     return value;
    }
    if(name==='commands'&&metadataOnly&&recognizedHistoryMetadata(value)){
     const metadata=await wait(trans,()=>verifyHistoryMetadata(value));
     await verifyHistoryPartKeys(value,trans as IDBTransaction);observeHistoryMetadata(value);
     return {operationId:value.operationId,projectId:value.projectId,revision:value.revision,delta:{metadata}};
    }
    if(name==='commands'&&metadataOnly){probeCount('history.legacy.rows');probePayload('history.legacy.payloadBytes',value);}
    const rows=await parts.getMany({trans,keys:value[marker].parts.map(p=>p.key)});if(rows.some(p=>!p))throw new StorageError('SAVE_FAILED','履歴の分割記録が不足しています。');
    if(name==='commands'){probeCount('history.body.rows');probeCount('history.body.partRows',rows.length);probeCount('history.body.partBytes',rows.reduce((sum,row)=>sum+(row.bytes?.byteLength??0),0));}
    const finishDecode=probeSpan('decode');const decoded=await wait(trans,()=>unpackRecord(value[marker],rows,signals.get(trans)));finishDecode();probeCount('decode.rows');probePayload('decode.payloadBytes',decoded);
    if(!decoded||typeof decoded!=='object'||envelope(decoded))throw new StorageError('SAVE_FAILED','履歴の分割記録と索引が一致しません。');
    if(name==='commands'&&hasHistoryMetadata(value))await wait(trans,()=>verifyDecodedHistory(value,decoded as Record<string,unknown>,header(decoded as Record<string,unknown>,value[marker])));
    else if(!equalJson(header(decoded as Record<string,unknown>,value[marker]),value))throw new StorageError('SAVE_FAILED','履歴の分割記録と索引が一致しません。');
    return decoded;
   };
   const packedHeader=(value:Record<string,unknown>,packed:PackedRecord,trans:DBCoreTransaction)=>name==='commands'&&canonicalHistoryWrite(trans)
    ?canonicalHistoryHeader(value,header(value,packed)):header(value,packed);
   const discard=async(values:unknown[],trans:DBCoreTransaction)=>{const keys=values.flatMap(v=>envelope(v)?v[marker].parts.map(p=>p.key):[]);if(keys.length){const result=await parts.mutate({type:'delete',trans,keys});if(result.numFailures)throw Object.values(result.failures)[0];}};
   return {...table,
    async get(req){return decode(await table.get(req),req.trans);},
    async getMany(req){
     const metadataOnly=name==='commands'&&metadataHistoryRead(req),rows=await table.getMany(req);let values:unknown[]|undefined;
     for(let i=0;i<rows.length;i++)if(encoded(rows[i])){values??=rows.slice();values[i]=await decode(rows[i],req.trans,metadataOnly);}
     else if(metadataOnly&&rows[i]!==undefined){probeCount('history.legacy.rows');probePayload('history.legacy.payloadBytes',rows[i]);}
     return values??rows;
    },
    async query(req){const result=await table.query(req);if(req.values){let rows:unknown[]|undefined;for(let i=0;i<result.result.length;i++)if(encoded(result.result[i])){rows??=result.result.slice();rows[i]=await decode(result.result[i],req.trans);}if(rows)return{...result,result:rows};}return result;},
    async openCursor(req){const cursor=await table.openCursor(req);if(!cursor||!req.values)return cursor;let value=await decode(cursor.value,req.trans);
     const wrapped:DBCoreCursor={get trans(){return cursor.trans;},get key(){return cursor.key;},get primaryKey(){return cursor.primaryKey;},get done(){return cursor.done;},get value(){return value;},continue(key){cursor.continue(key);},continuePrimaryKey(key,primary){cursor.continuePrimaryKey(key,primary);},advance(count){cursor.advance(count);},stop(result){cursor.stop(result);},fail(error){cursor.fail(error);},async next(){await cursor.next();value=await decode(cursor.value,req.trans);return wrapped;},start(onNext){return cursor.start(()=>{void decode(cursor.value,req.trans).then(decoded=>{value=decoded;onNext();},error=>cursor.fail(error));});}};return wrapped;
    },
    async mutate(req){
     let previous:unknown[]=[];
     if(req.type==='put'||req.type==='delete'){const keys=req.keys??(req.type==='put'?req.values.map(v=>table.schema.primaryKey.extractKey?.(v)):[]);previous=await table.getMany({trans:req.trans,keys});}
     if(req.type==='deleteRange')previous=(await table.query({trans:req.trans,values:true,query:{index:table.schema.primaryKey,range:req.range}})).result;
     if(req.type==='add'||req.type==='put'){
      const values:unknown[]=[],newParts:RecordPart[]=[];
      const pack=importPacking.has(req.trans)&&(name==='commands'||name==='recoveredPending')?packImportRecord:packRecord;
      if(importPacking.has(req.trans)&&(name==='commands'||name==='recoveredPending')&&req.values.length>1){
       // The importer submits row pairs, bounding additional live captures.
       // Larger direct bulk requests still start at most two workers at once.
       for(let index=0;index<req.values.length;index+=2){
        const batch=await wait(req.trans,()=>Promise.allSettled(req.values.slice(index,index+2).map(async value=>{
         if(encoded(value))throw new StorageError('SAVE_FAILED','内部の分割記録を入力値として保存できません。');
         if(!needsRecordParts(value,threshold))return{value,parts:[] as RecordPart[]};
         const packed=await pack(value,`${name}:${newId()}`,signals.get(req.trans));
         return{value:await packedHeader(value,packed.packed,req.trans),parts:packed.parts};
        })));
        // Settle the bounded pair before propagating a failure. No packing
        // worker outlives this request, including cancellation and rollback.
        for(const item of batch)if(item.status==='rejected')throw item.reason;
        for(const item of batch)if(item.status==='fulfilled'){values.push(item.value.value);newParts.push(...item.value.parts);}
       }
      }else for(const value of req.values){if(encoded(value))throw new StorageError('SAVE_FAILED','内部の分割記録を入力値として保存できません。');if(needsRecordParts(value,threshold)){const packed=await wait(req.trans,()=>pack(value,`${name}:${newId()}`,signals.get(req.trans)));values.push(name==='commands'&&canonicalHistoryWrite(req.trans)?await wait(req.trans,()=>canonicalHistoryHeader(value,header(value,packed.packed))):header(value,packed.packed));newParts.push(...packed.parts);}else values.push(value);}
      const finalRows=new Map<string,unknown>();values.forEach((value,index)=>{const key=req.keys?.[index]??table.schema.primaryKey.extractKey?.(value);finalRows.set(JSON.stringify(key),value);});const retainedScopes=new Set([...finalRows.values()].flatMap(value=>envelope(value)?[value[marker].scope]:[]));const retainedParts=newParts.filter(part=>retainedScopes.has(part.scope));
      if(retainedParts.length){const result=await parts.mutate({type:'add',trans:req.trans,values:retainedParts});if(result.numFailures)throw Object.values(result.failures)[0];}
      const result=await table.mutate({...req,values});if(result.numFailures){req.trans.abort();return result;}await discard(previous,req.trans);return result;
     }
     const result=await table.mutate(req);if(result.numFailures){req.trans.abort();return result;}await discard(previous,req.trans);return result;
    },
   };
  }};
 }});
}
