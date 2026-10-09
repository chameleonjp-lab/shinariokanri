import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {createEntity,createProject,newId,validateProject} from '../domain/model';
import type {ContentState,Entity,ProjectData} from '../domain/types';
import {RecordDictionaryReader,RecordDictionaryWriter} from './recordDictionary';
import {ARCHIVE_LIMITS,jsonBytes,parseStrictJson,sha256} from './json';
import {exportScenario,inspectScenario,verifySnapshotHashes} from './archive';
import {projectContent} from '../domain/writingWorkspace';
import {cloneProject,ScenarioStore} from './store';

const stores:ScenarioStore[]=[];
const open=(databaseName=`shared-clone-${newId()}`)=>{const store=new ScenarioStore({databaseName});stores.push(store);return store;};
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});

function fixture(changed=false):ProjectData {
  const project=createProject('共有履歴の複製'),target=createEntity(project.projectId,'note','引用先');
  const note=createEntity(project.projectId,'note','変わらない本文',{body:[{id:newId(),kind:'paragraph',text:'😀日本語\0',links:[{start:0,end:1,target:{entityId:target.id}}]}]});
  project.entities=[note,target];
  const {history:_history,...base}=project;
  const later=[note,{...target,name:'後の引用先',revision:'6'}];
  const states:ContentState[]=Array.from({length:13},(_,index)=>({...base,entities:changed&&index>=6?later:base.entities,name:`第${index}版`,revision:String(index)}));
  project.history=Array.from({length:12},(_,index)=>({operationId:newId(),projectId:project.projectId,baseRevision:String(index),revision:String(index+1),targetIds:changed&&index===5?[project.projectId,target.id]:[project.projectId],createdAt:'2026-10-05T00:00:00Z',reason:'作品名を保存',before:states[index],after:states[index+1]}));
  Object.assign(project,{...states[12],history:project.history});
  // Use the actual portable dictionary's parsed bytes, not a synthetic shallow
  // alias. Repeated historic bodies are immutable values after decoding.
  const writer=new RecordDictionaryWriter(),wire=writer.encode(project),reader=new RecordDictionaryReader(parseStrictJson(jsonBytes({records:writer.records,arrays:writer.arrays}),'data/records.json',ARCHIVE_LIMITS),ARCHIVE_LIMITS);
  const decoded=reader.decode(parseStrictJson(jsonBytes(wire),'data/project.json',ARCHIVE_LIMITS),'data/project.json') as ProjectData;
  reader.assertComplete();expect(validateProject(decoded).ok).toBe(true);
  return decoded;
}

it('clones shared manuscript histories without multiplying unchanged bodies and keeps source and old versions independent',async()=>{
  const original=fixture(),sourceHash=await sha256(jsonBytes(original)),id=original.entities[0]!.id;
  const {project:cloned,idMap}=await cloneProject(original),mapped=idMap[id]!;
  expect(cloned.history).toHaveLength(12);
  const historic=cloned.history.flatMap(command=>[command.before,command.after]).map(state=>state.entities.find(entity=>entity.id===mapped)!);
  // One untouched historic value plus its editable current copy is enough;
  // retaining 24 complete payload copies exhausts memory for legal large files.
  expect(new Set(historic).size).toBe(1);
  expect(cloned.entities[0]).not.toBe(historic[0]);
  expect(historic[0]!.kind).toBe('note');
  const old=historic[0] as Entity<'note'>,current=cloned.entities[0] as Entity<'note'>;
  expect(current.data.body[0]!.text).toBe('😀日本語\0');
  expect(current.data.body[0]!.id).toBe(idMap[(original.entities[0] as Entity<'note'>).data.body[0]!.id]);
  expect(current.data.body[0]!.links).toEqual([{start:0,end:1,target:{entityId:idMap[original.entities[1]!.id]}}]);
  current.data.body[0]!.text='編集する現稿';
  expect(old.data.body[0]!.text).toBe('😀日本語\0');
  expect(()=>{old.data.body[0]!.text='旧版を上書き';}).toThrow();
  expect(await sha256(jsonBytes(original))).toBe(sourceHash);
});

