import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
import { prepareReuse } from '../src/domain/reuse';
import { startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import { startTrial, stepTrial, pinTrialRecord } from '../src/domain/runtime';
import { cloneProject, ScenarioStore } from '../src/storage/store';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { preparePartialCheckpoint, previewCheckpointMigration, confirmedCheckpointMigration } from '../src/domain/checkpoints';
import { sha256, jsonBytes } from '../src/storage/json';
import { validateProjectIntegrity } from '../src/domain/projectRecordValidation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
const out='/tmp/shinariokanri-rb05-edition-extra-fixtures';
function save(id:string,data:unknown){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={},name:string=kind):Entity<K>{const entity=createEntity(p.projectId,kind,name,data);p.entities.push(entity);return entity as Entity<K>;}
async function fixedReuse(scope?: 'graph'|'chapter'){
 let p=createProject('有限例外付き固定共通場面');const fixed=newId(),evidence=add(p,'source',{locator:'確定根拠'});evidence.status='confirmed';
 const other=add(p,'variable',{key:'other',initial:{type:'boolean',value:true}}),v=add(p,'variable',{key:'borrowed',initial:{type:'boolean',value:true},exclusions:[{variableId:other.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'限定期間に確定根拠があるときのみ同時採用',exceptions:[{reason:'固定元の限定期間',evidenceIds:[evidence.id],targetScope:{projectId:p.projectId,targetSnapshotId:fixed},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}}}]}]});
 const source=add(p,'scene',{body:[{id:newId(),kind:'paragraph',text:'限定期間内の固定本文',links:[{start:0,end:2,target:{entityId:v.id}}]}]},'固定共通元'),use=add(p,'scene',{},'使用先'),chapter=add(p,'chapter',{sceneIds:[use.id]},'使用先章');use.data.chapterId=chapter.id;
 const entry=add(p,'flow_node',{nodeType:'entry',sceneId:use.id}),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'正規終了'}),edge=add(p,'flow_edge',{fromId:entry.id,toId:end.id});const graph=add(p,'flow_graph',{nodeIds:[entry.id,end.id],edgeIds:[edge.id],entryIds:[entry.id],exitIds:[end.id]});if(scope)v.data.exclusions![0].exceptions![0].targetScope[scope==='graph'?'graphId':'chapterId']=scope==='graph'?graph.id:chapter.id;
 const{snapshots:_s,history:_h,authorAlternatives:_a,...content}=structuredClone(p);p.snapshots.push({id:fixed,content,contentHash:await sha256(jsonBytes(content)),createdAt:'2026-10-08T08:00:00Z',versionLabel:'元版'});v.data.initial={type:'boolean',value:false};v.data.exclusions=[];
 p=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,snapshotId:fixed,mode:'reference'})).candidate;return{p,use,source,chapter,entry,fixed,graph};
}
it('EN09 fixed source finite exclusion permission is identical at chapter start and flow start',async()=>{
 const f=await fixedReuse(),flow=await startTrialVerified(f.p,{entryId:f.entry.id,worldTick:'5'});let chapter:Awaited<ReturnType<typeof startChapterReading>>|undefined,error='';try{chapter=await startChapterReading(f.p,{chapterIds:[f.chapter.id],worldTick:'5'});}catch(e){error=(e as Error).message;}
 save('EN09',{project:f.p,validation:validateProject(f.p),flow,chapter,error});expect(validateProject(f.p).ok).toBe(true);expect(flow.status).toBe('ready');expect(error).toBe('');expect(chapter?.status).toBe('ready');expect(chapter!.sceneIds).toEqual([f.use.id]);expect(presentNextChapterScene(f.p,chapter!).status).toBe('terminal');
});
it('EN10 migration preserves scoped fixed exclusion state when the target runtime context is known',async()=>{
 const f=await fixedReuse(),partial=await preparePartialCheckpoint(f.p,{entryId:f.entry.id});f.p.entities.push(partial.checkpoint);f.p.snapshots.push(...partial.snapshots);const valid=await startTrialVerified(f.p,{contentVersionId:partial.checkpoint.data.contentVersionId,checkpointId:partial.checkpoint.id,entryId:f.entry.id,worldTick:'5'});let plan:Awaited<ReturnType<typeof previewCheckpointMigration>>|undefined,error='';try{plan=await previewCheckpointMigration(f.p,partial.checkpoint.id,{entryId:f.entry.id,worldTick:'5'});}catch(e){error=(e as Error).message;}
 save('EN10',{project:f.p,validation:validateProject(f.p),validTargetAt5:valid,request:{entryId:f.entry.id,worldTick:'5'},plan,error});expect(validateProject(f.p).ok).toBe(true);expect(valid.status).toBe('ready');expect(error).toBe('');expect(plan?.migrated.checkpoint.data.runtimeState.provenance).toBe('partial');
});
it('EN11 retained typed initial stub input cannot contradict its saved starting state or replay proof',async()=>{
 const {p,trace}=await recordedStub();const original=await replaySavedTraceVerified(p,trace.id),key=Object.keys(trace.data.initialStubValues!.variables!)[0];trace.data.initialStubValues!.variables![key]={type:'integer',value:99};const replay=await replaySavedTraceVerified(p,trace.id),issues=await validateProjectIntegrity(p);let nativeAccepted=false,nativeError='';try{await inspectScenario(await exportScenario(p),{worker:false});nativeAccepted=true;}catch(e){nativeError=(e as Error).message;}save('EN11',{project:p,validation:validateProject(p),original,replay,issues,nativeAccepted,nativeError});expect(original.status).toBe('terminal');expect(replay.status).toBe('error');expect(issues.length).toBeGreaterThan(0);expect(nativeAccepted).toBe(false);
});

