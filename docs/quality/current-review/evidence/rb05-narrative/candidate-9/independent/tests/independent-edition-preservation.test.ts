import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { prepareTraceReconfirmation } from '../src/domain/traceReconfirmation';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { validateProject } from '../src/domain/model';
import type { Entity, ProjectData } from '../src/domain/types';
const out='/tmp/shinariokanri-independent-rb05-narrative-7a40c7c/independent/fixtures',save=(id:string,data:unknown)=>writeFileSync(`${out}/${id}.json`,JSON.stringify(data,null,2)+'\n');
it('EN12 typed initial stub IDs and provenance survive native/clone and stay stub on reconfirmation',async()=>{
 const f=JSON.parse(readFileSync(out+'/EN01.json','utf8')),p:ProjectData=f.project,restored=(await inspectScenario(await exportScenario(p),{worker:false})).project,clone=await cloneProject(restored),results=[];
 for(const target of[restored,clone.project]){const map=target===clone.project?clone.idMap:undefined,traceId=map?.[f.old.trace.id]??f.old.trace.id,key=map?.[Object.keys(f.old.trace.data.initialStubValues.variables)[0]]??Object.keys(f.old.trace.data.initialStubValues.variables)[0],trace=target.entities.find((e):e is Entity<'trace'>=>e.kind==='trace'&&e.id===traceId)!,replay=await replaySavedTraceVerified(target,traceId),plan=await prepareTraceReconfirmation(target,traceId),cp=plan.entities.find((e):e is Entity<'checkpoint'>=>e.kind==='checkpoint')!,next=plan.entities.find((e):e is Entity<'trace'>=>e.kind==='trace')!;results.push({valid:validateProject(target).ok,initialStub:trace.data.initialStubValues!.variables![key],replayStatus:replay.status,replayProvenance:replay.startState.provenance,nextValue:cp.data.runtimeState.variableValues[key],nextProvenance:cp.data.runtimeState.provenance,nextMode:next.data.externalMode});}
 save('EN12',{project:p,restored,clone,results});expect(results).toEqual(Array.from({length:2},()=>({valid:true,initialStub:{type:'integer',value:8},replayStatus:'terminal',replayProvenance:'stub',nextValue:{type:'integer',value:8},nextProvenance:'stub',nextMode:'stub'})));
});
it('EN13 genuine a21 stub record remains replayable but missing original input blocks current-edition reconfirmation',async()=>{
 const f=JSON.parse(readFileSync('/tmp/shinariokanri-independent-rb05-narrative-a21a5d3/independent/fixtures/EN01.json','utf8')),p:ProjectData=f.project;expect(f.old.trace.data.initialStubValues).toBeUndefined();const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project,clone=await cloneProject(restored),results=[];
 for(const target of[restored,clone.project]){const map=target===clone.project?clone.idMap:undefined,traceId=map?.[f.old.trace.id]??f.old.trace.id,replay=await replaySavedTraceVerified(target,traceId);let error='';try{await prepareTraceReconfirmation(target,traceId);}catch(e){error=(e as Error).message;}results.push({valid:validateProject(target).ok,replayStatus:replay.status,replayProvenance:replay.startState.provenance,error});}
 save('EN13',{origin:'a21a5d3 independently saved EN01 fixture; content unchanged',project:p,restored,clone,results});expect(results.every(r=>r.valid&&r.replayStatus==='terminal'&&r.replayProvenance==='stub')).toBe(true);expect(results.every(r=>/仮入力|開始状態|移行/.test(r.error))).toBe(true);
});
