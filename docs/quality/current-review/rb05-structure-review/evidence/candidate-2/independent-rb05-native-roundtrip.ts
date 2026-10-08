import 'fake-indexeddb/auto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createProject, createEntity, newId, validateProject } from '../src/domain/model';
import { startTrial, stepTrial, pinTrialRecord } from '../src/domain/runtime';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { startChapterReading, presentNextChapterScene, pinChapterReadingRecord, replayChapterReading } from '../src/domain/presentation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage';
import type { Entity, EntityKind, ProjectData, TraceData, CheckpointData } from '../src/domain/types';

function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={}) {const e=createEntity(p.projectId,kind,kind,data);p.entities.push(e);return e as Entity<K>;}
const evidenceDirectory='/tmp/shinariokanri-independent-rb05-structure-2-prior-native-fixtures';
function record(id:string,p:ProjectData,observation:unknown) {mkdirSync(evidenceDirectory,{recursive:true});writeFileSync(`${evidenceDirectory}/${id}-project.json`,JSON.stringify(p,null,2)+'\n');writeFileSync(`${evidenceDirectory}/${id}-observation.json`,JSON.stringify(observation,null,2)+'\n');}
async function saveRecord(p:ProjectData,data:{checkpoint:CheckpointData;trace:TraceData;content:ProjectData | Omit<ProjectData,'snapshots'|'history'>},checkpointId:string,snapshotId:string) {
  const cp={...createEntity(p.projectId,'checkpoint','Independent fixed start',data.checkpoint),id:checkpointId};p.entities.push(cp);const trace=add(p,'trace',data.trace);
  p.snapshots.push({id:snapshotId,content:data.content,contentHash:await sha256(jsonBytes(data.content)),createdAt:new Date().toISOString(),versionLabel:'Independent fixed reading'});
  add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});return {cp,trace};
}
async function cloneRoundtrip(p:ProjectData,id:string) {
  const bytes=await exportScenario(p);mkdirSync(evidenceDirectory,{recursive:true});writeFileSync(`${evidenceDirectory}/${id}.scenario`,bytes);
  const restored=(await inspectScenario(bytes,{worker:false})).project;
  const cloned=await cloneProject(restored);
  const second=(await inspectScenario(await exportScenario(cloned.project),{worker:false})).project;
  return {...cloned,project:second};
}

it('R5P05 chapter pre-effect observations and linked dialogue survive two native roundtrips and clone with partial coverage',async()=>{
  const p=createProject(),s=add(p,'scene'),line=add(p,'dialogue_line',{text:[{id:newId(),kind:'paragraph',text:'提示位置を保持する台詞 😀'}]});s.data.dialogueLineIds=[line.id];
  const v=add(p,'variable',{key:'chapter_before',scope:'across_runs',initial:{type:'boolean',value:false}}),effect=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:line.id},knowledgeEffects:[effect.id]});q.data.clueIds=[d.id];
  const ended=presentNextChapterScene(p,await startChapterReading(p,{sceneIds:[s.id],worldTick:'5'}));expect(ended.status).toBe('terminal');
  const checkpointId=newId(),snapshotId=newId(),saved=await saveRecord(p,pinChapterReadingRecord(ended,{checkpointId,snapshotId}),checkpointId,snapshotId);
  const {project:cloned,idMap}=await cloneRoundtrip(p,'R5P05'),trace=cloned.entities.find((e):e is Entity<'trace'>=>e.id===idMap[saved.trace.id]&&e.kind==='trace')!,cp=cloned.entities.find((e):e is Entity<'checkpoint'>=>e.id===idMap[saved.cp.id]&&e.kind==='checkpoint')!;
  const occurrence=trace.data.readingPath!.occurrences[0];
  expect(occurrence.presentationState?.contentVersionId).toBe(idMap[snapshotId]);
  expect(occurrence.presentationState?.variableValues[idMap[v.id]]).toEqual({type:'boolean',value:false});
  expect(occurrence.after.variableValues[idMap[v.id]]).toEqual({type:'boolean',value:true});
  expect(occurrence.presentationState?.seenIds).toContain(idMap[line.data.text[0].id]);
  expect(validateProject(cloned).ok).toBe(true);
  const replay=await replayChapterReading(cloned,trace.data,cp.data);expect(replay.status).toBe('terminal');
  expect(replay.occurrences[0].presentationState).toEqual(occurrence.presentationState);
  const coverage=pinChapterReadingRecord(replay,{checkpointId:newId(),snapshotId:newId()}).trace.coverage!.declaredTests;
  record('R5P05',p,{expected:{status:'terminal',before:false,after:true,contentVersionRemapped:true,checked:0,total:1,partialChecked:1},actual:{status:replay.status,before:occurrence.presentationState?.variableValues[idMap[v.id]],after:occurrence.after.variableValues[idMap[v.id]],coverage,declaredOccurrenceId:occurrence.occurrenceId,replayedOccurrenceId:replay.occurrences[0].occurrenceId},idMap});
  expect(coverage.total).toBe(1);expect(coverage.checked).toBe(0);expect(coverage.byProvenance?.partial.checked).toBe(1);
});

