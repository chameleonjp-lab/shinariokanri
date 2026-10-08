import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectScenario } from '../src/storage/archive';
import { replaySavedTrace } from '../src/domain/runtime';
import { replayChapterReading } from '../src/domain/presentation';
const fixtures='/workspace/shinariokanri/docs/quality/current-review/evidence/legacy/';
it('the preserved flow fixture is valid and replays on its actual baseline',async()=>{
 const {traceId}=JSON.parse(readFileSync(fixtures+'3099c9d-flow-trace.json','utf8')),prepared=await inspectScenario(new Uint8Array(readFileSync(fixtures+'3099c9d-flow-trace.scenario')));
 const replay=replaySavedTrace(prepared.project,traceId);expect(replay.status).toBe('terminal');expect(replay.issues).toEqual([]);
});
it('the preserved chapter fixture is valid and replays on its actual baseline',async()=>{
 const {traceId,checkpointId}=JSON.parse(readFileSync(fixtures+'3099c9d-chapter-trace.json','utf8')),prepared=await inspectScenario(new Uint8Array(readFileSync(fixtures+'3099c9d-chapter-trace.scenario')));
 const replay=await replayChapterReading(prepared.project,prepared.project.entities.find(e=>e.id===traceId)!.data as any,prepared.project.entities.find(e=>e.id===checkpointId)!.data as any,{});expect(replay.status).toBe('terminal');expect(replay.issues).toEqual([]);
});
