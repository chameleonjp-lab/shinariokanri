import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { inspectScenario } from '../src/storage/archive';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { replayChapterReading } from '../src/domain/presentation';
it('IC11 replays a successful unchanged baseline snapshot trace after a complete-file roundtrip',async()=>{
 const {traceId}=JSON.parse(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-flow-trace.json',import.meta.url),'utf8'));
 const prepared=await inspectScenario(new Uint8Array(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-flow-trace.scenario',import.meta.url))));
 const replay=await replaySavedTraceVerified(prepared.project,traceId,{});writeFileSync('/tmp/shinariokanri-independent-rb05-reuse-2-prior-prior-historical-trace-result.json',JSON.stringify({status:replay.status,issues:replay.issues,actualResetCauses:replay.state.resetCauses,storedResetCauses:prepared.project.entities.find(e=>e.id===traceId)?.data.steps[0].after.resetCauses},null,2)+'\n');expect(replay.status).toBe('terminal');expect(replay.issues).toEqual([]);
});
it('IC12 replays a successful unchanged baseline chapter trace after a complete-file roundtrip',async()=>{
 const {traceId,checkpointId}=JSON.parse(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-chapter-trace.json',import.meta.url),'utf8'));
 const prepared=await inspectScenario(new Uint8Array(readFileSync(new URL('./fixtures/independent-legacy/3099c9d-chapter-trace.scenario',import.meta.url))));
 const replay=await replayChapterReading(prepared.project,prepared.project.entities.find(e=>e.id===traceId)!.data as any,prepared.project.entities.find(e=>e.id===checkpointId)!.data as any,{});expect(replay.status).toBe('terminal');expect(replay.issues).toEqual([]);
});
