import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {probeEnabled,probePayload,probeSync,probeCount,probeCounter,probeSpan,probeWorkerStart,probeWorkerMessages,startProbe, type ProbeSnapshot} from '../../src/observability/probe';
import {ScenarioStore} from '../../src/storage/store';
import {inspectScenario} from '../../src/storage/archive';
import {createProjectValidator,validateCurrentProject,validateProject} from '../../src/domain/model';
import {filterCatalogEntities} from '../../src/domain/catalog';
import {referenceChoices} from '../../src/domain/referenceChoices';
import {createWorldSnapshot,previewWorldVersion} from '../../src/domain/world';
import {freezeCapturedPlainData} from '../../src/domain/immutablePlainData';
import {growthProject,historySeries,GROWTH_MANIFEST} from './fixtures';

const stores:ScenarioStore[]=[];
let capture:ReturnType<typeof startProbe>|undefined;
const open=()=>{const store=new ScenarioStore({databaseName:`phase1-test-${crypto.randomUUID()}`});stores.push(store);return store;};
const db=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const sum=(value:ProbeSnapshot,prefix:string)=>Object.entries(value.counters).filter(([key])=>key.startsWith(prefix)).reduce((total,[,n])=>total+n,0);
afterEach(async()=>{capture?.stop();capture=undefined;vi.useRealTimers();vi.restoreAllMocks();for(const store of stores.splice(0))await store.deleteDatabase();});

it('is off by default, never reads a disabled payload, and preserves return/error identity',()=>{
  expect(probeEnabled()).toBe(false);
  probePayload('copy.payloadBytes',new Proxy({}, {ownKeys(){throw new Error('Must not inspect');}}));
  const marker={value:1},error=new Error('synthetic private message');
  expect(probeSync('copy',()=>marker)).toBe(marker);
  capture=startProbe();expect(probeSync('copy',()=>marker)).toBe(marker);
  expect(()=>probeSync('copy',()=>{throw error;})).toThrow(error);
  expect(capture.stop().events.map(row=>row.outcome)).toEqual(['ok','error']);
});

it('allows only fixed numeric dimensions, does not invoke accessors, and bounds retained events',()=>{
  capture=startProbe();const getter=vi.fn(()=> 'SYNTHETIC_PRIVATE_CANARY');
  const input={get secret(){return getter();}};probePayload('copy.payloadBytes',input);
  probeCount('AUTH_TOKEN' as never,100);probeCount('hash.bytes',NaN);probeCount('hash.bytes',-1);probeCount('hash.bytes',2,'PRIVATE_ACCOUNT' as never);
  for(let i=0;i<10001;i++)probeSpan('copy')();
  const result=capture.stop();expect(getter).not.toHaveBeenCalled();expect(result.events).toHaveLength(10000);expect(result.droppedEvents).toBe(1);
  expect(result.counters['probe.size.unknown']).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(/CANARY|AUTH_TOKEN|PRIVATE_ACCOUNT|secret/);
});

it('does not attribute a late operation or transaction callback to the next capture',()=>{
  capture=startProbe();const count=probeCounter(),finish=probeSpan('copy'),worker=probeWorkerStart('worker.read'),messages=probeWorkerMessages();capture.stop();capture=startProbe();
  count('hash.calls');finish();worker();messages('received','private');expect(capture.stop()).toEqual({version:1,counters:{},events:[],droppedEvents:0,pendingTransactions:0});
});

it('counts successful native writes separately from a rolled back transaction',async()=>{
  const store=open(),raw=db(store);await raw.open();capture=startProbe();
  let abort:Promise<void>|undefined;
  await expect(raw.transaction('rw','syncMetadata',async()=>{const native=Dexie.currentTransaction!.idbtrans;abort=new Promise(resolve=>native.addEventListener('abort',()=>resolve(),{once:true}));await raw.table('syncMetadata').put({projectId:'synthetic',serverRevision:'0',state:'pending'});throw new Error('injected');})).rejects.toThrow('injected');
  await abort;
  const aborted=capture.stop();expect(await raw.table('syncMetadata').count()).toBe(0);
  expect(aborted.counters['db.write.succeeded.syncMetadata']).toBe(1);expect(aborted.counters['db.write.aborted.syncMetadata']).toBe(1);expect(sum(aborted,'db.write.committed.')).toBe(0);
  capture=startProbe();await raw.table('syncMetadata').put({projectId:'synthetic',serverRevision:'0',state:'pending'});
  await capture.settle();expect(capture.stop().counters['db.write.committed.syncMetadata']).toBe(1);
});