async function recordedStub(partial=false,stub=true){
 const p=createProject('保存するstubの開始根拠'),money=add(p,'variable',{key:'money',valueType:'integer',initial:{type:'integer',value:2},scope:'across_runs',allowed:{min:0,max:100}}),entry=add(p,'flow_node',{nodeType:'entry'}),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'宣言した終了'}),edge=add(p,'flow_edge',{fromId:entry.id,toId:end.id});add(p,'flow_graph',{nodeIds:[entry.id,end.id],edgeIds:[edge.id],entryIds:[entry.id],exitIds:[end.id]});
 const state=partial?structuredClone(startTrial(p).state):undefined;if(state){state.variableValues[money.id]={type:'integer',value:7};state.provenance='partial';}
 const initial=startTrial(p,{entryId:entry.id,state,worldTick:'5',stub:stub?{variables:{[money.id]:{type:'integer',value:8}}}:undefined}),ended=stepTrial(p,initial,{edgeId:edge.id}),ids={checkpointId:newId(),snapshotId:newId()},record=pinTrialRecord(ended,ids),cp={...createEntity(p.projectId,'checkpoint','開始根拠',record.checkpoint),id:ids.checkpointId},trace=add(p,'trace',record.trace);p.entities.push(cp);p.snapshots.push({id:ids.snapshotId,content:record.content,contentHash:await sha256(jsonBytes(record.content)),createdAt:'2026-10-08T08:00:00Z',versionLabel:'開始根拠'});expect(ended.status).toBe('terminal');return{p,trace,cp,money,entry};
}
it('EN14 partial author state plus initial stub survives atomic save, cold load, native restore and clone without full-play promotion',async()=>{
 const f=await recordedStub(true),store=new ScenarioStore({databaseName:`rb05-stub-base-${newId()}`});try{await store.saveProject(f.p,{reason:'stub開始根拠の原子保存'});const loaded=(await store.getProject(f.p.projectId))!,restored=(await inspectScenario(await exportScenario(loaded),{worker:false})).project,cloned=await cloneProject(restored),trace=cloned.project.entities.find((e):e is Entity<'trace'>=>e.id===cloned.idMap[f.trace.id]&&e.kind==='trace')!,replay=await replaySavedTraceVerified(cloned.project,trace.id);expect(replay.status).toBe('terminal');expect(replay.startState.provenance).toBe('stub');expect(trace.data.initialStubBaseState?.variableValues[cloned.idMap[f.money.id]]).toEqual({type:'integer',value:7});expect(replay.startState.variableValues[cloned.idMap[f.money.id]]).toEqual({type:'integer',value:8});save('EN14',{project:f.p,replay});}finally{await store.deleteDatabase();}
});
it('EN15 migration preserves the frozen clock and rejects ambiguous legacy clocks or expired scoped permission',async()=>{
 const f=await fixedReuse(),cp=await preparePartialCheckpoint(f.p,{entryId:f.entry.id,worldTick:'5'});f.p.entities.push(cp.checkpoint);f.p.snapshots.push(...cp.snapshots);const plan=await previewCheckpointMigration(f.p,cp.checkpoint.id,{entryId:f.entry.id}),confirmed=await confirmedCheckpointMigration(f.p,plan,'migrate');f.p.entities.push(confirmed.checkpoint);f.p.snapshots.push(...confirmed.snapshots);expect(confirmed.checkpoint.data.worldTick).toBe('5');expect((await startTrialVerified(f.p,{contentVersionId:confirmed.checkpoint.data.contentVersionId,checkpointId:confirmed.checkpoint.id})).status).toBe('ready');await expect(previewCheckpointMigration(f.p,cp.checkpoint.id,{entryId:f.entry.id,worldTick:'10'})).rejects.toThrow();
 delete cp.checkpoint.data.worldTick;for(const tick of ['5','6'])add(f.p,'trace',{contentVersionId:cp.checkpoint.data.contentVersionId,startCheckpointId:cp.checkpoint.id,initialWorldTick:tick});await expect(previewCheckpointMigration(f.p,cp.checkpoint.id,{entryId:f.entry.id})).rejects.toThrow('複数');save('EN15',{project:f.p,plan,confirmed});
});
it('EN17 an internal flow also rejects contradictory saved start clocks at the durable and native boundaries',async()=>{
 const f=await recordedStub(false,false),trace=f.trace;expect(trace.data.externalMode).toBe(null);trace.data.initialWorldTick='6';f.cp.data.worldTick='5';
 const replay=await replaySavedTraceVerified(f.p,trace.id),issues=await validateProjectIntegrity(f.p);expect(replay.status).toBe('error');expect(issues.some(issue=>issue.message.includes('時点'))).toBe(true);await expect(exportScenario(f.p)).rejects.toThrow();save('EN17',{project:f.p,replay,issues});
});

