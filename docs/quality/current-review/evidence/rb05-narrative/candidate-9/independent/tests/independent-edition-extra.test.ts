import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
import { prepareReuse } from '../src/domain/reuse';
import { startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { preparePartialCheckpoint, previewCheckpointMigration } from '../src/domain/checkpoints';
import { sha256, jsonBytes } from '../src/storage/json';
import { validateProjectIntegrity } from '../src/domain/projectRecordValidation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
const out='/tmp/shinariokanri-independent-rb05-narrative-7a40c7c/independent/fixtures';
function save(id:string,data:unknown){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={},name:string=kind):Entity<K>{const entity=createEntity(p.projectId,kind,name,data);p.entities.push(entity);return entity;}
async function fixedReuse(){
 let p=createProject('有限例外付き固定共通場面');const fixed=newId(),evidence=add(p,'source',{locator:'確定根拠'});evidence.status='confirmed';
 const other=add(p,'variable',{key:'other',initial:{type:'boolean',value:true}}),v=add(p,'variable',{key:'borrowed',initial:{type:'boolean',value:true},exclusions:[{variableId:other.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'限定期間に確定根拠があるときのみ同時採用',exceptions:[{reason:'固定元の限定期間',evidenceIds:[evidence.id],targetScope:{projectId:p.projectId,targetSnapshotId:fixed},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}}}]}]});
 const source=add(p,'scene',{body:[{id:newId(),kind:'paragraph',text:'限定期間内の固定本文',links:[{start:0,end:2,target:{entityId:v.id}}]}]},'固定共通元'),use=add(p,'scene',{},'使用先'),chapter=add(p,'chapter',{sceneIds:[use.id]},'使用先章');use.data.chapterId=chapter.id;
 const entry=add(p,'flow_node',{nodeType:'entry',sceneId:use.id}),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'正規終了'}),edge=add(p,'flow_edge',{fromId:entry.id,toId:end.id});add(p,'flow_graph',{nodeIds:[entry.id,end.id],edgeIds:[edge.id],entryIds:[entry.id],exitIds:[end.id]});
 const{snapshots:_s,history:_h,authorAlternatives:_a,...content}=structuredClone(p);p.snapshots.push({id:fixed,content,contentHash:await sha256(jsonBytes(content)),createdAt:'2026-10-08T08:00:00Z',versionLabel:'元版'});v.data.initial={type:'boolean',value:false};v.data.exclusions=[];
 p=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,snapshotId:fixed,mode:'reference'})).candidate;return{p,use,chapter,entry,fixed};
}
it('EN09 fixed source finite exclusion permission is identical at chapter start and flow start',async()=>{
 const f=await fixedReuse(),flow=await startTrialVerified(f.p,{entryId:f.entry.id,worldTick:'5'});let chapter:Awaited<ReturnType<typeof startChapterReading>>|undefined,error='';try{chapter=await startChapterReading(f.p,{chapterIds:[f.chapter.id],worldTick:'5'});}catch(e){error=(e as Error).message;}
 save('EN09',{project:f.p,validation:validateProject(f.p),flow,chapter,error});expect(validateProject(f.p).ok).toBe(true);expect(flow.status).toBe('ready');expect(error).toBe('');expect(chapter?.status).toBe('ready');const presented=presentNextChapterScene(f.p,chapter!);expect(presented.status).toBe('terminal');
});
it('EN10 migration preserves scoped fixed exclusion state when the target runtime context is known',async()=>{
 const f=await fixedReuse(),partial=await preparePartialCheckpoint(f.p,{entryId:f.entry.id});f.p.entities.push(partial.checkpoint);f.p.snapshots.push(...partial.snapshots);const valid=await startTrialVerified(f.p,{contentVersionId:partial.checkpoint.data.contentVersionId,checkpointId:partial.checkpoint.id,entryId:f.entry.id,worldTick:'5'});let plan:Awaited<ReturnType<typeof previewCheckpointMigration>>|undefined,error='';try{plan=await previewCheckpointMigration(f.p,partial.checkpoint.id,{entryId:f.entry.id,worldTick:'5'} as Parameters<typeof previewCheckpointMigration>[2]);}catch(e){error=(e as Error).message;}
 save('EN10',{project:f.p,validation:validateProject(f.p),validTargetAt5:valid,request:{entryId:f.entry.id,worldTick:'5'},plan,error});expect(validateProject(f.p).ok).toBe(true);expect(valid.status).toBe('ready');expect(error).toBe('');expect(plan?.migrated.checkpoint.data.runtimeState.provenance).toBe('partial');
});
it('EN11 retained typed initial stub input cannot contradict its saved starting state or replay proof',async()=>{
 const f=JSON.parse(readFileSync(out+'/EN01.json','utf8')),p:ProjectData=structuredClone(f.project),trace=p.entities.find((e):e is Entity<'trace'>=>e.id===f.old.trace.id&&e.kind==='trace')!;const original=await replaySavedTraceVerified(p,trace.id),key=Object.keys(trace.data.initialStubValues!.variables!)[0];trace.data.initialStubValues!.variables![key]={type:'integer',value:99};const replay=await replaySavedTraceVerified(p,trace.id),issues=await validateProjectIntegrity(p);let nativeAccepted=false,nativeError='';try{await inspectScenario(await exportScenario(p),{worker:false});nativeAccepted=true;}catch(e){nativeError=(e as Error).message;}save('EN11',{project:p,validation:validateProject(p),original,replay,issues,nativeAccepted,nativeError});expect(original.status).toBe('terminal');expect(replay.status).toBe('error');expect(issues.length).toBeGreaterThan(0);expect(nativeAccepted).toBe(false);
});
