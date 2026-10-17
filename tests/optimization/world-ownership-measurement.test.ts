import 'fake-indexeddb/auto';
import {expect,it,vi} from 'vitest';
import * as probeModule from '../../src/observability/probe';
import {runWorldOwnershipMeasurement} from './world-ownership-measurement-core';

it('checks independent literal multi-world results without starting latency clocks or probes',async()=>{
 const probe=vi.spyOn(probeModule,'startProbe'),forbidden=()=>{throw Error('P205 check instrumentation forbidden');};
 try{
  const result=await runWorldOwnershipMeasurement({suite:'supplemental',mode:'check',runId:crypto.randomUUID(),worldCountersSupported:true},async()=>{},{clock:forbidden,startProbe:forbidden});
  expect(result.status).toBe('ok');expect(probe).not.toHaveBeenCalled();expect(result.runs).toHaveLength(1);
  expect(result.runs[0].selections.map((row:any)=>row.name)).toEqual(['P205 work 0','P205 work 1','P205 work 2','P205 work 3','P205 work 4','P205 work 5']);
  expect(result.runs[0].retention.projects).toBeLessThanOrEqual(4);expect(result.runs[0].retention.epochs).toBeLessThanOrEqual(4);
  expect(result.runs[0].exportedWorldKeys).toEqual(['a2050000-0000-4000-8000-000000000fa0']);
  expect(result.operations.every((row:any)=>!('milliseconds'in row)&&!('probe'in row))).toBe(true);
 }finally{probe.mockRestore();}
});
