import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText, validateProject} from '../src/domain/model';
import {writingCounts, writingGoal, setWritingGoal} from '../src/domain/production';
import {productionWorkload,productionTraceWorkload} from '../src/domain/productionPlanning';
import {startChapterReading,presentNextChapterScene,pinChapterReadingRecord} from '../src/domain/presentation';
import {jsonBytes,sha256} from '../src/storage/json';
import {prepareReuse} from '../src/domain/reuse';
import {ScenarioStore, cloneProject} from '../src/storage/store';
import {exportScenario, inspectScenario} from '../src/storage/archive';

function story() {
 const p=createProject('任意目標');
 const line=createEntity(p.projectId,'dialogue_line','声',{text:textToRichText('声😀')});
 const common=createEntity(p.projectId,'scene','共通',{body:textToRichText('がか\u3099 漢字。'),dialogueLineIds:[line.id],authorNotes:textToRichText('作者用の秘密')});
 common.data.body[0].ruby=[{start:4,end:6,text:'かんじ'}];
 const a=createEntity(p.projectId,'scene','分岐A',{body:textToRichText('甲')}),b=createEntity(p.projectId,'scene','分岐B',{body:textToRichText('乙乙')});
 const chapter=createEntity(p.projectId,'chapter','第一章',{sceneIds:[common.id,a.id]});
 const task=createEntity(p.projectId,'production_task','章を書く',{stage:'writing',progress:'todo',targetIds:[chapter.id,common.id,line.id]});
 p.entities.push(common,a,b,line,chapter,task);return {p,common,a,b,line,chapter,task};
}