for(const scope of ['graph','chapter'] as const)it(`CTX-${scope} accepts the exact fixed use-site scope and refuses a different scope`,async()=>{
 const f=await fixedReuse(scope),valid=await startTrialVerified(f.p,{entryId:f.entry.id,worldTick:'5'});expect(valid.status).toBe('ready');if(scope==='chapter')expect((await startChapterReading(f.p,{chapterIds:[f.chapter.id],worldTick:'5'})).status).toBe('ready');
 const cp=await preparePartialCheckpoint(f.p,{entryId:f.entry.id,worldTick:'5'});f.p.entities.push(cp.checkpoint);f.p.snapshots.push(...cp.snapshots);const migration=await confirmedCheckpointMigration(f.p,await previewCheckpointMigration(f.p,cp.checkpoint.id,{entryId:f.entry.id}),'migrate');expect(migration.checkpoint.data.worldTick).toBe('5');
 const otherScene=add(f.p,'scene'),otherChapter=add(f.p,'chapter',{sceneIds:[otherScene.id]});otherScene.data.chapterId=otherChapter.id;const otherEntry=add(f.p,'flow_node',{nodeType:'entry',sceneId:otherScene.id}),otherEnd=add(f.p,'flow_node',{nodeType:'terminal',terminalReason:'別の終了'}),otherEdge=add(f.p,'flow_edge',{fromId:otherEntry.id,toId:otherEnd.id});add(f.p,'flow_graph',{nodeIds:[otherEntry.id,otherEnd.id],edgeIds:[otherEdge.id],entryIds:[otherEntry.id],exitIds:[otherEnd.id]});
 // A second independently bound use site retains the original restriction.
 const rebound=(await prepareReuse(f.p,{ownerId:otherScene.id,sourceId:f.source.id,snapshotId:f.fixed,mode:'reference'})).candidate;expect(validateProject(rebound).ok).toBe(true);const denied=await startTrialVerified(rebound,{entryId:otherEntry.id,worldTick:'5'});expect(denied.status).toBe('error');expect(denied.issues.some(issue=>issue.code==='TRANSITION_BLOCKED')).toBe(true);save(`CTX-${scope}`,{project:rebound,valid,denied,migration});
});

