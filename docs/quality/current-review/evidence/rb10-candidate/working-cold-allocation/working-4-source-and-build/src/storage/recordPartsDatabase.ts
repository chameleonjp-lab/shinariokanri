import Dexie,{type DBCore,type DBCoreCursor,type DBCoreTransaction} from 'dexie';
import {newId} from '../domain/model';
import {packRecord,unpackRecord,needsRecordParts,type PackedRecord,type RecordPart} from './recordParts';
import {StorageError} from './errors';
import {equalJson} from './json';

const marker='__scenarioRecordParts';
const tables=new Set(['commands','outbox','recoveredPending','restorePoints','worlds','snapshots','syncBases','preparedSync','syncConflicts','syncAckEvidence','retainedSyncRecovery','projects','entities']);
type Envelope=Record<string,unknown>&{__scenarioRecordParts:PackedRecord};
const envelope=(value:unknown):value is Envelope=>!!value&&typeof value==='object'&&Object.hasOwn(value,marker);
const signals=new WeakMap<object,AbortSignal>();
export function bindRecordPartsSignal(signal?:AbortSignal){const transaction=Dexie.currentTransaction?.idbtrans;if(transaction&&signal)signals.set(transaction,signal);}
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
   const indexes=[table.schema.primaryKey,...table.schema.indexes];
   const header=(value:Record<string,unknown>,packed:PackedRecord)=>{const result:Record<string,unknown>={[marker]:packed};for(const index of indexes){const paths=typeof index.keyPath==='string'?[index.keyPath]:index.keyPath??[];for(const path of paths){if(path.includes('.'))throw new StorageError('SAVE_FAILED','分割保存の索引形式に対応していません。');if(Object.hasOwn(value,path))result[path]=value[path];}}return result;};
   const decode=async(value:unknown,trans:DBCoreTransaction)=>{if(!envelope(value))return value;const rows=await parts.getMany({trans,keys:value[marker].parts.map(p=>p.key)});if(rows.some(p=>!p))throw new StorageError('SAVE_FAILED','履歴の分割記録が不足しています。');const decoded=await wait(trans,()=>unpackRecord(value[marker],rows,signals.get(trans)));if(!decoded||typeof decoded!=='object'||envelope(decoded)||!equalJson(header(decoded as Record<string,unknown>,value[marker]),value))throw new StorageError('SAVE_FAILED','履歴の分割記録と索引が一致しません。');return decoded;};
   const discard=async(values:unknown[],trans:DBCoreTransaction)=>{const keys=values.flatMap(v=>envelope(v)?v[marker].parts.map(p=>p.key):[]);if(keys.length){const result=await parts.mutate({type:'delete',trans,keys});if(result.numFailures)throw Object.values(result.failures)[0];}};
   return {...table,
    async get(req){return decode(await table.get(req),req.trans);},
    async getMany(req){const rows=await table.getMany(req);let values:unknown[]|undefined;for(let i=0;i<rows.length;i++)if(envelope(rows[i])){values??=rows.slice();values[i]=await decode(rows[i],req.trans);}return values??rows;},
    async query(req){const result=await table.query(req);if(req.values){let rows:unknown[]|undefined;for(let i=0;i<result.result.length;i++)if(envelope(result.result[i])){rows??=result.result.slice();rows[i]=await decode(result.result[i],req.trans);}if(rows)return{...result,result:rows};}return result;},
    async openCursor(req){const cursor=await table.openCursor(req);if(!cursor||!req.values)return cursor;let value=await decode(cursor.value,req.trans);
     const wrapped:DBCoreCursor={get trans(){return cursor.trans;},get key(){return cursor.key;},get primaryKey(){return cursor.primaryKey;},get done(){return cursor.done;},get value(){return value;},continue(key){cursor.continue(key);},continuePrimaryKey(key,primary){cursor.continuePrimaryKey(key,primary);},advance(count){cursor.advance(count);},stop(result){cursor.stop(result);},fail(error){cursor.fail(error);},async next(){await cursor.next();value=await decode(cursor.value,req.trans);return wrapped;},start(onNext){return cursor.start(()=>{void decode(cursor.value,req.trans).then(decoded=>{value=decoded;onNext();},error=>cursor.fail(error));});}};return wrapped;
    },
    async mutate(req){
     let previous:unknown[]=[];
     if(req.type==='put'||req.type==='delete'){const keys=req.keys??(req.type==='put'?req.values.map(v=>table.schema.primaryKey.extractKey?.(v)):[]);previous=await table.getMany({trans:req.trans,keys});}
     if(req.type==='deleteRange')previous=(await table.query({trans:req.trans,values:true,query:{index:table.schema.primaryKey,range:req.range}})).result;
     if(req.type==='add'||req.type==='put'){
      const values:unknown[]=[],newParts:RecordPart[]=[];
      for(const value of req.values){if(envelope(value))throw new StorageError('SAVE_FAILED','内部の分割記録を入力値として保存できません。');if(needsRecordParts(value,threshold)){const packed=await wait(req.trans,()=>packRecord(value,`${name}:${newId()}`,signals.get(req.trans)));values.push(header(value,packed.packed));newParts.push(...packed.parts);}else values.push(value);}
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
