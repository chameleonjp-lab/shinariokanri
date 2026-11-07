import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import { pinTrialRecord, startTrial, stepTrial } from '../src/domain/runtime';
import { captureRegressionExpectation, runRegressionCollection } from '../src/domain/regressionPaths';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage/json';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
async function fixture(withUnrelatedUnknown=false){
 const p=createProject('二経路の期待値'), entry=createEntity(p.projectId,'flow_node','入口',{nodeType:'entry'}), a=createEntity(p.projectId,'flow_node','A',{nodeType:'terminal',terminalReason:'Aの結末'}), b=createEntity(p.projectId,'flow_node','B',{nodeType:'terminal',terminalReason:'Bの結末'}), edgeA=createEntity(p.projectId,'flow_edge','Aへ',{fromId:entry.id,toId:a.id}), edgeB=createEntity(p.projectId,'flow_edge','Bへ',{fromId:entry.id,toId:b.id}), variable=createEntity(p.projectId,'variable','鍵',{key:'key',valueType:'boolean',initial:{type:'boolean',value:true}});p.entities.push(entry,a,b,edgeA,edgeB,variable);
 if(withUnrelatedUnknown)p.entities.push(createEntity(p.projectId,'variable','未使用の未定値',{key:'unused_unknown',valueType:'boolean',initial:{type:'unknown',value:null,reason:'経路の条件には使わない'}}));
 const traces=[];
 for(const edge of [edgeA,edgeB]){const ids={checkpointId:newId(),snapshotId:newId()},r=pinTrialRecord(stepTrial(p,startTrial(p,{seed:'repeatable'}),{edgeId:edge.id}),ids),cp={...createEntity(p.projectId,'checkpoint','開始',r.checkpoint),id:ids.checkpointId},trace=createEntity(p.projectId,'trace',edge.name,r.trace);p.entities.push(cp,trace);p.snapshots.push({id:ids.snapshotId,content:r.content,contentHash:await sha256(jsonBytes(r.content)),createdAt:'2026-11-06T00:00:00Z',versionLabel:'元の結末'});traces.push(trace);}
 const collection=createEntity(p.projectId,'collection','回帰集合',{mode:'fixed',purpose:'regression',memberIds:traces.map(t=>t.id)});p.entities.push(collection);return {p,a,b,edgeA,edgeB,variable,traces,collection};
}
describe('G14 declared ending/state regression routes',()=>{
 it('reports one match and one mismatch after only one ending changes, with source/start/seed and first differing choice',async()=>{
  const f=await fixture();for(const trace of f.traces)trace.data.expectation=await captureRegressionExpectation(f.p,trace.id);
  f.a.data.terminalReason='Aを直した結末';f.variable.data.initial={type:'boolean',value:false};f.p.revision='2';const old=JSON.stringify(f.traces);
  const report=await runRegressionCollection(f.p,f.collection.id);
  expect(report.routes.map(r=>r.status)).toEqual(['mismatch','match']);expect(report.routes[0].firstDifference).toMatchObject({choice:1,edgeIds:[f.edgeA.id]});expect(report.routes[0].sourceVersionId).toBe(f.traces[0].data.contentVersionId);expect(report.routes[0].seed).toBe('repeatable');expect(report.routes[0].startState?.variableValues[f.variable.id]).toEqual({type:'boolean',value:true});expect(JSON.stringify(f.traces)).toBe(old);
  f.p.entities=f.p.entities.filter(e=>e.id!==f.edgeB.id);expect((await runRegressionCollection(f.p,f.collection.id)).routes[1].status).toBe('unexecutable');
 });
 it('distinguishes an executable redirected choice from a deleted or false choice',async()=>{
  const f=await fixture();for(const trace of f.traces)trace.data.expectation=await captureRegressionExpectation(f.p,trace.id);
  f.edgeA.data.toId=f.b.id;const redirected=await runRegressionCollection(f.p,f.collection.id);expect(redirected.routes[0].status).toBe('mismatch');expect(redirected.routes[0].firstDifference).toMatchObject({choice:1,edgeIds:[f.edgeA.id]});
  f.edgeA.data.condition={op:'constant',value:false};expect((await runRegressionCollection(f.p,f.collection.id)).routes[0].status).toBe('unexecutable');
 });
 it('rejects nonterminal expectations and references from a different source edition',async()=>{
  const f=await fixture(),trace=f.traces[0];trace.data.expectation=await captureRegressionExpectation(f.p,trace.id);
  trace.data.expectation.ending.entityId=f.edgeA.data.fromId;expect(validateProject(f.p).ok).toBe(false);
  trace.data.expectation.ending.entityId=f.a.id;trace.data.expectation.state[0].sourceVersionId=f.traces[1].data.contentVersionId;expect(validateProject(f.p).ok).toBe(false);
 });
 it('keeps typed edition-scoped expectations through native export/import and cloning; old archives remain readable',async()=>{
  const f=await fixture();const old=await inspectScenario(await exportScenario(f.p));expect(old.project.entities.find(e=>e.id===f.traces[0].id)?.data).not.toHaveProperty('expectation');
  for(const trace of f.traces)trace.data.expectation=await captureRegressionExpectation(f.p,trace.id);
  // The expected ending lives in the old fixed source even if removed from the current manuscript.
  f.p.entities=f.p.entities.filter(e=>e.id!==f.a.id&&e.id!==f.edgeA.id);expect(validateProject(f.p)).toMatchObject({ok:true});
  const bytes=await exportScenario(f.p),files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));expect(manifest.requiredFeatures).toContain('regression-expectation-v1');
  const restored=(await inspectScenario(bytes)).project,clone=await cloneProject(restored),trace=clone.project.entities.find(e=>e.id===clone.idMap[f.traces[0].id]);
  expect(trace?.kind).toBe('trace');if(trace?.kind!=='trace')throw new Error('trace');expect(trace.data.expectation?.ending).toMatchObject({entityId:clone.idMap[f.a.id],sourceVersionId:clone.idMap[f.traces[0].data.contentVersionId]});expect(trace.data.expectation?.state[0].entityId).toBe(clone.idMap[f.variable.id]);expect(validateProject(clone.project)).toMatchObject({ok:true});
  manifest.requiredFeatures=manifest.requiredFeatures.filter((v:string)=>v!=='regression-expectation-v1');files['manifest.json']=strToU8(JSON.stringify(manifest));await expect(inspectScenario(zipSync(files))).rejects.toThrow('必須機能');
 });
});

it('compares only declared state expectations and keeps unrelated unused unknown values outside that scope',async()=>{
 const f=await fixture(true),unused=f.p.entities.find(e=>e.kind==='variable'&&e.data.key==='unused_unknown')!;
 for(const trace of f.traces){trace.data.expectation=await captureRegressionExpectation(f.p,trace.id);trace.data.expectation.state=trace.data.expectation.state.filter(value=>value.entityId===f.variable.id);}
 expect((await runRegressionCollection(f.p,f.collection.id)).routes.map(row=>row.status)).toEqual(['match','match']);
 f.traces[0].data.expectation!.state.push({entityId:unused.id,sourceVersionId:f.traces[0].data.contentVersionId,value:{type:'boolean',value:true}});
 expect((await runRegressionCollection(f.p,f.collection.id)).routes[0].status).toBe('unexecutable');
});