it('keeps different historical values of the same stable ID separate from each other and the editable current image',async()=>{
  const original=fixture(true),{project:cloned,idMap}=await cloneProject(original),id=idMap[original.entities[1]!.id];
  const old=cloned.history[4]!.after.entities.find(entity=>entity.id===id)!,changed=cloned.history[7]!.after.entities.find(entity=>entity.id===id)!,current=cloned.entities.find(entity=>entity.id===id)!;
  expect(old.name).toBe('引用先');expect(changed.name).toBe('後の引用先');expect(old).not.toBe(changed);
  current.name='さらに編集';expect(old.name).toBe('引用先');expect(changed.name).toBe('後の引用先');
  expect(()=>{changed.name='旧版を変更';}).toThrow();expect(original.entities[1]!.name).toBe('後の引用先');
});

it('keeps a fixed snapshot independent when the parsed dictionary shares its untouched manuscript with the current image',async()=>{
  const source=createProject('現稿と固定本文'),note=createEntity(source.projectId,'note','固定する本文',{body:[{id:newId(),kind:'paragraph',text:'😀固定本文'}]});source.entities.push(note);
  const content=projectContent(source),pin={id:newId(),createdAt:new Date().toISOString(),versionLabel:'固定引用版',contentHash:await sha256(jsonBytes(content)),content};source.snapshots.push(pin);
  const record=createEntity(source.projectId,'snapshot','固定引用版',{versionLabel:pin.versionLabel,contentHash:pin.contentHash});record.id=pin.id;source.entities.push(record);
  const writer=new RecordDictionaryWriter(),wire=writer.encode(source),reader=new RecordDictionaryReader(parseStrictJson(jsonBytes({records:writer.records,arrays:writer.arrays}),'data/records.json',ARCHIVE_LIMITS),ARCHIVE_LIMITS),decoded=reader.decode(parseStrictJson(jsonBytes(wire),'data/project.json',ARCHIVE_LIMITS),'data/project.json') as ProjectData;reader.assertComplete();
  expect(validateProject(decoded).ok).toBe(true);await verifySnapshotHashes([decoded]);expect(decoded.entities[0]).toBe(decoded.snapshots[0]!.content.entities[0]);const sourceHash=await sha256(jsonBytes(decoded));
  const {project:cloned}=await cloneProject(decoded),current=cloned.entities[0] as Entity<'note'>,fixed=cloned.snapshots[0]!,oldHash=fixed.contentHash;
  expect(current).not.toBe(fixed.content.entities[0]);current.data.body[0]!.text='現稿だけを編集';
  expect((fixed.content.entities[0] as Entity<'note'>).data.body[0]!.text).toBe('😀固定本文');
  expect(fixed.contentHash).toBe(oldHash);expect(await sha256(jsonBytes(fixed.content))).toBe(oldHash);await verifySnapshotHashes([cloned]);
  expect(await sha256(jsonBytes(decoded))).toBe(sourceHash);
});

it('retains every cloned command, ID mapping and Unicode through atomic import and a cold arbitrary-old-edition read',async()=>{
  const original=fixture(),sourceHash=await sha256(jsonBytes(original));
  const {project:cloned,idMap}=await cloneProject(original),prepared=await inspectScenario(await exportScenario(cloned,{worker:false}),{worker:false});
  const name=`shared-clone-cold-${newId()}`,first=open(name),restored=(await first.importScenario(prepared,{mode:'new'})).project;
  expect(restored.projectId).toBe(idMap[original.projectId]);expect(restored.history).toHaveLength(12);
  first.close();const cold=open(name),current=(await cold.getProjectForEditing(restored.projectId))!;
  expect(current.name).toBe('第12版');expect(await cold.historyPage(restored.projectId,{size:1})).toMatchObject({total:12});
  const selected=await cold.historyCommand(restored.projectId,idMap[original.history[4]!.operationId]!);
  expect(selected?.before.name).toBe('第4版');expect(selected?.after.name).toBe('第5版');
  expect(selected?.after.entities[0]!.id).toBe(idMap[original.entities[0]!.id]);
  expect((selected?.after.entities[0] as Entity<'note'>).data.body[0]!.text).toBe('😀日本語\0');
  expect(await sha256(jsonBytes(original))).toBe(sourceHash);
});