it('CTX-child keeps graph-scoped permission in an actually called fixed child graph through native restore',async()=>{
 let p=createProject('内部グラフを実行する固定呼出し');const evidence=add(p,'source',{locator:'子グラフ専用の確定根拠'});evidence.status='confirmed';
 const v=add(p,'variable',{key:'child_transition',valueType:'integer',initial:{type:'integer',value:0},scope:'across_runs',allowed:{min:0,max:3},transitionRules:[{from:{type:'integer',value:0},to:{type:'integer',value:1}}]});
 const childEntry=add(p,'flow_node',{nodeType:'entry'}),childExit=add(p,'flow_node',{nodeType:'exit'}),childEdge=add(p,'flow_edge',{fromId:childEntry.id,toId:childExit.id}),child=add(p,'flow_graph',{nodeIds:[childEntry.id,childExit.id],edgeIds:[childEdge.id],entryIds:[childEntry.id],exitIds:[childExit.id]});
 const effect=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'integer',value:2},exceptionDetails:{reason:'この子グラフ内の限定遷移',evidenceIds:[evidence.id],targetScope:{projectId:p.projectId,graphId:child.id},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}}}});childEdge.data.effectIds=[effect.id];
 const source=add(p,'flow_node',{nodeType:'call',childGraphId:child.id}),entry=add(p,'flow_node',{nodeType:'entry'}),use=add(p,'flow_node'),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'呼出し完了'}),enter=add(p,'flow_edge',{fromId:entry.id,toId:use.id}),leave=add(p,'flow_edge',{fromId:use.id,toId:end.id,edgeType:'call_return'});add(p,'flow_graph',{nodeIds:[entry.id,use.id,end.id],edgeIds:[enter.id,leave.id],entryIds:[entry.id],exitIds:[end.id]});
 p=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,mode:'reference'})).candidate;expect(validateProject(p).ok).toBe(true);p=(await inspectScenario(await exportScenario(p),{worker:false})).project;const bindings=(p.entities.find(e=>e.id===use.id) as Entity<'flow_node'>).data.reuse!.bindings!;
 let run=await startTrialVerified(p,{entryId:entry.id,worldTick:'5'});run=stepTrial(p,run,{edgeId:enter.id});run=stepTrial(p,run,{worldTick:'5'});expect(run.nodeId).toBe(bindings[childEntry.id]);expect(run.state.callStack[0].graphId).toBe(bindings[child.id]);const before=structuredClone(run.state),expired=stepTrial(p,run,{edgeId:bindings[childEdge.id],worldTick:'10'});expect(expired.status).toBe('error');expect(expired.state).toEqual(before);
 run=stepTrial(p,run,{edgeId:bindings[childEdge.id],worldTick:'5'});expect(run.status).toBe('ready');expect(run.state.variableValues[bindings[v.id]]).toEqual({type:'integer',value:2});run=stepTrial(p,run,{worldTick:'5'});expect(run.status).toBe('terminal');save('CTX-child',{project:p,run,expired});
});
