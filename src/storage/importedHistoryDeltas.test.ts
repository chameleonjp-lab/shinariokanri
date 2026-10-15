import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import type {CommandRecord,ContentState} from '../domain/types';
import {afterEach,expect,it} from 'vitest';
import {createEntity,createProject,newId,textToRichText} from '../domain/model';
import type {Entity} from '../domain/types';
import {inspectScenario,type PreparedScenario} from './archive';
import {jsonBytes,sha256} from './json';
import {ScenarioStore,type FaultStage} from './store';

const stores:ScenarioStore[]=[];
function open(databaseName=`import-delta-${newId()}`,faultInjector?:(stage:FaultStage)=>void){
  const store=new ScenarioStore({databaseName,faultInjector});stores.push(store);return store;
}
afterEach(async()=>{const active=stores.splice(0);for(const store of active)store.close();for(const store of active)await store.deleteDatabase();});
async function fixture(){
  const source=open();let project=createProject('完全な履歴');
  const note=createEntity(project.projectId,'note','変わらない原稿',{body:textToRichText('鍵😀日本語')});
  note.data.body[0]!.ruby=[{start:0,end:1,text:'かぎ'}];project.entities.push(note);
  for(let index=0;index<3;index++)project=(await source.saveProject({...project,name:`第${index+1}版`},{reason:`通常保存 ${index+1}`})).project;
  return inspectScenario(await source.exportProject(project.projectId),{worker:false});
}
interface Row {operationId:string;projectId:string;revision:string;record?:CommandRecord;delta?:{checkpoint?:ContentState;parentOperationId?:string}}
const database=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
const commands=(store:ScenarioStore)=>database(store).table<Row>('commands');
async function durable(store:ScenarioStore){
  const db=database(store);await db.open();return Object.fromEntries(await Promise.all(db.tables.map(async table=>[table.name,await table.toArray()])));
}
async function replaceCommand(prepared:PreparedScenario,index:number,mutate:(command:PreparedScenario['project']['history'][number])=>void){
  const command=structuredClone(prepared.project.history[index]!);mutate(command);prepared.project.history[index]=command;
  const pending=prepared.recovery!.pending[index]!;pending.command=structuredClone(command);pending.commandHash=await sha256(jsonBytes(command));
}

it('cold-reads every own value and key in imported history while retaining independent full pending commands and an editable result',async()=>{
  const prepared=await fixture(),expected=structuredClone(prepared),name=`import-delta-cold-${newId()}`,target=open(name);
  const result=await target.importScenario(prepared,{mode:'new'}),rows=await commands(target).toArray();
  expect(rows).toHaveLength(3);expect(rows.filter(row=>row.delta&&!row.record)).toHaveLength(2);
  // The second normal save introduces authorAlternatives at a different key
  // position in portable JSON; the exact-own-value guard retains its full row.
  expect(rows.find(row=>row.operationId===prepared.project.history[1]!.operationId)!.record).toStrictEqual(expected.project.history[1]);
  expect(rows.find(row=>row.operationId===prepared.project.history[2]!.operationId)!.delta?.parentOperationId).toBe(prepared.project.history[1]!.operationId);
  result.project.name='結果の現稿だけを編集';(result.project.entities[0] as Entity<'note'>).data.body[0]!.text='結果の本文だけを編集';
  expect(prepared).toEqual(expected);expect(result.project.history).not.toBe(prepared.project.history);
  target.close();const cold=open(name),loaded=(await cold.getProject(prepared.project.projectId))!;
  expect(loaded).toEqual(expected.project);
  for(const [index,command] of loaded.history.entries()){
    expect(Reflect.ownKeys(command)).toEqual(Reflect.ownKeys(expected.project.history[index]!));
    expect(command).toStrictEqual(expected.project.history[index]);
  }
  const pending=await cold.listRecoveredPending(loaded.projectId);
  expect(pending.map(row=>row.operation)).toStrictEqual(expected.recovery!.pending);
  for(const row of pending)expect(await sha256(jsonBytes(row.operation.command))).toBe(row.operation.commandHash);
  const reexport=await inspectScenario(await cold.exportProject(loaded.projectId),{worker:false});
  expect(structuredClone(reexport.project.history)).toStrictEqual(expected.project.history);
  expect(structuredClone(reexport.recovery!.pending.slice(0,3))).toStrictEqual(expected.recovery!.pending);
});

