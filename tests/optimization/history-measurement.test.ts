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

import {createHistoryObserver} from './history-measurement-core';
const snapshot=(pending=0)=>({version:1 as const,counters:{'db.write.aborted.commands':pending?0:1},events:[],droppedEvents:0,pendingTransactions:pending});
it('retains rejected OFF API elapsed and excludes start/end checkpoint work',async()=>{
 let clock=0;const state:any={operations:[]},saved:any[]=[];
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},state,async()=>{saved.push(structuredClone(state));clock+=100;},{clock:()=>clock,startProbe:()=>{throw Error('OFF probe forbidden');}});
 await expect(observe('failed-save',false,async()=>{clock+=7;throw Error('literal rejected write');})).rejects.toThrow('literal rejected write');
 expect(state.operations[0]).toMatchObject({label:'failed-save',status:'error',milliseconds:7,error:{message:'literal rejected write'}});
 expect(saved[0].activeOperation).toMatchObject({label:'failed-save',phase:'pre-invocation',apiCompletion:'UNKNOWN',probeEnabled:false});
});
it('retains original ON rejection and marks a failed probe settlement incomplete without latency',async()=>{
 const state:any={operations:[]};const settle=vi.fn(async()=>{throw Error('native settlement interrupted');});
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},state,async()=>{}, {clock:()=>{throw Error('ON clock forbidden');},startProbe:()=>({settle,stop:()=>snapshot(1),snapshot:()=>snapshot(1)})});
 await expect(observe('failed-ON',true,async()=>{throw Error('literal ON rejection');})).rejects.toThrow('literal ON rejection');
 expect(settle).toHaveBeenCalled();expect(state.operations[0]).toMatchObject({status:'error',error:{message:'literal ON rejection'},observationError:{message:'native settlement interrupted'},counterCompleteness:'UNKNOWN: unsettled partial snapshot',probe:{pendingTransactions:1}});
 expect(state.operations[0]).not.toHaveProperty('milliseconds');
});
it.each([false,true])('persists the pending operation before interruption, earlier completion=%s',async earlier=>{
 const state:any={operations:[]},saved:any[]=[];let release!:()=>void;
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},state,async()=>{saved.push(structuredClone(state));},{clock:()=>9,startProbe:()=>{throw Error('OFF probe forbidden');}});
 if(earlier)await observe('earlier',false,async()=>42);
 const pending=observe('never-finished-yet',false,()=>new Promise<void>(resolve=>{release=resolve;}));await Promise.resolve();
 const retained=saved.at(-1);if(earlier)expect(retained.operations[0]).toMatchObject({label:'earlier',status:'ok'});else expect(retained.operations).toEqual([]);
 expect(retained.activeOperation).toMatchObject({label:'never-finished-yet',phase:'pre-invocation',apiCompletion:'UNKNOWN'});
 expect(retained.activeOperation).not.toHaveProperty('milliseconds');release();await pending;
});
it('waits for failed ON native counters when settlement succeeds',async()=>{
 const state:any={operations:[]};let pending=1;
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},state,async()=>{}, {clock:()=>{throw Error('ON clock forbidden');},startProbe:()=>({settle:async()=>{pending=0;},stop:()=>snapshot(pending),snapshot:()=>snapshot(pending)})});
 await expect(observe('rejected-with-settled-abort',true,async()=>{throw Error('original rejection');})).rejects.toThrow('original rejection');
 expect(state.operations[0]).toMatchObject({status:'error',apiCompletion:'rejected',counterCompleteness:'settled capture',probe:{pendingTransactions:0,counters:{'db.write.aborted.commands':1}}});expect(state.operations[0]).not.toHaveProperty('milliseconds');
});
it('keeps check-mode rejection free of interval clocks and probes',async()=>{
 const state:any={operations:[]};const forbidden=()=>{throw Error('check-mode instrumentation forbidden');};
 const observe=createHistoryObserver({mode:'check',historyCountersSupported:false},state,async()=>{}, {clock:forbidden,startProbe:forbidden});
 await expect(observe('check-rejected',true,async()=>{throw Error('literal check rejection');})).rejects.toThrow('literal check rejection');
 expect(state.operations[0]).toMatchObject({status:'error',probeEnabled:false,error:{message:'literal check rejection'}});expect(state.operations[0]).not.toHaveProperty('milliseconds');expect(state.operations[0]).not.toHaveProperty('probe');
});
