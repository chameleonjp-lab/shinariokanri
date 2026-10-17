import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {installRecordPartsDatabase,bindRecordPartsSignal} from '../../src/storage/recordPartsDatabase';
import {startProbe} from '../../src/observability/probe';
import {growthProject,historySeries} from './fixtures';
import {originalHistoryPage} from './history-page-oracle';
import {bindCanonicalHistoryWrites,readHistoryPageCommands,canonicalHistoryHeader,verifyHistoryMetadata} from '../../src/storage/historyMetadata';
import {inspectScenario} from '../../src/storage/archive';
import {jsonBytes,sha256} from '../../src/storage/json';
import {packRecordData} from '../../src/storage/recordPartsCore';
import {nativeDocuments} from '../../src/sync/nativeBridge';
import {valueHash,type SyncSession} from '../../src/sync/protocol';
import {ContractSyncServer} from '../../src/sync/testing';

const stores:ScenarioStore[]=[];
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
function open(accountId?:string){const store=new ScenarioStore({databaseName:'p204-'+crypto.randomUUID(),accountId});installRecordPartsDatabase(raw(store),512);stores.push(store);return store;}
afterEach(async()=>{vi.restoreAllMocks();for(const store of stores.splice(0))await store.deleteDatabase();});
async function nativeRows(db:Dexie,table:string){return new Promise<any[]>((resolve,reject)=>{const tx=db.backendDB().transaction(table,'readonly'),req=tx.objectStore(table).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function nativePut(db:Dexie,table:string,value:unknown){return new Promise<void>((resolve,reject)=>{const tx=db.backendDB().transaction(table,'readwrite');tx.objectStore(table).put(value);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
async function saved(){const store=open();let project=growthProject();for(const reason of ['初稿','ＡＢＣ日本語','最終稿'])project=(await store.saveProject({...project,name:reason},{reason,includeHistory:false})).project;return{store,project,db:raw(store)};}

it('stores canonical metadata for newly packed commands and reads all metadata without loading body parts',async()=>{
 const {store,project,db}=await saved(),rows=await nativeRows(db,'commands');
 expect(rows).toHaveLength(3);expect(rows.every(row=>row.__scenarioCommandMetadata?.version===1)).toBe(true);
 const bodyKeys=new Set(rows.flatMap(row=>row.__scenarioRecordParts.parts.map((part:{key:string})=>part.key))),gets=vi.spyOn(IDBObjectStore.prototype,'get');
 const capture=startProbe();let result;try{result=await store.historyPage(project.projectId,{size:1});}finally{capture.stop();}
 expect(result).toMatchObject({total:3,page:0,maximum:2,entries:[{reason:'最終稿',revision:'3'}]});
 expect(gets.mock.calls.filter(([key],i)=>(gets.mock.contexts[i] as IDBObjectStore).name==='recordParts'&&bodyKeys.has(key))).toHaveLength(0);
 // A packed PROJECT header can still require part payload reads.
 expect(capture.snapshot().counters['history.header.payloadBytes']).toBeGreaterThan(0);
 expect(capture.snapshot().counters['history.body.partRows']??0).toBe(0);
 expect(capture.snapshot().counters['history.metadata.rows']).toBe(3);
 expect(capture.snapshot().counters['history.partKeys']).toBeGreaterThan(0);
});

it('matches the frozen full-reader oracle for every page, Japanese normalization, identity/date queries and invalid bounds',async()=>{
 const {store,project,db}=await saved();
 for(const query of ['', 'abc日本語','初稿','missing',project.projectId,project.history[0]?.operationId??'2026'])for(const size of [1,2,30,60])for(const page of [0,1,2,99])expect(await store.historyPage(project.projectId,{query,size,page})).toEqual(await originalHistoryPage(db,project.projectId,{query,size,page}));
 expect((await store.historyPage(project.projectId,{query:'abc日本語'})).entries.map(row=>row.reason)).toEqual(['ＡＢＣ日本語']);
 for(const options of [{page:-1},{page:0.5},{page:NaN},{size:0},{size:61},{size:Infinity}]){
  await expect(store.historyPage(project.projectId,options)).rejects.toMatchObject({code:'VALIDATION_FAILED'});
  await expect(originalHistoryPage(db,project.projectId,options)).rejects.toMatchObject({code:'VALIDATION_FAILED'});
 }
});

it.each(['metadata','project','operation','descriptor'])('rejects off-page canonical %s corruption without changing any native rows',async field=>{
 const {store,project,db}=await saved(),rows=await nativeRows(db,'commands'),row=rows.find(row=>row.revision==='1');
 expect(row.__scenarioCommandMetadata).toBeDefined();
 if(field==='metadata')row.__scenarioCommandMetadata.metadata.reason='stale';
 if(field==='project')row.projectId='other';if(field==='operation')row.__scenarioCommandMetadata.metadata.operationId='other';
 if(field==='descriptor')row.__scenarioRecordParts.parts[0].sha256='0'.repeat(64);
 await nativePut(db,'commands',row);const before=await nativeRows(db,'commands');
 await expect(store.historyPage(project.projectId,{size:1})).rejects.toMatchObject({code:'SAVE_FAILED'});
 expect(await nativeRows(db,'commands')).toEqual(before);
});

it.each(['command','part'])('rejects missing off-page canonical %s',async kind=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands')).find(row=>row.revision==='1');
 if(kind==='command')await db.table('commands').delete(row.operationId);else await db.table('recordParts').delete(row.__scenarioRecordParts.parts[0].key);
 await expect(store.historyPage(project.projectId,{size:1})).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('marks canonical body bytes unloaded until selected/full decoding; it does not mistake the metadata seal for body integrity',async()=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands')).find(row=>row.revision==='1'),key=row.__scenarioRecordParts.parts[0].key,part=await db.table('recordParts').get(key);
 part.bytes[0]^=1;await db.table('recordParts').put(part);
 expect((await store.historyPage(project.projectId,{size:1})).total).toBe(3);
 await expect(store.historyCommand(project.projectId,row.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(originalHistoryPage(db,project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 store.close();await db.open();await expect(store.getProject(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(store.exportProject(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('keeps exact legacy direct fixtures and full legacy packed-body failure semantics',async()=>{
 const store=open(),db=raw(store),series=historySeries(100);
 await db.transaction('rw',['projects','commands'],async()=>{await db.table('projects').put(series.header);await db.table('commands').bulkPut(series.rows);});
 const rows=await nativeRows(db,'commands');expect(rows.every(row=>!row.__scenarioCommandMetadata)).toBe(true);
 expect(await db.table('commands').bulkGet(series.header.historyIds)).toEqual(series.rows);
 expect((await store.historyPage(series.header.projectId)).entries.map(row=>row.revision)).toEqual(Array.from({length:30},(_,i)=>String(100-i)));
 const part=await db.table('recordParts').get(rows[0].__scenarioRecordParts.parts[0].key);part.bytes[0]^=1;await db.table('recordParts').put(part);
 await expect(store.historyPage(series.header.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('retains exact full commands through query, cursor and cold readers and can atomically rewrite for an old decoder',async()=>{
 const {store,project,db}=await saved(),commands=await db.table('commands').toArray();
 expect(await db.table('commands').where('projectId').equals(project.projectId).toArray()).toEqual(commands);
 expect(await db.table('commands').filter(row=>row.projectId===project.projectId).toArray()).toEqual(commands);
 const before=await nativeRows(db,'commands'),parts=await nativeRows(db,'recordParts');
 await expect(db.transaction('rw',['commands'],async()=>{await db.table('commands').bulkPut(commands);throw Error('rewrite interrupted');})).rejects.toThrow('rewrite interrupted');
 expect(await nativeRows(db,'commands')).toEqual(before);expect(await nativeRows(db,'recordParts')).toEqual(parts);
 await db.transaction('rw',['commands'],async()=>{await db.table('commands').bulkPut(commands);});
 expect((await nativeRows(db,'commands')).every(row=>!row.__scenarioCommandMetadata)).toBe(true);
 expect(await db.table('commands').toArray()).toEqual(commands);store.close();await db.open();
 expect((await store.getProject(project.projectId))?.history.map(row=>row.reason)).toEqual(['初稿','ＡＢＣ日本語','最終稿']);
});

it.each([null,{version:2},{version:1},'invalid'])('does not let a malformed or unknown marker bypass the full-reader contract: %j',async marker=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands'))[0];row.__scenarioCommandMetadata=marker;await nativePut(db,'commands',row);
 await expect(store.historyPage(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(db.table('commands').get(row.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('rejects a marker on a legacy inline row instead of trusting an unrecognized derivative',async()=>{
 const store=new ScenarioStore({databaseName:'p204-inline-'+crypto.randomUUID()});stores.push(store);const db=raw(store),series=historySeries(100);
 await db.table('projects').put(series.header);await db.table('commands').bulkAdd(series.rows);
 const row=(await nativeRows(db,'commands'))[0];row.__scenarioCommandMetadata={version:1,metadata:row.delta.metadata,digest:'0'.repeat(64)};await nativePut(db,'commands',row);
 await expect(store.historyPage(series.header.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('checks actual full-body metadata against a self-consistent but stale envelope at the full verification point',async()=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands'))[0];
 row.__scenarioCommandMetadata.metadata.reason='altered canonical header';
 row.__scenarioCommandMetadata.digest=await sha256(jsonBytes({...row,__scenarioCommandMetadata:{version:1,metadata:row.__scenarioCommandMetadata.metadata}}));
 await nativePut(db,'commands',row);
 // A checksum is not authentication/body validation; the page describes the canonical metadata.
 expect((await store.historyPage(project.projectId,{query:'altered canonical header'})).total).toBe(1);
 await expect(store.historyCommand(project.projectId,row.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(store.exportProject(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 store.close();await db.open();await expect(store.getProject(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it.each(['interruption','quota'])('keeps legacy rows and every part when optional canonical rewriting fails by %s',async failure=>{
 const store=open(),db=raw(store),series=historySeries(100);
 await db.table('projects').put(series.header);await db.table('commands').bulkAdd(series.rows);
 const rows=await nativeRows(db,'commands'),parts=await nativeRows(db,'recordParts');
 await expect(db.transaction('rw',['commands'],async()=>{
  const originals=await db.table('commands').bulkGet(series.header.historyIds);bindCanonicalHistoryWrites();await db.table('commands').put(originals[0]);
  throw failure==='quota'?new DOMException('simulated quota','QuotaExceededError'):new Error('rewrite interrupted');
 })).rejects.toThrow();
 expect(await nativeRows(db,'commands')).toEqual(rows);expect(await nativeRows(db,'recordParts')).toEqual(parts);
 expect((await store.historyPage(series.header.projectId)).total).toBe(100);
});

it('retains parent traversal and checkpoints through mixed canonical/legacy history and rejects a parent cycle',async()=>{
 const store=open(),db=raw(store),series=historySeries(100);
 await db.table('projects').put(series.header);await db.table('commands').bulkAdd(series.rows);
 await db.transaction('rw',['commands'],async()=>{const rows=await db.table('commands').bulkGet(series.header.historyIds);bindCanonicalHistoryWrites();await db.table('commands').bulkPut(rows.filter((_,i)=>i%2===0));});
 for(const index of [0,62,63,64,65,99])expect((await store.historyCommand(series.header.projectId,series.header.historyIds[index])).after.name).toBe(`履歴${index+1}`);
 expect((await db.table('commands').get(series.header.historyIds[64])).delta.checkpoint.revision).toBe('64');
 const cyclic=await db.table('commands').get(series.header.historyIds[1]);cyclic.delta.parentOperationId=cyclic.operationId;
 await db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();await db.table('commands').put(cyclic);});
 await expect(store.historyCommand(series.header.projectId,cyclic.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('preserves exact imported bodies, clone identity, outbox and cold full export with canonical storage',async()=>{
 const {store,project}=await saved(),prepared=await inspectScenario(await store.exportProject(project.projectId),{worker:false}),target=open(),db=raw(target);
 const restored=await target.importScenario(prepared,{mode:'new'});
 expect((await nativeRows(db,'commands')).some(row=>row.__scenarioCommandMetadata?.version===1)).toBe(true);
 expect((await target.getProject(restored.project.projectId))?.history).toEqual(prepared.project.history);
 expect(await target.listRecoveredPending(project.projectId)).toHaveLength(3);
 const cloned=await target.importScenario(prepared,{mode:'clone'});expect(cloned.project.projectId).not.toBe(project.projectId);
 expect((await target.historyPage(cloned.project.projectId)).total).toBe(4); // Three imported operations plus the original clone operation.
 target.close();await db.open();const cold=await inspectScenario(await target.exportProject(project.projectId),{worker:false});
 expect(cold.project.history).toEqual(prepared.project.history);expect(cold.project.entities).toEqual(prepared.project.entities);
});

it.each([false,true])('keeps the production threshold and original v1 body bytes; oversized metadata fallback=%s',async oversizedMetadata=>{
 const store=new ScenarioStore({databaseName:'p204-native-bound-'+crypto.randomUUID()});stores.push(store);const db=raw(store),series=historySeries(100),row=structuredClone(series.rows[0]) as any;
 const large='x'.repeat(4_194_305);
 if(oversizedMetadata)row.delta.metadata.reason=large;else row.delta.checkpoint.name=large;
 await db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();await db.table('commands').add(row);});
 const native=(await nativeRows(db,'commands'))[0];expect(!!native.__scenarioCommandMetadata).toBe(!oversizedMetadata);
 const original=await packRecordData(row,native.__scenarioRecordParts.scope);
 expect(native.__scenarioRecordParts).toEqual(original.packed);
 const actual=await db.table('recordParts').toArray();expect(actual).toHaveLength(original.parts.length);
 for(const [index,part] of actual.entries()){
  const {bytes,...metadata}=part,{bytes:expectedBytes,...expectedMetadata}=original.parts[index];
  expect(metadata).toEqual(expectedMetadata);expect(bytes.byteLength).toBe(expectedBytes.byteLength);
  expect(bytes.every((byte:number,offset:number)=>byte===expectedBytes[offset])).toBe(true);
 }
 expect(await db.table('commands').get(row.operationId)).toEqual(row);
});

it('rejects malformed descriptors even when their checksum is recomputed',async()=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands'))[0];row.__scenarioRecordParts.parts[0].key='foreign:0';
 row.__scenarioCommandMetadata.digest=await sha256(jsonBytes({...row,__scenarioCommandMetadata:{version:1,metadata:row.__scenarioCommandMetadata.metadata}}));
 await nativePut(db,'commands',row);await expect(store.historyPage(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('covers local ACK merge and confirmed sync resolution writers with canonical rows (contract server only)',async()=>{
 const accountId=crypto.randomUUID(),session:SyncSession={accountId,authenticated:true,generation:crypto.randomUUID()},a=open(accountId),b=open(accountId),input=growthProject(),id=input.entities[0].id;
 const left=(await a.saveProject(input,{reason:'初期A'})).project,right=(await b.saveProject(input,{reason:'初期B'})).project,documents=nativeDocuments(left,'1'),server=new ContractSyncServer();
 server.seed({projectId:input.projectId,revision:'1',documents,members:{[accountId]:'owner'}});
 for(const [store,project] of [[a,left],[b,right]] as const)await store.bindConfirmedProject({projectId:project.projectId,serverRevision:'1',documents,contentHash:await valueHash(documents),localRevision:project.revision,outboxIds:(await store.listOutbox(project.projectId)).map(row=>row.operationId)});
 const send=async(store:ScenarioStore)=>{const operation=(await store.prepareSavedOperations(input.projectId))!;const ack=await server.send(operation,session);await store.commitPreparedAck(input.projectId,ack);return ack;};
 const rename=async(store:ScenarioStore,name:string)=>{const p=(await store.getProject(input.projectId))!;p.entities[0].name=name;await store.saveProject(p,{reason:name});};
 await rename(a,'端末A改名');await send(a);
 const draft=(await b.getProject(input.projectId))!;draft.name='端末B作品名';await b.saveProject(draft,{reason:'作品名変更'});
 const beforeAck=new Set((await nativeRows(raw(b),'commands')).map(row=>row.operationId));await send(b);
 const merged=(await b.getProject(input.projectId))!;expect(merged.name).toBe('端末B作品名');expect(merged.entities[0].name).toBe('端末A改名');
 const addedAck=(await nativeRows(raw(b),'commands')).filter(row=>!beforeAck.has(row.operationId));expect(addedAck).toHaveLength(1);expect(addedAck[0].__scenarioCommandMetadata.version).toBe(1);
 await rename(a,'競合A');await send(a);await rename(b,'競合B');await send(b);
 const conflict=(await b.listSyncConflictAlternatives(input.projectId))[0];expect(conflict).toBeDefined();
 const plan=await b.previewSyncResolution(input.projectId,conflict.operationId,{[id]:{strategy:'server'}}),beforeResolution=new Set((await nativeRows(raw(b),'commands')).map(row=>row.operationId));
 await b.confirmSyncResolution(plan);
 const addedResolution=(await nativeRows(raw(b),'commands')).filter(row=>!beforeResolution.has(row.operationId));expect(addedResolution).toHaveLength(1);expect(addedResolution[0].__scenarioCommandMetadata.version).toBe(1);
 expect((await b.getProject(input.projectId))?.entities[0].name).toBe('競合A');
 expect(await b.historyPage(input.projectId)).toEqual(await originalHistoryPage(raw(b),input.projectId));
});

it.each(['r','rw'] as const)('keeps concurrent full readers complete inside the same parent %s transaction while a page seal is pending',async mode=>{
 const {store: _store,db}=await saved(),originals=await db.table('commands').toArray(),ids=originals.map(row=>row.operationId);
 let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const digest=crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{entered();await gate;return digest(...args);});
 await db.transaction(mode,['commands'],async()=>{
  const page=readHistoryPageCommands(db,ids);await ready;
  let full:any[];
  try{full=await Promise.all([db.table('commands').get(ids[0]),db.table('commands').bulkGet(ids),db.table('commands').where('projectId').equals(originals[0].projectId).toArray(),db.table('commands').filter(()=>true).toArray()]);}
  finally{release();await page;}
  expect(full![0]).toEqual(originals[0]);expect(full![1]).toEqual(originals);expect(full![2]).toEqual(originals);expect(full![3]).toEqual(originals);
 });
 expect(await db.table('commands').bulkGet(ids)).toEqual(originals);
});

it.each(['optional','idMap','importOrigin'] as const)('retains own undefined %s metadata on exact legacy fallback rather than sealing lossy JSON',async variant=>{
 const store=open(),db=raw(store),row=structuredClone(historySeries(100).rows[0]) as any;
 if(variant==='optional')row.delta.metadata.compensatesOperationId=undefined;
 if(variant==='idMap')row.delta.metadata.idMap={source:undefined};
 if(variant==='importOrigin')row.delta.metadata.importOrigin={sourceProjectId:row.projectId,sourceOperationId:row.operationId,importOperationId:undefined};
 await db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();await db.table('commands').add(row);});
 expect((await nativeRows(db,'commands'))[0].__scenarioCommandMetadata).toBeUndefined();
 expect(await db.table('commands').get(row.operationId)).toStrictEqual(row);
 expect((await readHistoryPageCommands(db,[row.operationId]))[0]).toStrictEqual(row);
});

it('rejects an own undefined metadata mutation even when canonical JSON bytes and digest remain identical',async()=>{
 const {store,project,db}=await saved(),row=(await nativeRows(db,'commands'))[0],before=jsonBytes(row);
 row.__scenarioCommandMetadata.metadata.compensatesOperationId=undefined;
 expect(jsonBytes(row)).toEqual(before);await nativePut(db,'commands',row);
 await expect(store.historyPage(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(store.historyCommand(project.projectId,row.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it.each([100,1000,10000] as const)('counts every unchanged direct legacy row exactly once for %i histories',async count=>{
 const store=new ScenarioStore({databaseName:'p204-legacy-count-'+crypto.randomUUID()});stores.push(store);const db=raw(store),series=historySeries(count);
 await db.transaction('rw',['projects','commands'],async()=>{await db.table('projects').put(series.header);await db.table('commands').bulkAdd(series.rows);});
 const probe=startProbe();try{
  const page=await store.historyPage(series.header.projectId);expect(page.entries[0].revision).toBe(String(count));
  const counters=probe.snapshot().counters;expect(counters['history.legacy.rows']).toBe(count);expect(counters['db.read.rows.commands']).toBe(count);
  expect(counters['history.legacy.payloadBytes']).toBeGreaterThan(0);expect(counters['history.metadata.rows']??0).toBe(0);expect(counters['history.body.partRows']??0).toBe(0);
 }finally{probe.stop();}
});

it('does not expose a metadata-only row to normal reading hooks',async()=>{
 const {store,project,db}=await saved(),read=vi.fn(value=>value);db.table('commands').hook('reading',read);
 try{
  await store.historyPage(project.projectId);expect(read).not.toHaveBeenCalled();
  const commands=await db.table('commands').toArray();expect(read).toHaveBeenCalledTimes(3);
  expect(commands.every(row=>row.delta.patch&&row.requestHash)).toBe(true);
 }finally{db.table('commands').hook('reading').unsubscribe(read);}
});

it('matches all canonical pages and literal order for an equivalent separately encoded 100-command series',async()=>{
 const store=open(),db=raw(store),series=historySeries(100);
 await db.transaction('rw',['projects','commands'],async()=>{await db.table('projects').put(series.header);bindCanonicalHistoryWrites();await db.table('commands').bulkAdd(series.rows);});
 expect((await nativeRows(db,'commands')).every(row=>row.__scenarioCommandMetadata?.version===1)).toBe(true);
 for(const query of ['', '計測変更1', 'not-found'])for(const size of [30,60])for(let page=0;page<=Math.ceil(100/size);page++)expect(await store.historyPage(series.header.projectId,{query,page,size})).toStrictEqual(await originalHistoryPage(db,series.header.projectId,{query,page,size}));
 expect((await store.historyPage(series.header.projectId,{page:3})).entries.map(row=>row.revision)).toEqual(['10','9','8','7','6','5','4','3','2','1']);
});

it('rolls back packed canonical command, all parts, content and outbox together at a final quota failure',async()=>{
 let fail=false;const store=new ScenarioStore({databaseName:'p204-final-quota-'+crypto.randomUUID(),faultInjector:stage=>{if(fail&&stage==='before-commit')throw new DOMException('simulated quota','QuotaExceededError');}});stores.push(store);const db=raw(store);installRecordPartsDatabase(db,512);
 const saved=(await store.saveProject(growthProject(),{reason:'保持する旧稿'})).project,tables=['projects','commands','recordParts','outbox'],before=await Promise.all(tables.map(table=>nativeRows(db,table)));
 fail=true;await expect(store.saveProject({...saved,name:'失敗する新稿'},{reason:'保存失敗'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
 expect(await Promise.all(tables.map(table=>nativeRows(db,table)))).toStrictEqual(before);
 store.close();await db.open();expect(await store.getProject(saved.projectId)).toStrictEqual(saved);
});

it('retains exact accepted optional metadata including import origin and rejects a cancelled rewrite without mutation',async()=>{
 const store=open(),db=raw(store),row=structuredClone(historySeries(100).rows[0]) as any;
 const optional={compensatesOperationId:row.operationId,idMap:{[row.operationId]:row.projectId},importOrigin:{sourceProjectId:row.projectId,sourceOperationId:row.operationId,importOperationId:row.operationId}};
 Object.assign(row.delta.metadata,optional);
 await db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();await db.table('commands').add(row);});
 const native=await nativeRows(db,'commands'),parts=await nativeRows(db,'recordParts');expect(native[0].__scenarioCommandMetadata.version).toBe(1);
 expect((await readHistoryPageCommands(db,[row.operationId]))[0]?.delta?.metadata).toStrictEqual(row.delta.metadata);
 expect(await db.table('commands').get(row.operationId)).toStrictEqual(row);
 const controller=new AbortController();controller.abort();
 await expect(db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();bindRecordPartsSignal(controller.signal);await db.table('commands').put(row);})).rejects.toMatchObject({code:'CANCELLED'});
 expect(await nativeRows(db,'commands')).toStrictEqual(native);expect(await nativeRows(db,'recordParts')).toStrictEqual(parts);
});

it('counts canonical writer attempts and seals separately from page/full-reader verification',async()=>{
 const probe=startProbe();try{
  const {store,project}=await saved(),writes=probe.snapshot().counters;
  expect(writes['history.write.candidates']).toBe(3);expect(writes['history.write.canonical']).toBe(3);
  expect(writes['history.write.sealCalls']).toBe(3);expect(writes['history.write.sealBytes']).toBeGreaterThan(0);
  await store.historyPage(project.projectId);await originalHistoryPage(raw(store),project.projectId);
  expect(probe.snapshot().counters['history.write.sealCalls']).toBe(3);expect(probe.snapshot().counters['history.write.sealBytes']).toBe(writes['history.write.sealBytes']);
 }finally{probe.stop();}
});

it.each(['targetIds','parts'] as const)('rejects sparse %s with compensating extra properties even after a recomputed seal',async kind=>{
 const {store,project,db}=await saved(),native=(await nativeRows(db,'commands'))[0],full=await db.table('commands').get(native.operationId);
 const sparse:any[]=[kind==='targetIds'?project.projectId:native.__scenarioRecordParts.parts[0]];sparse.length=2;(sparse as any).extra='compensates for hole';
 if(kind==='targetIds'){
  const originalHeader={...native};delete originalHeader.__scenarioCommandMetadata;full.delta.metadata.targetIds=sparse;
  expect(await canonicalHistoryHeader(full,originalHeader)).toStrictEqual(originalHeader);
  native.__scenarioCommandMetadata.metadata.targetIds=sparse;
 }else native.__scenarioRecordParts.parts=sparse;
 native.__scenarioCommandMetadata.digest=await sha256(jsonBytes({...native,__scenarioCommandMetadata:{version:1,metadata:native.__scenarioCommandMetadata.metadata}}));await nativePut(db,'commands',native);
 await expect(store.historyPage(project.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it.each(['map','date','set','typedarray'] as const)('rejects %s idMap state omitted by canonical JSON with the same digest',async kind=>{
 const store=open(),db=raw(store),series=historySeries(100),full=structuredClone(series.rows[0]) as any;full.delta.metadata.idMap={};
 await db.table('projects').put(series.header);await db.table('commands').bulkAdd(series.rows.slice(1));await db.transaction('rw',['commands'],async()=>{bindCanonicalHistoryWrites();await db.table('commands').add(full);});
 const native=(await nativeRows(db,'commands')).find(row=>row.operationId===full.operationId),before=jsonBytes(native),plainHeader={...native};delete plainHeader.__scenarioCommandMetadata;
 const exotic=kind==='map'?new Map([['x','y']]):kind==='date'?new Date('2020-01-01'):kind==='set'?new Set(['x']):new Uint8Array();
 full.delta.metadata.idMap=exotic;expect(await canonicalHistoryHeader(full,plainHeader)).toStrictEqual(plainHeader);
 native.__scenarioCommandMetadata.metadata.idMap=exotic;expect(jsonBytes(native)).toEqual(before);await nativePut(db,'commands',native);
 await expect(store.historyPage(series.header.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
 await expect(store.historyCommand(series.header.projectId,full.operationId)).rejects.toMatchObject({code:'SAVE_FAILED'});
});

it('applies the same plain-record gate to importOrigin before native structured clone',async()=>{
 const {db}=await saved(),native=(await nativeRows(db,'commands'))[0],full=await db.table('commands').get(native.operationId),header={...native};delete header.__scenarioCommandMetadata;
 const origin={sourceProjectId:full.projectId,sourceOperationId:full.operationId,importOperationId:full.operationId};full.delta.metadata.importOrigin=origin;
 const canonical=await canonicalHistoryHeader(full,header),before=jsonBytes(canonical);
 const exotic=Object.assign(new Date('2020-01-01'),origin);full.delta.metadata.importOrigin=exotic;
 expect(await canonicalHistoryHeader(full,header)).toStrictEqual(header);
 (canonical.__scenarioCommandMetadata as any).metadata.importOrigin=exotic;expect(jsonBytes(canonical)).toEqual(before);
 await expect(verifyHistoryMetadata(canonical)).rejects.toMatchObject({code:'SAVE_FAILED'});
});