it('R5P06 stub opening stays stub after native roundtrip and clone and never becomes principal declared-test evidence',async()=>{
  const p=createProject(),s=add(p,'scene'),last=add(p,'scene'),a=add(p,'flow_node',{nodeType:'entry',sceneId:s.id}),b=add(p,'flow_node',{nodeType:'terminal',sceneId:last.id,terminalReason:'Declared final'}),edge=add(p,'flow_edge',{fromId:a.id,toId:b.id,edgeType:'choice'});add(p,'flow_graph',{nodeIds:[a.id,b.id],edgeIds:[edge.id],entryIds:[a.id],exitIds:[b.id]});
  const v=add(p,'variable',{key:'initial_stub',initial:{type:'unknown',value:null,reason:'Explicit missing opening input'}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},condition:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}}});q.data.clueIds=[d.id];
  const start=startTrial(p,{entryId:a.id,stub:{variables:{[v.id]:{type:'boolean',value:true}}}}),ended=stepTrial(p,start,{edgeId:edge.id});expect(ended.status).toBe('terminal');
  const checkpointId=newId(),snapshotId=newId(),saved=await saveRecord(p,pinTrialRecord(ended,{checkpointId,snapshotId}),checkpointId,snapshotId);
  const {project:cloned,idMap}=await cloneRoundtrip(p,'R5P06'),replay=await replaySavedTraceVerified(cloned,idMap[saved.trace.id]);
  expect(replay.status,replay.issues.map(issue=>issue.message).join(';')).toBe('terminal');expect(replay.startState.provenance).toBe('stub');expect(replay.state.provenance).toBe('stub');
  const result=pinTrialRecord(replay,{checkpointId:newId(),snapshotId:newId()}),coverage=result.trace.coverage!.declaredTests;
  record('R5P06',p,{expected:{status:'terminal',provenance:'stub',checked:0,total:1,stubChecked:1},actual:{status:replay.status,provenance:replay.startState.provenance,coverage,regressionDeclarations:result.trace.regressionDeclarations}});
  expect(coverage.total).toBe(1);expect(coverage.checked).toBe(0);expect(coverage.byProvenance?.stub.checked).toBe(1);expect(coverage.byExternalMode?.stub.checked).toBe(1);
  expect(result.trace.regressionDeclarations?.traceIds).toEqual([idMap[saved.trace.id]]);
});

it('R5P07 native export refuses a forged chapter observation without mutating the source',async()=>{
  const p=createProject(),s=add(p,'scene'),v=add(p,'variable',{key:'immutable_before',scope:'across_runs',initial:{type:'boolean',value:false}}),effect=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},knowledgeEffects:[effect.id]});q.data.clueIds=[d.id];
  const ended=presentNextChapterScene(p,await startChapterReading(p,{sceneIds:[s.id]})),checkpointId=newId(),snapshotId=newId(),saved=await saveRecord(p,pinChapterReadingRecord(ended,{checkpointId,snapshotId}),checkpointId,snapshotId);
  saved.trace.data.readingPath!.occurrences[0].presentationState=structuredClone(saved.trace.data.readingPath!.occurrences[0].after);expect(validateProject(p).ok).toBe(true);
  const before=JSON.stringify(p);let refusal='';try {await exportScenario(p);}catch(error){refusal=(error as {code?:string}).code??(error as Error).name;}
  record('R5P07',p,{expected:{refused:true,unchanged:true},actual:{refusal,unchanged:JSON.stringify(p)===before}});expect(refusal).not.toBe('');expect(JSON.stringify(p)).toBe(before);
});

it('R5P08 unchanged baseline chapter path can be rechecked without inventing missing optional observations',async()=>{
  const {traceId,checkpointId}=JSON.parse(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-chapter-trace.json',import.meta.url),'utf8'));
  const p=(await inspectScenario(new Uint8Array(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-chapter-trace.scenario',import.meta.url))),{worker:false})).project;
  const trace=p.entities.find((e):e is Entity<'trace'>=>e.id===traceId&&e.kind==='trace')!,cp=p.entities.find((e):e is Entity<'checkpoint'>=>e.id===checkpointId&&e.kind==='checkpoint')!;
  expect(trace.data.readingPath!.occurrences[0].presentationState).toBeUndefined();add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[traceId]});
  const replay=await replayChapterReading(p,trace.data,cp.data);expect(replay.status).toBe('terminal');
  const coverage=pinChapterReadingRecord(replay,{checkpointId:newId(),snapshotId:newId()}).trace.coverage!.declaredTests;
  record('R5P08',p,{expected:{status:'terminal',checked:0,total:1,partialChecked:1},actual:{status:replay.status,coverage,declaredHasObservation:!!trace.data.readingPath!.occurrences[0].presentationState,replayedHasObservation:!!replay.occurrences[0].presentationState}});
  expect(coverage.total).toBe(1);expect(coverage.checked).toBe(0);expect(coverage.byProvenance?.partial.checked).toBe(1);
});
