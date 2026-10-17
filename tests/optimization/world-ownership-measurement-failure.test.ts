import {expect,it,vi} from 'vitest';
import {createHistoryObserver} from './history-measurement-core';
const modulePath='../../scripts/optimization/measure-world-ownership.mjs';
const {interruptedOperation}=await import(modulePath);
const snapshot=(pending:number)=>({version:1 as const,counters:{'db.write.aborted.worlds':pending?0:1},events:[],droppedEvents:0,pendingTransactions:pending});
it('keeps rejected OFF elapsed outside checkpoint work using the reviewed observer',async()=>{
 let clock=0;const result:any={operations:[]},saved:any[]=[];
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},result,async()=>{saved.push(structuredClone(result));clock+=100;},{clock:()=>clock,startProbe:()=>{throw Error('OFF probe forbidden');}});
 await expect(observe('P205 rejected save',false,async()=>{clock+=11;throw Error('literal P205 rejection');})).rejects.toThrow('literal P205 rejection');
 expect(result.operations[0]).toMatchObject({milliseconds:11,error:{message:'literal P205 rejection'},apiCompletion:'rejected'});expect(saved[0].activeOperation).toMatchObject({phase:'pre-invocation',apiCompletion:'UNKNOWN'});
});
it('retains rejected ON partial counters and a separate settlement error without latency',async()=>{
 const result:any={operations:[]},settle=vi.fn(async()=>{throw Error('observation interrupted');});
 const observe=createHistoryObserver({mode:'capture',historyCountersSupported:true},result,async()=>{},{clock:()=>{throw Error('ON clock forbidden');},startProbe:()=>({snapshot:()=>snapshot(1),settle,stop:()=>snapshot(1)})});
 await expect(observe('P205 rejected ON',true,async()=>{throw Error('original API error');})).rejects.toThrow('original API error');
 expect(settle).toHaveBeenCalled();expect(result.operations[0]).toMatchObject({error:{message:'original API error'},observationError:{message:'observation interrupted'},counterCompleteness:'UNKNOWN: unsettled partial snapshot',probe:{pendingTransactions:1}});expect(result.operations[0]).not.toHaveProperty('milliseconds');
});
it.each([false,true])('preserves interruption intent and earlier rows, earlier=%s',earlier=>{
 const observations={operations:earlier?[{label:'earlier',milliseconds:11}]:[],activeOperation:{label:'P205 unfinished',probeEnabled:true,phase:'pre-invocation',apiCompletion:'UNKNOWN'}};
 const before=structuredClone(observations),actual=interruptedOperation(observations,'watchdog');
 expect(actual).toMatchObject({activeOperation:{label:'P205 unfinished',phase:'pre-invocation'},apiCompletion:'UNKNOWN',apiMilliseconds:'UNKNOWN: outer interruption is not an API completion',completedOperationRowsRetained:earlier?1:0});expect(observations).toEqual(before);expect(actual).not.toHaveProperty('milliseconds');
});