describe('optional writing goals and reproducible Unicode counts',()=>{
 it('counts authored bodies and linked dialogue once, and each route visit separately',()=>{
  const {p,common,a,b,chapter,task}=story();
  expect(writingCounts(p)).toMatchObject({characters:12,unknownReferences:0});
  expect(writingCounts(p,chapter.id).characters).toBe(10);
  expect(writingCounts(p,task.id).characters).toBe(10);
  expect(productionWorkload(p,[common.id,a.id,common.id])).toMatchObject({writingCharacters:12,routeWritingCharacters:19});
  expect(productionWorkload(p,[common.id,b.id])).toMatchObject({writingCharacters:12,routeWritingCharacters:11});
  expect(writingCounts(structuredClone(p))).toEqual(writingCounts(p));
  p.entities.reverse();expect(writingCounts(p).characters).toBe(12);
 });
 it('deduplicates fixed reuse, keeps independently copied/overridden/changed-origin text distinct',async()=>{
  const f=story(),use=createEntity(f.p.projectId,'scene','共通を再利用');f.p.entities.push(use);
  const p=(await prepareReuse(f.p,{ownerId:use.id,sourceId:f.common.id,mode:'reference'})).candidate;
  expect(writingCounts(p).characters).toBe(12);
  expect(productionWorkload(p,[f.common.id,use.id,use.id])).toMatchObject({routeWritingCharacters:27});
  const clone=(await prepareReuse(p,{ownerId:use.id,sourceId:f.common.id,mode:'clone'})).candidate;
  expect(writingCounts(clone).characters).toBe(21);
  const overridden=(await prepareReuse(p,{ownerId:use.id,sourceId:f.common.id,mode:'override',overrideFields:['body']})).candidate;
  const own=overridden.entities.find(e=>e.id===use.id)!;if(own.kind==='scene')own.data.body=textToRichText('別稿');
  expect(writingCounts(overridden).characters).toBe(14);
  const source=p.entities.find(e=>e.id===f.common.id)!;if(source.kind==='scene')source.data.body=textToRichText('改稿');
  expect(writingCounts(p).characters).toBe(14);
 });
 it('measures the verified fixed edition of a saved route after the live body changes',async()=>{
  const f=story();let reading=await startChapterReading(f.p,{sceneIds:[f.common.id,f.a.id,f.common.id]});
  for(let visit=0;visit<3;visit++)reading=presentNextChapterScene(f.p,reading);
  const checkpointId=newId(),snapshotId=newId(),record=pinChapterReadingRecord(reading,{checkpointId,snapshotId});
  const checkpoint=createEntity(f.p.projectId,'checkpoint','開始',record.checkpoint);checkpoint.id=checkpointId;
  const trace=createEntity(f.p.projectId,'trace','保存した三回の提示',record.trace);
  f.p.entities.push(checkpoint,trace);f.p.snapshots.push({id:snapshotId,content:record.content,contentHash:await sha256(jsonBytes(record.content)),createdAt:'2026-11-06T00:00:00Z',versionLabel:'本文の固定版'});
  f.common.data.body=textToRichText('改稿');
  const result=await productionTraceWorkload(f.p,trace.id);
  expect(result.sourceVersionId).toBe(snapshotId);expect(result.workload).toMatchObject({writingCharacters:7,routeWritingCharacters:19,routeOccurrences:3});
 });
 it('excludes deleted/rejected/alternate text and reports unresolved scope references',()=>{
  const f=story();f.a.status='alternate';f.b.status='rejected';
  expect(writingCounts(f.p).characters).toBe(9);
  f.common.deletedAt='2026-11-06T00:00:00Z';
  expect(writingCounts(f.p,f.chapter.id)).toMatchObject({characters:0,unknownReferences:2});
  expect(()=>writingCounts(f.p,'missing')).toThrow('対象');
 });
 it('leaves absent goals optional and preserves unrelated views through edit, removal and archive',async()=>{
  const {p,chapter,task}=story();const old=structuredClone(p);
  expect(writingGoal(p)).toBe(null);expect(setWritingGoal(p,undefined,null)).toBe(p);
  expect((await inspectScenario(await exportScenario(p),{worker:false})).project).toEqual(old);
  p.views.push({id:newId(),name:'元の表示',view:'outline',entityIds:[],settings:{scale:2}});
  let next=setWritingGoal(p,undefined,100);next=setWritingGoal(next,chapter.id,20);next=setWritingGoal(next,task.id,10);
  expect(validateProject(next).ok).toBe(true);expect(writingGoal(next)).toBe(100);expect(writingGoal(next,chapter.id)).toBe(20);
  const restored=(await inspectScenario(await exportScenario(next),{worker:false})).project;
  expect(restored.views).toEqual(next.views);
  const cloned=await cloneProject(restored);expect(writingGoal(cloned.project,cloned.idMap[chapter.id])).toBe(20);
  const removed=setWritingGoal(restored,chapter.id,null);expect(writingGoal(removed,chapter.id)).toBe(null);expect(writingGoal(removed)).toBe(100);expect(removed.views[0]).toEqual(p.views[0]);
  for(const bad of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(()=>setWritingGoal(p,chapter.id,bad)).toThrow('目標');
  expect(()=>setWritingGoal(p,'missing',10)).toThrow('対象');expect(p.views).toHaveLength(1);
 });
 it('saves goals atomically with normal history, rejects stale saves and supports undo',async()=>{
  const {p,chapter}=story();let fail=false;const db=new ScenarioStore({databaseName:`writing-${newId()}`,faultInjector:stage=>{if(stage==='before-commit'&&fail)throw new DOMException('quota','QuotaExceededError');}});
  try {
   const original=(await db.saveProject(p,{reason:'以前の作品'})).project,candidate=setWritingGoal(original,chapter.id,20);fail=true;
   await expect(db.saveProject(candidate,{reason:'章の任意目標'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});expect(await db.getProject(p.projectId)).toEqual(original);
   fail=false;const saved=await db.saveProject(candidate,{reason:'章の任意目標'});
   expect(writingGoal((await db.getProject(p.projectId))!,chapter.id)).toBe(20);
   await expect(db.saveProject(setWritingGoal(original,chapter.id,30),{reason:'古い版'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
   expect(writingGoal((await db.undo(p.projectId,saved.operationId)).project,chapter.id)).toBe(null);
  }finally{await db.deleteDatabase();}
 });
});
