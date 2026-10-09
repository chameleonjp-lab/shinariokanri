import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it} from 'vitest';
import {createEntity,createProject,newId,textToRichText,validateEntity} from '../domain/model';
import {inspectScenario} from './archive';
import {jsonBytes,sha256} from './json';
import {ScenarioStore,type FaultStage} from './store';

const stores:ScenarioStore[]=[];
function store(databaseName=`basic-registration-${newId()}`,faultInjector?:(stage:FaultStage)=>void){const value=new ScenarioStore({databaseName,faultInjector});stores.push(value);return value;}
afterEach(async()=>{const active=stores.splice(0);for(const value of active)value.close();for(const value of active)await value.deleteDatabase();});
async function durable(value:ScenarioStore){const db=(value as unknown as {db:Dexie}).db;await db.open();return Object.fromEntries(await Promise.all(db.tables.map(async table=>[table.name,await table.toArray()])));}

it('accepts a name-only person or summary-only event, while requiring an event name or meaningful summary',()=>{
 const project=createProject(),person=createEntity(project.projectId,'character','名前だけ'),event=createEntity(project.projectId,'event','',{summary:textToRichText('😀要約だけで門が開く')});
 expect(validateEntity(person)).toMatchObject({ok:true});expect(validateEntity(event)).toMatchObject({ok:true});
 expect(validateEntity({...event,name:'名称だけ',data:{...event.data,summary:[]}})).toMatchObject({ok:true});
 for(const summary of [[],textToRichText(' \n\t　')])expect(validateEntity({...event,data:{...event.data,summary}})).toMatchObject({ok:false,issues:expect.arrayContaining([expect.objectContaining({path:'entity.data.summary'})])});
 expect(validateEntity({...person,name:' ',data:{...person.data,summary:textToRichText('人物には名前が必要')}})).toMatchObject({ok:false,issues:expect.arrayContaining([expect.objectContaining({path:'entity.name'})])});
 expect(validateEntity({...event,data:{...event.data,summary:textToRichText('😀'.repeat(2049))}})).toMatchObject({ok:false});
});

it('cold-reopens and completely restores the summary-only event, including its block IDs, old snapshot, history and pending intent',async()=>{
 const first=store(),empty=(await first.saveProject(createProject('要約だけの出来事'),{reason:'空作品'})).project;
 const person=createEntity(empty.projectId,'character','名前だけ'),event=createEntity(empty.projectId,'event','',{summary:textToRichText('😀要約だけの出来事\n𠮷野の門が開く')});
 empty.entities.push(person,event);const registered=(await first.saveProject(empty,{reason:'名前だけと要約だけ'})).project;
 const {history:_history,snapshots:_snapshots,authorAlternatives:_alternatives,...content}=structuredClone(registered),snapshot={id:newId(),versionLabel:'要約だけの旧版',createdAt:new Date().toISOString(),contentHash:await sha256(jsonBytes(content)),content};
 registered.snapshots.push(snapshot);const saved=(await first.saveProject(registered,{reason:'固定版を保持'})).project;
 first.close();const cold=store((first as unknown as {db:Dexie}).db.name);expect(await cold.getProject(saved.projectId)).toEqual(saved);
 const prepared=await inspectScenario(await cold.exportProject(saved.projectId),{worker:false});expect(prepared.project).toEqual(saved);expect(prepared.recovery?.pending).toHaveLength(3);
 for(const mode of ['new','clone'] as const){
  const fresh=store(),result=await fresh.importScenario(prepared,{mode});fresh.close();const restarted=store((fresh as unknown as {db:Dexie}).db.name),restored=(await restarted.getProject(result.project.projectId))!;
  const restoredEvent=restored.entities.find(e=>e.kind==='event')!;expect(restoredEvent.name).toBe('');expect(restoredEvent.kind==='event'&&restoredEvent.data.summary.map(b=>b.text)).toEqual(event.data.summary.map(b=>b.text));expect(restoredEvent.kind==='event'&&restoredEvent.data.time).toEqual(event.data.time);
  expect((await restarted.getSaveState(restored.projectId)).recoveredPendingCount).toBe(3);
  if(mode==='new')expect(restored).toEqual(saved);
  else{expect(restored.projectId).not.toBe(saved.projectId);expect(restoredEvent.id).not.toBe(event.id);expect(restored.history).toHaveLength(4);expect(restored.snapshots).toHaveLength(1);expect(restored.snapshots[0]!.content.entities.find(e=>e.kind==='event')!.name).toBe('');}
 }
});

it('rejects blank fields, invalid references and a precommit failure without changing any durable table, then saves the retained input',async()=>{
 let fail=false;const value=store(undefined,stage=>{if(fail&&stage==='before-commit')throw new DOMException('quota fixture','QuotaExceededError');});
 const project=createProject(),event=createEntity(project.projectId,'event','',{summary:textToRichText('保存した要約😀')});project.entities.push(event);let saved=(await value.saveProject(project,{reason:'要約だけを保存'})).project;const before=await durable(value);
 for(const mutate of [(p:typeof saved)=>{(p.entities[0] as typeof event).data.summary=textToRichText('　 ');},(p:typeof saved)=>{(p.entities[0] as typeof event).data.locationId=newId();}]){
  const input=structuredClone(saved);mutate(input);const retained=structuredClone(input);await expect(value.saveProject(input,{reason:'不正変更'})).rejects.toMatchObject({code:'VALIDATION_FAILED'});expect(input).toEqual(retained);expect(await durable(value)).toEqual(before);
 }
 const input=structuredClone(saved);(input.entities[0] as typeof event).data.summary[0]!.text='保存失敗でも残す要約𠮷';const retained=structuredClone(input);fail=true;
 await expect(value.saveProject(input,{reason:'容量不足'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});expect(input).toEqual(retained);expect(await durable(value)).toEqual(before);
 fail=false;saved=(await value.saveProject(input,{reason:'明示再試行'})).project;expect(saved.entities[0]!.name).toBe('');expect((saved.entities[0] as typeof event).data.summary[0]!.text).toBe('保存失敗でも残す要約𠮷');expect(saved.history).toHaveLength(2);
});
