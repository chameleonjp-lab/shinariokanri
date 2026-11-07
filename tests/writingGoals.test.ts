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
 it('counts chapterId-only members for chapter and task goals',()=>{
  const p=createProject('章IDだけの所属'),chapter=createEntity(p.projectId,'chapter','第一章',{sceneIds:[]});
  const scene=createEntity(p.projectId,'scene','所属する場面',{chapterId:chapter.id,body:textToRichText('abc')});
  const task=createEntity(p.projectId,'production_task','章を書く',{targetIds:[chapter.id],stage:'writing',progress:'todo'});
  p.entities.push(chapter,scene,task);
  expect(validateProject(p)).toMatchObject({ok:true});
  expect(writingCounts(p)).toEqual({characters:3,unknownReferences:0});
  expect(writingCounts(p,chapter.id)).toEqual({characters:3,unknownReferences:0});
  expect(writingCounts(p,task.id)).toEqual({characters:3,unknownReferences:0});
 });
 it('deduplicates explicit and implicit chapter members and excludes inactive implicit members',()=>{
  const p=createProject('章の所属を一度だけ集計'),chapter=createEntity(p.projectId,'chapter','第一章',{sceneIds:[]});
  const line=createEntity(p.projectId,'dialogue_line','共有する声',{text:textToRichText('声😀')});
  const explicit=createEntity(p.projectId,'scene','明示と章IDの両方',{chapterId:chapter.id,body:textToRichText('AB'),dialogueLineIds:[line.id]});
  const implicit=createEntity(p.projectId,'scene','章IDだけ',{chapterId:chapter.id,body:textToRichText('c'),dialogueLineIds:[line.id]});
  const other=createEntity(p.projectId,'scene','章の外',{body:textToRichText('外外')});
  const inactive=['alternate','rejected','deleted'].map(status=>{
   const scene=createEntity(p.projectId,'scene',status,{chapterId:chapter.id,body:textToRichText('除外')});
   if(status==='deleted'){scene.deletedAt='2026-11-06T00:00:00Z';scene.deletionOperationId=newId();}else scene.status=status as 'alternate'|'rejected';
   return scene;
  });
  chapter.data.sceneIds=[explicit.id];
  const task=createEntity(p.projectId,'production_task','重なる対象',{targetIds:[chapter.id,explicit.id,implicit.id,line.id],stage:'writing',progress:'todo'});
  p.entities.push(chapter,line,explicit,implicit,other,...inactive,task);
  expect(validateProject(p)).toMatchObject({ok:true});
  expect(writingCounts(p,chapter.id)).toEqual({characters:5,unknownReferences:0});
  expect(writingCounts(p,task.id)).toEqual({characters:5,unknownReferences:0});
  expect(writingCounts(p)).toEqual({characters:7,unknownReferences:0});
  p.entities.reverse();expect(writingCounts(p,chapter.id)).toEqual({characters:5,unknownReferences:0});
 });
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
 it.each(['dialogueLineIds','blockIds'] as const)('counts an inherited body once when only %s is overridden',async field=>{
  const p=createProject('本文以外だけの上書き'),source=createEntity(p.projectId,'scene','本文の共通元',{body:textToRichText('ABCD'),dialogueLineIds:[],blockIds:[]}),use=createEntity(p.projectId,'scene','リンクだけ上書き',{dialogueLineIds:[],blockIds:[]});
  const chapter=createEntity(p.projectId,'chapter','同じ本文の章',{sceneIds:[source.id,use.id]}),task=createEntity(p.projectId,'production_task','同じ本文の作業',{targetIds:[chapter.id,source.id,use.id],stage:'writing',progress:'todo'});
  p.entities.push(source,use,chapter,task);
  const candidate=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,mode:'override',overrideFields:[field]})).candidate;
  expect(validateProject(candidate)).toMatchObject({ok:true});
  expect(writingCounts(candidate).characters).toBe(4);
  expect(writingCounts(candidate,chapter.id).characters).toBe(4);
  expect(writingCounts(candidate,task.id).characters).toBe(4);
  expect(productionWorkload(candidate,[source.id,use.id,use.id])).toMatchObject({uniqueScenes:2,reuseSites:1,routeOccurrences:3,routeWritingCharacters:12});
 });
 it('follows overridden dialogue links while sharing their inherited scene body',async()=>{
  const p=createProject('本文共有と台詞の差'),line=createEntity(p.projectId,'dialogue_line','使用先だけの台詞',{text:textToRichText('ZZ')}),source=createEntity(p.projectId,'scene','本文の共通元',{body:textToRichText('ABCD'),dialogueLineIds:[]}),use=createEntity(p.projectId,'scene','台詞だけ変更',{dialogueLineIds:[line.id]});
  const chapter=createEntity(p.projectId,'chapter','本文共有の章',{sceneIds:[source.id,use.id]}),task=createEntity(p.projectId,'production_task','使用先を書く',{targetIds:[use.id],stage:'writing',progress:'todo'});
  p.entities.push(line,source,use,chapter,task);
  const candidate=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,mode:'override',overrideFields:['dialogueLineIds']})).candidate;
  expect(validateProject(candidate)).toMatchObject({ok:true});
  expect(writingCounts(candidate).characters).toBe(6);
  expect(writingCounts(candidate,chapter.id).characters).toBe(6);
  expect(writingCounts(candidate,task.id).characters).toBe(6);
  expect(productionWorkload(candidate,[source.id,use.id])).toMatchObject({uniqueScenes:2,uniqueLines:1,routeOccurrences:2,routeWritingCharacters:10});
 });
 it('counts a local body override once through two subsequent reference levels',async()=>{
  const p=createProject('本文上書きへの固定参照'),source=createEntity(p.projectId,'scene','共通元',{body:textToRichText('ABCD'),dialogueLineIds:[]}),own=createEntity(p.projectId,'scene','本文上書き',{body:textToRichText('XY'),dialogueLineIds:[]}),first=createEntity(p.projectId,'scene','上書きを再利用'),second=createEntity(p.projectId,'scene','さらに再利用');
  const chapter=createEntity(p.projectId,'chapter','再利用を並べる章',{sceneIds:[source.id,own.id,first.id,second.id]}),task=createEntity(p.projectId,'production_task','再利用を執筆',{targetIds:[chapter.id,first.id],stage:'writing',progress:'todo'});
  p.entities.push(source,own,first,second,chapter,task);
  let candidate=(await prepareReuse(p,{ownerId:own.id,sourceId:source.id,mode:'override',overrideFields:['body']})).candidate;
  candidate=(await prepareReuse(candidate,{ownerId:first.id,sourceId:own.id,mode:'reference'})).candidate;
  expect(validateProject(candidate)).toMatchObject({ok:true});expect(writingCounts(candidate).characters).toBe(6);
  candidate=(await prepareReuse(candidate,{ownerId:second.id,sourceId:first.id,mode:'reference'})).candidate;
  expect(validateProject(candidate)).toMatchObject({ok:true});
  expect(writingCounts(candidate).characters).toBe(6);
  expect(writingCounts(candidate,chapter.id).characters).toBe(6);
  expect(writingCounts(candidate,task.id).characters).toBe(6);
  expect(productionWorkload(candidate,[source.id,own.id,first.id,second.id])).toMatchObject({uniqueScenes:2,reuseSites:3,routeOccurrences:4,routeWritingCharacters:10});
  candidate.entities.reverse();expect(writingCounts(candidate).characters).toBe(6);
 });
 it('keeps identical local body overrides independent while deduplicating their references',async()=>{
  const p=createProject('同じ文を独立に上書き'),source=createEntity(p.projectId,'scene','共通元',{body:textToRichText('ABCD')}),a=createEntity(p.projectId,'scene','独立稿A',{body:textToRichText('XY')}),b=createEntity(p.projectId,'scene','独立稿B',{body:textToRichText('XY')}),useA=createEntity(p.projectId,'scene','Aへの参照'),useB=createEntity(p.projectId,'scene','Bへの参照');
  const chapter=createEntity(p.projectId,'chapter','独立稿と再利用の章',{sceneIds:[source.id,a.id,b.id,useA.id,useB.id]}),task=createEntity(p.projectId,'production_task','独立稿を書く',{targetIds:[chapter.id],stage:'writing',progress:'todo'});
  p.entities.push(source,a,b,useA,useB,chapter,task);
  let candidate=(await prepareReuse(p,{ownerId:a.id,sourceId:source.id,mode:'override',overrideFields:['body']})).candidate;
  candidate=(await prepareReuse(candidate,{ownerId:b.id,sourceId:source.id,mode:'override',overrideFields:['body']})).candidate;
  candidate=(await prepareReuse(candidate,{ownerId:useA.id,sourceId:a.id,mode:'reference'})).candidate;
  candidate=(await prepareReuse(candidate,{ownerId:useB.id,sourceId:b.id,mode:'reference'})).candidate;
  expect(validateProject(candidate)).toMatchObject({ok:true});
  expect(writingCounts(candidate).characters).toBe(8);
  expect(writingCounts(candidate,chapter.id).characters).toBe(8);
  expect(writingCounts(candidate,task.id).characters).toBe(8);
  expect(productionWorkload(candidate,[source.id,a.id,b.id,useA.id,useB.id])).toMatchObject({uniqueScenes:3,reuseSites:4,routeOccurrences:5,routeWritingCharacters:12});
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
