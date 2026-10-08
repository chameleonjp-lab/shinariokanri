import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { replayChapterReading, pinChapterReadingRecord } from '../src/domain/presentation';
import { pinTrialRecord } from '../src/domain/runtime';
import { createEntity, newId, validateProject } from '../src/domain/model';
import type { Entity } from '../src/domain/types';
const out='/tmp/shinariokanri-independent-rb05-narrative-7812804/independent/fixtures';
for(const mode of ['flow','chapter']as const)it(`LEG-${mode} genuine frozen main3099 trace survives current durable/native/clone and keeps its origin`,async()=>{
 const directory=new URL('../docs/quality/current-review/evidence/legacy/',import.meta.url),metaBytes=readFileSync(new URL(`3099c9d-${mode}-trace.json`,directory)),archive=readFileSync(new URL(`3099c9d-${mode}-trace.scenario`,directory)),meta=JSON.parse(metaBytes.toString()),p=(await inspectScenario(new Uint8Array(archive),{worker:false})).project;const originalTrace=p.entities.find((e):e is Entity<'trace'>=>e.kind==='trace'&&e.id===meta.traceId)!;p.entities.push(createEntity(p.projectId,'collection','独立旧経路集合',{mode:'fixed',purpose:'regression',memberIds:[meta.traceId]}));const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project,clone=await cloneProject(restored),results=[];
 for(const target of[restored,clone.project]){const map=target===clone.project?clone.idMap:undefined,trace=target.entities.find((e):e is Entity<'trace'>=>e.kind==='trace'&&e.id===(map?.[meta.traceId]??meta.traceId))!,cp=target.entities.find((e):e is Entity<'checkpoint'>=>e.kind==='checkpoint'&&e.id===trace.data.startCheckpointId)!,replayed=mode==='flow'?await replaySavedTraceVerified(target,trace.id):await replayChapterReading(target,trace.data,cp.data),coverage=mode==='flow'?pinTrialRecord(replayed as Awaited<ReturnType<typeof replaySavedTraceVerified>>,{checkpointId:newId(),snapshotId:newId()},target).trace.coverage!:pinChapterReadingRecord(replayed as Awaited<ReturnType<typeof replayChapterReading>>,{checkpointId:newId(),snapshotId:newId()},target).trace.coverage!;results.push({valid:validateProject(target).ok,status:replayed.status,provenance:replayed.startState.provenance,coverage:coverage.declaredTests});}
 writeFileSync(`${out}/LEG-${mode}.json`,JSON.stringify({sourceFixtureSha256:createHash('sha256').update(archive).digest('hex'),sourceMetadataSha256:createHash('sha256').update(metaBytes).digest('hex'),originalTrace,results},null,2)+'\n');expect(results.every(x=>x.valid&&x.status==='terminal')).toBe(true);expect(restored.entities.find(e=>e.id===originalTrace.id)).toEqual(originalTrace);if(mode==='chapter'){expect(results.every(x=>x.provenance==='partial'&&x.coverage.checked===0&&x.coverage.total===1&&x.coverage.byProvenance?.partial?.checked===1)).toBe(true);}else{expect(results.every(x=>x.provenance==='full_play'&&x.coverage.total===1&&x.coverage.checked===1)).toBe(true);}
});