it.each(['own undefined','signed zero','ordered keys'] as const)('retains a full row when a JSON-equal delta would lose %s',async variant=>{
  const prepared=await fixture();
  await replaceCommand(prepared,2,command=>{
    const note=command.after.entities[0] as Entity<'note'>;
    if(variant==='own undefined')note.retainIfUnreferenced=undefined;
    if(variant==='signed zero')note.data.body[0]!.ruby![0]!.start=-0;
    if(variant==='ordered keys'){
      const {name,...rest}=note;command.after.entities[0]={name,...rest};
    }
  });
  const expected=structuredClone(prepared.project.history[2]!),name=`import-delta-own-${newId()}`,target=open(name);
  await target.importScenario(prepared,{mode:'new'});
  const row=await commands(target).get(expected.operationId);expect(row?.record).toStrictEqual(expected);expect(row?.delta).toBeUndefined();
  target.close();const command=await open(name).historyCommand(prepared.project.projectId,expected.operationId),note=command.after.entities[0] as Entity<'note'>;
  expect(command).toStrictEqual(expected);expect(Reflect.ownKeys(note)).toEqual(Reflect.ownKeys(expected.after.entities[0]!));
  if(variant==='own undefined')expect(Object.hasOwn(note,'retainIfUnreferenced')).toBe(true);
  if(variant==='signed zero')expect(Object.is(note.data.body[0]!.ruby![0]!.start,-0)).toBe(true);
});

it('uses a complete checkpoint for a historical branch whose before image differs from the preceding after image',async()=>{
  const prepared=await fixture();await replaceCommand(prepared,2,command=>{command.before.name='同じ版番号の別分岐';});
  const expected=structuredClone(prepared.project.history),target=open();await target.importScenario(prepared,{mode:'new'});
  const row=await commands(target).get(expected[2]!.operationId);
  expect(row?.delta?.checkpoint).toStrictEqual(expected[2]!.before);expect(row?.delta?.parentOperationId).toBeUndefined();
  expect((await target.getProject(prepared.project.projectId))!.history).toStrictEqual(expected);
});

it('never derives a new command from a JSON-equal pre-existing command with different own values',async()=>{
  const prepared=await fixture(),target=open(),first=structuredClone(prepared.project.history[1]!);
  first.after.entities[0]!.retainIfUnreferenced=undefined;
  await commands(target).add({operationId:first.operationId,projectId:first.projectId,revision:first.revision,record:first});
  await target.importScenario(prepared,{mode:'new'});
  const second=prepared.project.history[2]!,row=await commands(target).get(second.operationId);
  expect(row?.delta?.checkpoint).toStrictEqual(structuredClone(second.before));expect(row?.delta?.parentOperationId).toBeUndefined();
  const restored=await target.historyCommand(second.projectId,second.operationId);
  expect(restored).toStrictEqual(structuredClone(second));expect(Object.hasOwn(restored.before.entities[0]!,'retainIfUnreferenced')).toBe(false);
  expect(Object.hasOwn((await target.historyCommand(first.projectId,first.operationId)).after.entities[0]!,'retainIfUnreferenced')).toBe(true);
});

it.each<FaultStage>(['after-history','after-outbox'])('rolls back every table and part after an imported-delta failure at %s and permits a full retry',async stage=>{
  const prepared=await fixture();let fail=false;const target=open(undefined,point=>{if(fail&&point===stage)throw new DOMException('disk full','QuotaExceededError');});
  const sentinel=(await target.saveProject(createProject('既存の別作品'),{reason:'既存内容'})).project,before=await durable(target),retained=structuredClone(prepared);
  fail=true;await expect(target.importScenario(prepared,{mode:'new'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
  expect(await durable(target)).toStrictEqual(before);expect(structuredClone(prepared)).toStrictEqual(retained);expect(await target.getProject(sentinel.projectId)).toEqual(sentinel);
  fail=false;await target.importScenario(prepared,{mode:'new'});
  expect((await target.getProject(prepared.project.projectId))!.history).toStrictEqual(structuredClone(prepared.project.history));
  expect((await target.listRecoveredPending(prepared.project.projectId)).map(row=>row.operation)).toStrictEqual(structuredClone(prepared.recovery!.pending));
});