it('preserves complete values, history, outbox and archives with capture on/off for one rename and dialogue edit',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime('2026-10-16T00:00:00.000Z');
  const input=growthProject(),results=[];
  for(const enabled of [false,true]){
    const store=open();if(enabled)capture=startProbe();
    let project=(await store.saveProject(input,{reason:'初期化',operationId:'a1300000-0000-4000-8000-000000000001',includeHistory:false})).project;
    project=(await store.saveProject({...project,entities:project.entities.map((e,i)=>i?e:{...e,name:'アオ改名'})},{reason:'改名',operationId:'a1300000-0000-4000-8000-000000000002',includeHistory:false})).project;
    project=(await store.saveProject({...project,entities:project.entities.map(e=>e.kind==='dialogue_line'?{...e,data:{...e.data,text:e.data.text.map(b=>({...b,text:'新しい台詞'}))}}:e)},{reason:'台詞',operationId:'a1300000-0000-4000-8000-000000000003',includeHistory:false})).project;
    const complete=await store.getProject(project.projectId),outbox=await store.listOutbox(project.projectId),archive=await inspectScenario(await store.exportProject(project.projectId),{worker:false});
    results.push({complete,outbox,project:archive.project,recovery:archive.recovery});
    if(enabled){const report=capture!.stop();expect(sum(report,'db.write.committed.')).toBeGreaterThan(0);expect(report.counters['hash.bytes']).toBeGreaterThan(0);expect(report.events.some(row=>row.phase==='save.hash')).toBe(true);expect(JSON.stringify(report)).not.toMatch(/CANARY|アオ|台詞|a1300000/);}
  }
  expect(results[1]).toEqual(results[0]);expect(results[1].complete?.history).toHaveLength(3);
  expect(results[1].complete?.entities[0].name).toBe('アオ改名');
});

it.each([100,1000,10000] as const)('exposes all %i history row reads for 30 displayed items and retains authored order',async count=>{
  const store=open(),raw=db(store),series=historySeries(count);
  await raw.transaction('rw','projects','commands',async()=>{await raw.table('projects').put(series.header);await raw.table('commands').bulkPut(series.rows);});
  for(const page of [0,Math.floor(count/60),Math.floor((count-1)/30)]){
    capture=startProbe();const result=await store.historyPage(series.header.projectId,{page});const report=capture.stop();
    expect(result.total).toBe(count);expect(result.entries[0].revision).toBe(String(count-page*30));
    expect(report.counters['db.read.rows.commands']).toBe(count);expect(result.entries).toHaveLength(Math.min(30,count-page*30));
  }
  expect((await store.historyCommand(series.header.projectId,series.rows.at(-1)!.operationId as string)).after.name).toBe(`履歴${count}`);
});

it('uses literal independent expected search results and detects dependency/type/ID changes with the full validator',async()=>{
  const project=growthProject(),character=project.entities[0];expect(validateProject(project).ok).toBe(true);
  const names=filterCatalogEntities(project,{op:'participant',characterId:character.id}).map(e=>e.name);
  expect(names).toEqual(GROWTH_MANIFEST.expected.participantNames);
  expect(filterCatalogEntities(project,{op:'text',value:'アオ'}).map(e=>e.name)).toEqual(['アオ','アオ']);
  const validator=createProjectValidator();freezeCapturedPlainData(project);expect(validator(project).ok).toBe(true);
  const invalid=structuredClone(project);invalid.entities[0]={...invalid.entities[0],kind:'note'} as never;
  expect(validator(invalid).ok).toBe(false);expect(validateProject(invalid).ok).toBe(false);expect(validateCurrentProject(invalid).ok).toBe(false);
  const duplicate=structuredClone(project);duplicate.entities[1].id=duplicate.entities[0].id;expect(validator(duplicate).ok).toBe(false);
});

it('retains pinned world names, refuses a missing pin, and keeps private text out of numeric output',async()=>{
  const world=await createWorldSnapshot(growthProject(1),'固定世界');const pin=world.snapshots[0];
  const edited=structuredClone(world);edited.entities[0].name='アオ改名';
  capture=startProbe();expect(referenceChoices(edited,'entity',undefined,{versionId:pin.id})[0].label).toContain('アオ ·');
  expect(referenceChoices(edited,'entity',undefined,{versionId:'a1400000-0000-4000-8000-000000000001'})).toEqual([]);
  const store=open(),initial=(await store.saveProject(growthProject(),{reason:'開始',includeHistory:false})).project;
  const preview=await previewWorldVersion(initial,world,pin.id);
  await store.saveProject(preview.candidate,{reason:'固定世界',worldPin:{world,snapshotId:pin.id},includeHistory:false});
  const report=capture.stop();expect(JSON.stringify(report)).not.toMatch(/CANARY|アオ|秘密資料/);
});

it('rejects a corrupted native row without replacing the saved project',async()=>{
  const store=open(),saved=(await store.saveProject(growthProject(),{reason:'開始',includeHistory:false})).project;store.close();
  const raw=db(store);await raw.open();const key=[saved.projectId,saved.entities[0].id],row=await raw.table('entities').get(key);
  await raw.table('entities').put({...row,kind:'note'});capture=startProbe();
  await expect(store.getProjectForEditing(saved.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
  expect((await raw.table('projects').get(saved.projectId)).revision).toBe('1');expect(capture.stop().events.at(-1)).toMatchObject({phase:'store.read',outcome:'error'});
});

it('demonstrates why naive history slicing loses an existing corruption check outside the displayed page',async()=>{
  const store=open(),raw=db(store),series=historySeries(100),first=series.rows[0];
  await raw.transaction('rw','projects','commands',async()=>{await raw.table('projects').put(series.header);await raw.table('commands').bulkPut(series.rows);});
  await raw.table('commands').delete(first.operationId as string);
  const naive=await raw.table('commands').bulkGet(series.header.historyIds.slice(-30));
  expect(naive.every(Boolean)).toBe(true);
  await expect(store.historyPage(series.header.projectId)).rejects.toMatchObject({code:'SAVE_FAILED'});
  expect((await raw.table('projects').get(series.header.projectId)).revision).toBe('100');
});
