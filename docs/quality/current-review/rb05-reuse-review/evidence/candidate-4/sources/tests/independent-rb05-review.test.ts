import 'fake-indexeddb/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import { initializeRuntimeState, applyEffectsAtomic } from '../src/domain/conditions';
import { startTrial, stepTrial, analyzeFlow, checkTrialForeshadows, pinTrialRecord, trialRecordData, replaySavedTrace, setTrialStubValues } from '../src/domain/runtime';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { regressionPathCoverage } from '../src/domain/regressionPaths';
import { stateUsage } from '../src/domain/stateUsage';
import { startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { exportProject } from '../src/domain/exports';
import { jsonBytes, sha256 } from '../src/storage';
import type { Entity, EntityKind, ProjectData, ScenarioException } from '../src/domain/types';

function add<K extends EntityKind>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}) {
  const e = createEntity(p.projectId, kind, kind, data); p.entities.push(e); return e as Entity<K>;
}
function record(id:string,p:ProjectData,result:unknown){const dir='/tmp/shinariokanri-independent-rb05-reuse-4-prior-prior-fixtures';mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${id}-project.json`,JSON.stringify(p,null,2)+'\n');writeFileSync(`${dir}/${id}-observation.json`,JSON.stringify(result,null,2)+'\n');}
function simpleFlow() {
  const p = createProject(); const s = add(p, 'scene'), last = add(p, 'scene');
  const a = add(p, 'flow_node', { nodeType: 'entry', sceneId: s.id });
  const b = add(p, 'flow_node', { nodeType: 'terminal', sceneId: last.id, terminalReason: 'Declared ending' });
  const e = add(p, 'flow_edge', { fromId: a.id, toId: b.id, edgeType: 'choice' });
  const g = add(p, 'flow_graph', { nodeIds: [a.id,b.id], edgeIds: [e.id], entryIds: [a.id], exitIds: [b.id] });
  return {p,s,last,a,b,e,g};
}
function finiteException(p: ProjectData): ScenarioException {
  const source=add(p,'source',{locator:'Synthetic exclusion authority'});source.status='confirmed';
  return {reason:'Declared temporary exception',targetScope:{projectId:p.projectId},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}},evidenceIds:[source.id]};
}
async function savePath(p: ProjectData, session: ReturnType<typeof startTrial>) {
  const checkpointId=newId(),snapshotId=newId();const r=pinTrialRecord(session,{checkpointId,snapshotId});
  const cp={...createEntity(p.projectId,'checkpoint','Saved start',r.checkpoint),id:checkpointId};
  const trace=add(p,'trace',r.trace);p.entities.push(cp);
  p.snapshots.push({id:snapshotId,content:r.content,contentHash:await sha256(jsonBytes(r.content)),versionLabel:'Fixed original path',createdAt:new Date().toISOString()});
  return {cp,trace,snapshotId};
}
describe('Independent RB05 original-contract review; not whole AT credit',()=>{
  it('R5A01 valid finite exclusion permission remains usable across flow lifecycle boundaries',()=>{
    const {p,a,e}=simpleFlow();const x=add(p,'variable',{key:'x',scope:'across_runs',initial:{type:'boolean',value:true}}),y=add(p,'variable',{key:'y',scope:'across_runs',initial:{type:'boolean',value:true}});
    x.data.exclusions=[{variableId:y.id,value:x.data.initial,otherValue:y.data.initial,reason:'Mutually exclusive by default',exceptions:[finiteException(p)]}];
    expect(validateProject(p).ok).toBe(true);
    const initial=startTrial(p,{entryId:a.id,worldTick:'5'});expect(initial.status).toBe('ready');
    const result=stepTrial(p,initial,{edgeId:e.id,worldTick:'5'});
    record('R5A01',p,{expected:'terminal',actual:result.status,issues:result.issues,initialStatus:initial.status,worldTick:'5'});
    expect(result.status,result.issues.map(i=>i.message).join(';')).toBe('terminal');
  });
  it('R5A02 valid finite exclusion permission remains usable at final chapter presentation',async()=>{
    const {p,s}=simpleFlow();const x=add(p,'variable',{key:'x',scope:'across_runs',initial:{type:'boolean',value:true}}),y=add(p,'variable',{key:'y',scope:'across_runs',initial:{type:'boolean',value:true}});
    x.data.exclusions=[{variableId:y.id,value:x.data.initial,otherValue:y.data.initial,reason:'Exclusive',exceptions:[finiteException(p)]}];
    expect(validateProject(p).ok).toBe(true);const initial=await startChapterReading(p,{sceneIds:[s.id],worldTick:'5'});
    const result=presentNextChapterScene(p,initial);record('R5A02',p,{expected:'terminal',actual:result.status,issues:result.issues,worldTick:'5'});expect(result.status,result.issues.map(i=>i.message).join(';')).toBe('terminal');
  });
  it('R5A03 changed state from payoff knowledge effect cannot retroactively grant a presentation exception',()=>{
    const {p,s,a}=simpleFlow();const key=add(p,'variable',{key:'after_presentation',scope:'across_runs',initial:{type:'boolean',value:false}});
    const effect=add(p,'effect',{operation:'set',targetId:key.id,value:{type:'boolean',value:true}});
    const q=add(p,'foreshadow',{resolutionPolicy:'this_work'}),other=add(p,'scene');
    const clue=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:other.id},role:'clue'});
    const payoff=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},role:'payoff',knowledgeEffects:[effect.id]});
    const exception=finiteException(p);exception.targetScope.routeCondition={op:'compare',variableId:key.id,comparator:'eq',value:{type:'boolean',value:true}};
    q.data.requiredInfo=[clue.id];q.data.clueIds=[clue.id];q.data.payoffIds=[payoff.id];q.data.exceptions=[exception];
    expect(validateProject(p).ok).toBe(true);const session=startTrial(p,{entryId:a.id,worldTick:'5'});expect(session.status).toBe('ready');
    expect(session.state.variableValues[key.id]).toEqual({type:'boolean',value:true});
    record('R5A03',p,{expected:'REQUIRED_INFO_MISSING despite post-presentation state change',actual:checkTrialForeshadows(p,session),presentationStart:key.data.initial,presentationAfter:session.state.variableValues[key.id],worldTick:'5'});
    expect(checkTrialForeshadows(p,session).some(f=>f.code==='REQUIRED_INFO_MISSING'&&f.missingInfoIds?.includes(clue.id))).toBe(true);
  });
  it('R5A04 finite presentation visited threshold is explored before state deduplication',()=>{
    const {p,s,a,b,e,g}=simpleFlow();const stop=add(p,'variable',{key:'ready_to_leave',initial:{type:'boolean',value:false}});
    const effect=add(p,'effect',{operation:'set',targetId:stop.id,value:{type:'boolean',value:true}});
    const q=add(p,'foreshadow',{resolutionPolicy:'this_work'});
    const clue=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},role:'clue',condition:{op:'visited',entityId:s.id,count:3},knowledgeEffects:[effect.id]});
    q.data.clueIds=[clue.id];e.data.condition={op:'compare',variableId:stop.id,comparator:'eq',value:{type:'boolean',value:true}};
    const loop=add(p,'flow_edge',{fromId:a.id,toId:a.id,edgeType:'choice',condition:{op:'compare',variableId:stop.id,comparator:'eq',value:{type:'boolean',value:false}}});g.data.edgeIds.push(loop.id);
    expect(validateProject(p).ok).toBe(true);
    let actual=startTrial(p,{entryId:a.id});actual=stepTrial(p,actual,{edgeId:loop.id});actual=stepTrial(p,actual,{edgeId:loop.id});actual=stepTrial(p,actual,{edgeId:e.id});expect(actual.status).toBe('terminal');
    const analysis=analyzeFlow(p);record('R5A04',p,{expected:'finite three-visit path reaches terminal without UNBOUNDED_LOOP',actual:analysis,manualFinalStatus:actual.status});expect(analysis.findings.some(f=>f.code==='UNBOUNDED_LOOP')).toBe(false);expect(analysis.coverage.scenes.reached).toBe(2);expect(analysis.findings.some(f=>f.code==='TERMINAL'&&f.targetId===b.id)).toBe(true);
  });
  it('R5A05 matching a declared stub checkpoint does not become full-play declared-test evidence',()=>{
    const {p,a,e}=simpleFlow();const x=add(p,'variable',{key:'stub_target'});
    let initial=startTrial(p,{entryId:a.id});initial=setTrialStubValues(p,initial,{variables:{[x.id]:{type:'boolean',value:true}}});
    // A typed supplied start keeps its stub provenance and can be declared for diagnostics.
    const stubStart=startTrial(p,{state:initial.state,entryId:a.id});const ended=stepTrial(p,stubStart,{edgeId:e.id});
    expect(ended.state.provenance).toBe('stub');const checkpointId=newId(),r=trialRecordData(p,ended,checkpointId);
    p.entities.push({...createEntity(p.projectId,'checkpoint','Declared stub start',r.checkpoint),id:checkpointId});const trace=add(p,'trace',r.trace);add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});
    expect(validateProject(p).ok).toBe(true);record('R5A05',p,{expected:'stub distinguished from full-play checked evidence',actual:regressionPathCoverage(p,trace.data,ended.startState),provenance:ended.startState.provenance,externalMode:trace.data.externalMode});expect(regressionPathCoverage(p,trace.data,ended.startState).checked).toBe(0);
  });
  it('R5A06 saving a replayed fixed path retains the live declared-set denominator',async()=>{
    const {p,a,e}=simpleFlow();const ended=stepTrial(p,startTrial(p,{entryId:a.id}),{edgeId:e.id});const {trace}=await savePath(p,ended);
    add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});expect(validateProject(p).ok).toBe(true);
    const replay=await replaySavedTraceVerified(p,trace.id);expect(replay.status).toBe('terminal');
    expect(regressionPathCoverage(p,trace.data,replay.startState)).toMatchObject({checked:1,total:1});
    const again=pinTrialRecord(replay,{checkpointId:newId(),snapshotId:newId()});record('R5A06',p,{expected:{total:1},actual:again.trace.coverage?.declaredTests,liveDeclarationCoverage:regressionPathCoverage(p,trace.data,replay.startState),replayStatus:replay.status});expect(again.trace.coverage?.declaredTests?.total).toBe(1);
  });
  it('R5A07 callers cannot raise the stated maximum exploration budgets',()=>{
    const {p}=simpleFlow();const result=analyzeFlow(p,{maxStates:100001,maxTransitions:10001,maxMs:30001});
    const refused=result.status==='confirmed_issue'&&result.checkedStates===0&&result.findings.some(f=>f.code==='VALIDATION_FAILED');
    const bounded=result.limits.maxStates<=100000&&result.limits.maxTransitions<=10000&&result.limits.maxMs<=30000;
    record('R5A07',p,{expected:'refuse excess requests without exploration or cap all limits to 100000/10000/30000',actual:{limits:result.limits,status:result.status,checkedStates:result.checkedStates}});
    expect(refused||bounded).toBe(true);
  });
  it('R5P01 exclusion/alternative/dialogue intention/declaration IDs survive full-file restore and independent clone',async()=>{
    const {p,a,e,s}=simpleFlow();const x=add(p,'variable',{key:'x',initial:{type:'boolean',value:false}}),y=add(p,'variable',{key:'y',initial:{type:'boolean',value:false}});
    x.data.exclusions=[{variableId:y.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'Independent simultaneous state restriction'}];
    const q=add(p,'foreshadow',{resolutionPolicy:'this_work'}),c=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},role:'clue'}),alt=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:a.id},role:'clue'});
    q.data.requiredInfo=[c.id];q.data.alternativeInfo={[c.id]:[alt.id]};q.data.clueIds=[c.id,alt.id];
    const character=add(p,'character'),assertion=add(p,'assertion',{subjectId:character.id,predicate:'Synthetic belief',value:{type:'boolean',value:true},truthKind:'belief',holderId:character.id});
    const line=add(p,'dialogue_line',{claimAssertionIds:[assertion.id],assertionIntent:'quotation',assertionReason:'Source intent'});
    const ended=stepTrial(p,startTrial(p,{entryId:a.id}),{edgeId:e.id});const {trace}=await savePath(p,ended);const set=add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});
    expect(validateProject(p).ok).toBe(true);const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project;
    expect((restored.entities.find(v=>v.id===x.id) as Entity<'variable'>).data.exclusions).toEqual(x.data.exclusions);
    expect((restored.entities.find(v=>v.id===q.id) as Entity<'foreshadow'>).data.alternativeInfo).toEqual(q.data.alternativeInfo);
    const {project:cloned,idMap}=await cloneProject(restored);expect(validateProject(cloned).ok).toBe(true);
    expect((cloned.entities.find(v=>v.id===idMap[x.id]) as Entity<'variable'>).data.exclusions?.[0].variableId).toBe(idMap[y.id]);
    expect((cloned.entities.find(v=>v.id===idMap[q.id]) as Entity<'foreshadow'>).data.alternativeInfo).toEqual({[idMap[c.id]]:[idMap[alt.id]]});
    expect((cloned.entities.find(v=>v.id===idMap[line.id]) as Entity<'dialogue_line'>).data.claimAssertionIds).toEqual([idMap[assertion.id]]);
    expect((cloned.entities.find(v=>v.id===idMap[set.id]) as Entity<'collection'>).data.memberIds).toEqual([idMap[trace.id]]);
    const cloneReplay=await replaySavedTraceVerified(cloned,idMap[trace.id]);record('R5P01',p,{expected:'new IDs/fields preserved; cloned trace replays terminal',actual:cloneReplay.status,clonedValidation:validateProject(cloned).ok});expect(cloneReplay.status).toBe('terminal');
  });
  it('R5P02 existing executable exporters reject an unsupported exclusion instead of silently dropping it',async()=>{
    const {p,b}=simpleFlow();const x=add(p,'variable',{key:'x',initial:{type:'boolean',value:false}}),y=add(p,'variable',{key:'y',initial:{type:'boolean',value:false}});
    const included=[...p.entities];included.forEach(e=>e.status='confirmed');
    const profile=add(p,'projection_profile',{audience:'reader',includedIds:included.map(e=>e.id),allowedKinds:[...new Set(included.map(e=>e.kind))],namePolicy:{defaultPolicy:{mode:'exclude'},byEntityId:Object.fromEntries(included.map((e,i)=>[e.id,{mode:'replace',replacement:'Public '+i}]))},publicTitle:'Synthetic public fixture',idPolicy:'preserve',publicTexts:{[x.id]:{key:'x'},[y.id]:{key:'y'},[b.id]:{terminalReason:'Declared ending'}}});profile.status='confirmed';
    expect(validateProject(p).ok).toBe(true);
    const baseline=await exportProject(p,{profile:'runtime_json',projectionProfileId:profile.id,targetRevision:p.revision});expect(baseline.ok,JSON.stringify(baseline)).toBe(true);
    x.data.exclusions=[{variableId:y.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'Cannot hold both'}];
    const results=[];for(const format of ['runtime_json','playable_preview'] as const){const result=await exportProject(p,{profile:format,projectionProfileId:profile.id,targetRevision:p.revision});results.push({format,result});expect(result.ok).toBe(false);if(!result.ok)expect(result.issues.some(i=>i.code==='EXPORT_UNSUPPORTED'&&i.field==='exclusions')).toBe(true);}record('R5P02',p,{expected:'unsupported exclusion explicitly refused by executable profiles',actual:results});
  });
});
