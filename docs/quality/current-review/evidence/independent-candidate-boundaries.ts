import { describe, expect, it } from 'vitest';
import { createProject, createEntity, emptyValidity, validateProject, validateRuntimeState } from '../src/domain/model';
import { initializeRuntimeState, applyEffectsAtomic } from '../src/domain/conditions';
import { startTrial, stepTrial } from '../src/domain/runtime';
import { presentContent, startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import type { Entity, ProjectData, ScenarioException } from '../src/domain/types';

function add<K extends Entity['kind']>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}) { const e=createEntity(p.projectId,kind,kind,data) as Entity<K>;p.entities.push(e);return e; }
function fixture(sameScene=false) {
 const p=createProject('Independent candidate boundaries'),s1=add(p,'scene'),s2=sameScene?s1:add(p,'scene');
 const c1=add(p,'chapter',{sceneIds:[s1.id]}),c2=sameScene?c1:add(p,'chapter',{sceneIds:[s2.id]});s1.data.chapterId=c1.id;s2.data.chapterId=c2.id;
 const a=add(p,'flow_node',{nodeType:'entry',sceneId:s1.id,executionPolicy:'first_match'}),b=add(p,'flow_node',{nodeType:'terminal',sceneId:s2.id,terminalReason:'end'});
 add(p,'flow_edge',{fromId:a.id,toId:b.id,edgeType:'automatic',priority:0});return {p,s1,s2,c1,c2,a,b};
}

