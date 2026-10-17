import 'fake-indexeddb/auto';
import {expect,it,vi} from 'vitest';
import {jsonBytes,sha256} from '../../src/storage/json';
import {validateProject} from '../../src/domain/model';
import {heavyHistoryFixture,HEAVY_HISTORY_BYTES,HEAVY_HISTORY_SHA256} from './history-measurement-fixtures';
import {runHistoryMeasurement} from './history-measurement-core';
import * as probeModule from '../../src/observability/probe';

it('retains the independently frozen extra HTTP fixture bytes and literal bodies',async()=>{
 const fixture=heavyHistoryFixture(),bytes=jsonBytes(fixture);
 expect(bytes.byteLength).toBe(HEAVY_HISTORY_BYTES);expect(await sha256(bytes)).toBe(HEAVY_HISTORY_SHA256);
 expect(validateProject(fixture).ok).toBe(true);expect(fixture.entities).toEqual([]);expect(fixture.history).toHaveLength(2);
 expect(fixture.history[0].after.entities.at(-1)?.data).toMatchObject({body:[{text:'本文一致の独立期待😀'}]});
});

it('runs the original direct100 correctness path without latency fields or probe capture',async()=>{
 const probe=vi.spyOn(probeModule,'startProbe');const checkpoints:unknown[]=[];
 try{
  const result=await runHistoryMeasurement({suite:'legacy100',mode:'check',historyCountersSupported:true,runId:crypto.randomUUID()},async value=>{checkpoints.push(value);});
  expect(result.status).toBe('ok');expect(probe).not.toHaveBeenCalled();expect(result.runs).toHaveLength(1);
  expect(result.runs[0].native.representations).toEqual({inline:100,packedFallback:0,canonical:0});
  expect(result.runs[0]['page-first'].revisions[0]).toBe('100');expect(result.runs[0]['page-last'].revisions.at(-1)).toBe('1');
  expect(result.runs[0].historyCount).toBe(100);expect(result.operations).toHaveLength(6);
  expect(result.operations.every((row:Record<string,unknown>)=>!('milliseconds'in row)&&!('probe'in row))).toBe(true);expect(checkpoints.length).toBeGreaterThan(6);
 }finally{probe.mockRestore();}
});
