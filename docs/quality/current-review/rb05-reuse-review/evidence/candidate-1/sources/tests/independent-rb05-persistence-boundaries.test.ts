import 'fake-indexeddb/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import { startTrial, stepTrial, pinTrialRecord, trialRecordData, checkTrialForeshadows } from '../src/domain/runtime';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { regressionPathCoverage } from '../src/domain/regressionPaths';
import { startChapterReading, presentNextChapterScene, pinChapterReadingRecord, replayChapterReading, presentContent } from '../src/domain/presentation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage';
import { exportProject } from '../src/domain/exports';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={}){const e=createEntity(p.projectId,kind,kind,data);p.entities.push(e);return e as Entity<K>;}
function recordFixture(id:string,p:ProjectData,result:unknown){const dir='/tmp/shinariokanri-independent-rb05-reuse-1-prior-prior-boundary-fixtures';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${id}-project.json`,JSON.stringify(p,null,2)+'\n');writeFileSync(`${dir}/${id}-observation.json`,JSON.stringify(result,null,2)+'\n');}
function flow(){const p=createProject(),s=add(p,'scene'),last=add(p,'scene');const a=add(p,'flow_node',{nodeType:'entry',sceneId:s.id}),b=add(p,'flow_node',{nodeType:'terminal',sceneId:last.id,terminalReason:'Declared terminal'}),e=add(p,'flow_edge',{fromId:a.id,toId:b.id,edgeType:'choice'}),g=add(p,'flow_graph',{nodeIds:[a.id,b.id],edgeIds:[e.id],entryIds:[a.id],exitIds:[b.id]});return {p,s,last,a,b,e,g};}
async function save(p:ProjectData,session:ReturnType<typeof startTrial>){const checkpointId=newId(),snapshotId=newId(),data=pinTrialRecord(session,{checkpointId,snapshotId});const cp={...createEntity(p.projectId,'checkpoint','Saved start',data.checkpoint),id:checkpointId},trace=add(p,'trace',data.trace);p.entities.push(cp);p.snapshots.push({id:snapshotId,content:data.content,contentHash:await sha256(jsonBytes(data.content)),createdAt:new Date().toISOString(),versionLabel:'Independent observation version'});return {cp,trace};}
describe('Independent RB05 new persistence and evidence boundaries',()=>{
  for(const mode of ['actual','mixed'] as const)it(`R5B01 ${mode} candidate label cannot become principal checked evidence`,()=>{
    const {p,a,e}=flow(),initial=startTrial(p,{entryId:a.id}),ended=stepTrial(p,initial,{edgeId:e.id}),checkpointId=newId(),data=trialRecordData(p,ended,checkpointId);
    p.entities.push({...createEntity(p.projectId,'checkpoint','Start',data.checkpoint),id:checkpointId});const trace=add(p,'trace',data.trace);add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});expect(validateProject(p).ok).toBe(true);
    const coverage=regressionPathCoverage(p,{...trace.data,externalMode:mode},initial.state);recordFixture('R5B01-'+mode,p,{expected:{checked:0},actual:coverage,candidateMode:mode,declaredMode:trace.data.externalMode??'internal'});expect(coverage.checked).toBe(0);
  });
  it('R5B02 an arbitrary mid-node start saves a consistent partial observation provenance',async()=>{
    const {p,s,b,g}=flow();const mid=add(p,'flow_node',{nodeType:'scene',sceneId:s.id}),edge=add(p,'flow_edge',{fromId:mid.id,toId:b.id,edgeType:'choice'});g.data.nodeIds.push(mid.id);g.data.edgeIds.push(edge.id);
    expect(validateProject(p).ok).toBe(true);const started=startTrial(p,{entryId:mid.id});expect(started.status).toBe('ready');expect(started.state.provenance).toBe('partial');
    const {cp}=await save(p,stepTrial(p,started,{edgeId:edge.id}));const validation=validateProject(p);recordFixture('R5B02',p,{expected:'valid partial checkpoint observation',actual:validation,checkpointProvenance:cp.data.runtimeState.provenance,observationProvenance:cp.data.presentationState?.provenance});expect(validation.ok,JSON.stringify(validation.issues)).toBe(true);
  });
  it('R5B03 chapter occurrence captures the same pre-effect state and verifies it after pinning',async()=>{
    const {p,s}=flow();const v=add(p,'variable',{key:'pre_effect',scope:'across_runs',initial:{type:'boolean',value:false}}),fx=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},knowledgeEffects:[fx.id]});q.data.clueIds=[d.id];expect(validateProject(p).ok).toBe(true);
    const initial=await startChapterReading(p,{sceneIds:[s.id]}),ended=presentNextChapterScene(p,initial);expect(ended.status).toBe('terminal');
    recordFixture('R5B03',p,{expected:{type:'boolean',value:false},actual:ended.occurrences[0].presentationState?.variableValues[v.id]??null,after:ended.state.variableValues[v.id]});expect(ended.occurrences[0].presentationState?.variableValues[v.id]).toEqual({type:'boolean',value:false});
    const checkpointId=newId(),snapshotId=newId(),record=pinChapterReadingRecord(ended,{checkpointId,snapshotId});expect(record.trace.readingPath!.occurrences[0].presentationState?.contentVersionId).toBe(snapshotId);
  });
  it('R5B04 chapter replay refuses a forged optional pre-presentation observation',async()=>{
    const {p,s}=flow();const v=add(p,'variable',{key:'pre_effect',scope:'across_runs',initial:{type:'boolean',value:false}}),fx=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},knowledgeEffects:[fx.id]});q.data.clueIds=[d.id];
    const initial=await startChapterReading(p,{sceneIds:[s.id]}),ended=presentNextChapterScene(p,initial),checkpointId=newId(),snapshotId=newId(),record=pinChapterReadingRecord(ended,{checkpointId,snapshotId});
    p.entities.push({...createEntity(p.projectId,'checkpoint','Chapter start',record.checkpoint),id:checkpointId});const trace=add(p,'trace',record.trace);p.snapshots.push({id:snapshotId,content:record.content,contentHash:await sha256(jsonBytes(record.content)),createdAt:new Date().toISOString(),versionLabel:'Chapter fixed version'});
    trace.data.readingPath!.occurrences[0].presentationState=structuredClone(trace.data.readingPath!.occurrences[0].after);
    expect(validateProject(p).ok).toBe(true);let refused=false;try{await replayChapterReading(p,trace.data,record.checkpoint);}catch(error){refused=(error as Error).name==='DomainValidationError';}recordFixture('R5B04',p,{expected:'refused',actual:refused?'refused':'accepted'});expect(refused).toBe(true);
  });
  it('R5P03 flow step replay refuses a forged pre-presentation observation without changing canonical data',async()=>{
    const {p,last,a,e}=flow();const v=add(p,'variable',{key:'pre_effect',scope:'across_runs',initial:{type:'boolean',value:false}}),fx=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:last.id},knowledgeEffects:[fx.id]});q.data.clueIds=[d.id];
    const {trace}=await save(p,stepTrial(p,startTrial(p,{entryId:a.id}),{edgeId:e.id}));expect(trace.data.steps[0].presentationState?.variableValues[v.id]).toEqual({type:'boolean',value:false});trace.data.steps[0].presentationState!.variableValues[v.id]={type:'boolean',value:true};expect(validateProject(p).ok).toBe(true);
    const unchanged=JSON.stringify(p),replay=await replaySavedTraceVerified(p,trace.id);recordFixture('R5P03',p,{expected:'error without canonical change',actual:replay.status,unchanged:JSON.stringify(p)===unchanged});expect(replay.status).toBe('error');expect(JSON.stringify(p)).toBe(unchanged);
  });
  it('R5P04 initial pre-effect observation survives archive, clone and foreshadow re-evaluation',async()=>{
    const {p,s,a,e}=flow();const v=add(p,'variable',{key:'pre_effect',scope:'across_runs',initial:{type:'boolean',value:false}}),fx=add(p,'effect',{operation:'set',targetId:v.id,value:{type:'boolean',value:true}}),q=add(p,'foreshadow',{resolutionPolicy:'this_work'}),other=add(p,'scene'),clue=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:other.id},role:'clue'}),payoff=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},role:'payoff',knowledgeEffects:[fx.id]}),source=add(p,'source',{locator:'Independent exception authority'});source.status='confirmed';
    q.data.requiredInfo=[clue.id];q.data.clueIds=[clue.id];q.data.payoffIds=[payoff.id];q.data.exceptions=[{reason:'Only when already true before presentation',evidenceIds:[source.id],targetScope:{projectId:p.projectId,routeCondition:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}}},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}}}];
    const {cp,trace}=await save(p,stepTrial(p,startTrial(p,{entryId:a.id,worldTick:'5'}),{edgeId:e.id,worldTick:'5'}));expect(cp.data.presentationState?.variableValues[v.id]).toEqual({type:'boolean',value:false});
    const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project,{project:cloned,idMap}=await cloneProject(restored);const replay=await replaySavedTraceVerified(cloned,idMap[trace.id]),finding=checkTrialForeshadows(cloned,replay).some(f=>f.code==='REQUIRED_INFO_MISSING'&&f.missingInfoIds?.includes(idMap[clue.id]));recordFixture('R5P04',p,{expected:'terminal with initial-before-state and missing-info preserved',actual:{status:replay.status,finding}});expect(replay.status).toBe('terminal');expect(finding).toBe(true);
  });
  it('R5B06 an explicitly stubbed opening keeps stub provenance when its saved checkpoint is replayed',async()=>{
    const {p,s,a,e}=flow();const v=add(p,'variable',{key:'opening_stub',initial:{type:'unknown',value:null,reason:'Author-supplied missing opening input'}}),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},condition:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}}});q.data.clueIds=[d.id];expect(validateProject(p).ok).toBe(true);
    const started=startTrial(p,{entryId:a.id,stub:{variables:{[v.id]:{type:'boolean',value:true}}}});expect(started.status).toBe('ready');expect(started.startState.provenance).toBe('stub');const {trace}=await save(p,stepTrial(p,started,{edgeId:e.id}));expect(validateProject(p).ok).toBe(true);
    const replay=await replaySavedTraceVerified(p,trace.id);recordFixture('R5B06',p,{expected:{status:'terminal',provenance:'stub'},actual:{status:replay.status,provenance:replay.startState.provenance,issues:replay.issues}});expect(replay.status,replay.issues.map(i=>i.message).join(';')).toBe('terminal');expect(replay.startState.provenance).toBe('stub');
  });
  it('R5B05 executable projection cannot remove a present scene dialogue dependency',async()=>{
    const {p,s,b}=flow();const line=add(p,'dialogue_line',{text:[{id:newId(),kind:'paragraph',text:'Hidden authored line'}]}),shown=add(p,'dialogue_line',{text:[{id:newId(),kind:'paragraph',text:'Visible authored line'}]});const included=p.entities.filter(e=>e.id!==line.id);p.entities.forEach(e=>e.status='confirmed');
    const profile=add(p,'projection_profile',{audience:'reader',includedIds:included.map(e=>e.id),allowedKinds:[...new Set(included.map(e=>e.kind))],namePolicy:{defaultPolicy:{mode:'exclude'},byEntityId:Object.fromEntries(included.map((e,i)=>[e.id,{mode:'replace',replacement:'Public '+i}]))},publicTitle:'Independent projection fixture',idPolicy:'preserve',publicTexts:{[b.id]:{terminalReason:'Public terminal'},[shown.id]:{text:[{id:newId(),kind:'paragraph',text:'Public line'}]}}});profile.status='confirmed';
    expect((await exportProject(p,{profile:'runtime_json',projectionProfileId:profile.id,targetRevision:p.revision})).ok).toBe(true);s.data.dialogueLineIds=[shown.id,line.id];expect(validateProject(p).ok).toBe(true);
    const result=await exportProject(p,{profile:'runtime_json',projectionProfileId:profile.id,targetRevision:p.revision});recordFixture('R5B05',p,{expected:'missing dialogue dependency refused',actual:result});expect(result.ok).toBe(false);
  });
});
