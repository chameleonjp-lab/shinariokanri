import { expect, it } from 'vitest';
import { createProject, createEntity } from '../src/domain/model';
import { initializeRuntimeState } from '../src/domain/conditions';
import { startChapterReading } from '../src/domain/presentation';
import { analyzeFlowVerified } from '../src/domain/runtimeVerified';
import type { AnalysisOptions } from '../src/domain/runtime';
it('IC16 chapter world tick is captured before asynchronous content verification',async()=>{
 const p=createProject('Capture'),s=createEntity(p.projectId,'scene','scene');p.entities.push(s);const options={sceneIds:[s.id],worldTick:'5'};const pending=startChapterReading(p,options);options.worldTick='10';options.sceneIds.length=0;const session=await pending;expect(session.worldTick).toBe('5');expect(session.sceneIds).toEqual([s.id]);
});
it('IC17 analysis nested state/stub and entry are captured before asynchronous verification',async()=>{
 const p=createProject('Capture'),q=createEntity(p.projectId,'variable','gate',{key:'gate',initial:{type:'boolean',value:false}}),a=createEntity(p.projectId,'flow_node','entry',{nodeType:'entry',executionPolicy:'first_match',gate:{op:'compare',variableId:q.id,comparator:'eq',value:{type:'boolean',value:true}}}),b=createEntity(p.projectId,'flow_node','end',{nodeType:'terminal',terminalReason:'end'}),e=createEntity(p.projectId,'flow_edge','advance',{fromId:a.id,toId:b.id,edgeType:'automatic',priority:0});p.entities.push(q,a,b,e);
 const options:AnalysisOptions={entryId:a.id,state:initializeRuntimeState(p),stub:{variables:{[q.id]:{type:'boolean',value:true}}},presentationResults:[]};const pending=analyzeFlowVerified(p,options,{});options.entryId=b.id;options.state!.contentVersionId=crypto.randomUUID();options.stub!.variables![q.id]={type:'boolean',value:false};options.presentationResults!.push({targetId:crypto.randomUUID(),value:'unknown',reasons:['changed caller input']});const result=await pending;
 expect(result.targetIds).toContain(a.id);expect(result.findings.some(f=>f.path.includes(a.id)&&f.path.includes(b.id)&&f.status==='intentional')).toBe(true);expect(result.findings.some(f=>f.message.includes('開始状態と作品版'))).toBe(false);
});