describe('Independent candidate boundary checks: Node only',()=>{
 it('IC01 records every scene/chapter/run reset cause in a terminal transition',()=>{
  const {p}=fixture();const v=add(p,'variable',{key:'value',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'scene_end',value:{type:'integer',value:0},reason:'scene closed'},{on:'chapter_end',value:{type:'integer',value:1},reason:'chapter closed'},{on:'run_end',value:{type:'integer',value:2},reason:'run closed'}]});
  expect(validateProject(p).ok).toBe(true);const state=initializeRuntimeState(p);state.variableValues[v.id]={type:'integer',value:5};const trial=stepTrial(p,startTrial(p,{state}));
  expect(trial.status).toBe('terminal');expect(trial.state.variableValues[v.id]).toEqual({type:'integer',value:2});
  expect(trial.state.resetCauses?.map(c=>[c.on,c.before,c.after,c.reason])).toEqual([['scene_end',{type:'integer',value:5},{type:'integer',value:0},'scene closed'],['chapter_end',{type:'integer',value:0},{type:'integer',value:1},'chapter closed'],['scene_end',{type:'integer',value:1},{type:'integer',value:0},'scene closed'],['chapter_end',{type:'integer',value:0},{type:'integer',value:1},'chapter closed'],['run_end',{type:'integer',value:1},{type:'integer',value:2},'run closed']]);
 });
 it('IC02 closing a run also closes its final scene even when terminal reuses that scene',()=>{
  const {p}=fixture(true);const v=add(p,'variable',{key:'scene_state',scope:'scene',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'scene_end',value:{type:'integer',value:0}}]});
  expect(validateProject(p).ok).toBe(true);const state=initializeRuntimeState(p);state.variableValues[v.id]={type:'integer',value:5};const trial=stepTrial(p,startTrial(p,{state}));expect(trial.status).toBe('terminal');expect(trial.state.variableValues[v.id]).toEqual({type:'integer',value:0});
 });
 it('IC03 chapter reading executes the same scene boundary declaration as flow reading',async()=>{
  const {p,s1,s2}=fixture();const v=add(p,'variable',{key:'scene_state',scope:'scene',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'scene_end',value:{type:'integer',value:0}}]});
  const state=initializeRuntimeState(p);state.variableValues[v.id]={type:'integer',value:5};let chapter=await startChapterReading(p,{sceneIds:[s1.id,s2.id],state});chapter=presentNextChapterScene(p,chapter);chapter=presentNextChapterScene(p,chapter);const flow=stepTrial(p,startTrial(p,{state}));
  expect(chapter.status).toBe('terminal');expect(chapter.state.variableValues[v.id]).toEqual(flow.state.variableValues[v.id]);expect(chapter.state.variableValues[v.id]).toEqual({type:'integer',value:0});
 });
 it('IC04 a valid partial state remains valid after a declaration initializes its missing value',()=>{
  const {p}=fixture();const v=add(p,'variable',{key:'value',scope:'scene',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},resetRules:[{on:'scene_end',value:{type:'integer',value:0}}]});
  const state=initializeRuntimeState(p);delete state.variableValues[v.id];expect(validateRuntimeState(state).ok).toBe(true);const before=startTrial(p,{state});expect(before.status).toBe('ready');const trial=stepTrial(p,before);expect(trial.status).toBe('terminal');expect(validateRuntimeState(trial.state).ok).toBe(true);
 });
 it('IC05 observes all disclosure conditions before any disclosure effects',()=>{
  const {p,a,s1}=fixture();s1.data.body=[{id:crypto.randomUUID(),kind:'paragraph',text:'first'},{id:crypto.randomUUID(),kind:'paragraph',text:'second'}] as typeof s1.data.body;
  const flag=add(p,'variable',{key:'flag',initial:{type:'boolean',value:false}}),f=add(p,'foreshadow',{resolutionPolicy:'this_work'}),effect=add(p,'effect',{operation:'set',targetId:flag.id,value:{type:'boolean',value:true}});
  const d1=add(p,'disclosure',{foreshadowId:f.id,anchor:{entityId:s1.id,blockId:s1.data.body[0].id,start:0,end:1},role:'clue',stage:'hint',knowledgeEffects:[effect.id]}),d2=add(p,'disclosure',{foreshadowId:f.id,anchor:{entityId:s1.id,blockId:s1.data.body[1].id,start:0,end:1},role:'clue',stage:'hint',condition:{op:'compare',variableId:flag.id,comparator:'eq',value:{type:'boolean',value:true}}});
  expect(validateProject(p).ok).toBe(true);const state=initializeRuntimeState(p),result=presentContent(p,state,{nodeId:a.id,sceneId:s1.id});expect(result.ok).toBe(true);if(result.ok){expect(result.conditions.map(c=>[c.targetId,c.value])).toEqual([[d1.id,'true'],[d2.id,'false']]);expect(result.state.seenIds).toContain(d1.id);expect(result.state.seenIds).not.toContain(d2.id);expect(result.state.variableValues[flag.id]).toEqual({type:'boolean',value:true});}expect(state.variableValues[flag.id]).toEqual({type:'boolean',value:false});
 });
 for (const mode of ['valid','expired','out_of_scope','unknown_route','missing_tick','missing_evidence'] as const) it(`IC06 evaluates explicit transition exception ${mode} atomically`,()=>{
  const {p,c1,c2}=fixture(),evidence=add(p,'source',{locator:'Synthetic section 1'}),q=add(p,'variable',{key:'quest',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:3},transitionRules:[{from:{type:'integer',value:0},to:{type:'integer',value:1}}]}),money=add(p,'variable',{key:'money',valueType:'integer',initial:{type:'integer',value:10},allowed:{min:0,max:20}}),unknown=add(p,'variable',{key:'unknown',initial:{type:'unknown',value:null,reason:'unavailable'}});
  evidence.status='confirmed';expect(validateProject(p).ok).toBe(true);const exception:ScenarioException={reason:'intentional detour',targetScope:{projectId:p.projectId,chapterId:mode==='out_of_scope'?c2.id:c1.id,routeCondition:mode==='unknown_route'?{op:'compare',variableId:unknown.id,comparator:'eq',value:{type:'boolean',value:true}}:{op:'constant',value:true}},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}},evidenceIds:mode==='missing_evidence'?[]:[evidence.id]};
  const state=initializeRuntimeState(p),result=applyEffectsAtomic(state,[{operation:'add',targetId:money.id,value:{type:'integer',value:2}},{operation:'set',targetId:q.id,value:{type:'integer',value:3},exceptionDetails:exception}],{state,entities:p.entities,ruleContext:{projectId:p.projectId,chapterId:c1.id,worldTick:mode==='missing_tick'?undefined:mode==='expired'?'10':'5'}});
  expect(result.ok).toBe(mode==='valid');if(mode==='valid')expect(result.state.variableValues[money.id]).toEqual({type:'integer',value:12});else expect(result.state).toBe(state);
 });
 it('IC07 a known different chapter stays out of scope when graph context is unavailable',()=>{
  const {p,a,b,s1,c2}=fixture(),g=add(p,'flow_graph',{nodeIds:[a.id,b.id],entryIds:[a.id],exitIds:[]}),f=add(p,'foreshadow',{resolutionPolicy:'this_work'});
  const d=add(p,'disclosure',{foreshadowId:f.id,anchor:{entityId:s1.id,positionStatus:'unresolved',positionReason:'outside unresolved'},role:'clue',stage:'hint',targetScope:{projectId:p.projectId,chapterId:c2.id,graphId:g.id}});
  expect(validateProject(p).ok).toBe(true);const result=presentContent(p,initializeRuntimeState(p),{sceneId:s1.id});expect(result.ok).toBe(true);if(result.ok)expect(result.state.seenIds).not.toContain(d.id);
 });
});
