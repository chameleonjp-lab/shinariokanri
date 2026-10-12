import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {createEntity,createProject,newId,textToRichText} from '../domain/model';
import {ScenarioStore} from './store';
import {inspectScenario} from './archive';

const stores:ScenarioStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const s of stores.splice(0))await s.deleteDatabase();});

it('handles a queued browser abort between complete canonical pending hashes and retains all native commands for retry',async()=>{
  const store=new ScenarioStore({databaseName:'hash-task-yield-'+newId()});stores.push(store);
  const p=createProject('連続hashの間も取消を受け取る');p.entities.push(createEntity(p.projectId,'note','初稿',{body:textToRichText('😀元の本文')}));
  let saved=(await store.saveProject(p,{reason:'初稿'})).project;saved.entities[0].name='次稿';saved=(await store.saveProject(saved,{reason:'改稿'})).project;
  const db=(store as unknown as {db:Dexie}).db;
  const capture=async()=>Object.fromEntries(await Promise.all(db.tables.map(async table=>[table.name,await table.toArray()])));
  const before=await capture(),controller=new AbortController();let scheduled=false;
  // Compute the real SHA-256 bytes, but return an already-settled digest
  // Promise to reproduce browser digest completions without a task boundary.
  vi.spyOn(crypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{
    expect(algorithm).toBe('SHA-256');const bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    const hash=createHash('sha256').update(bytes).digest();return hash.buffer.slice(hash.byteOffset,hash.byteOffset+hash.byteLength);
  });
  await expect(store.exportProject(p.projectId,{signal:controller.signal,onProgress:progress=>{
    if(progress.stage==='hashes'&&!scheduled){scheduled=true;setTimeout(()=>controller.abort(),0);}
  }})).rejects.toMatchObject({code:'CANCELLED'});
  expect(scheduled).toBe(true);expect(await capture()).toEqual(before);
  vi.restoreAllMocks();const file=await inspectScenario(await store.exportProject(p.projectId),{worker:false});
  expect(file.project).toEqual(saved);expect(file.recovery?.pending.map(row=>row.operationId)).toEqual(saved.history.map(row=>row.operationId));
  expect(await capture()).toEqual(before);
});
