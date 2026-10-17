import {expect,it} from 'vitest';
const driverModule='../../scripts/optimization/measure-history-metadata.mjs';
const {interruptedOperation}=await import(driverModule);
it.each(['watchdog','pageerror'])('keeps %s interruption distinct from an API rejection before any completed API',cause=>{
 const observations={operations:[],activeOperation:{label:'initial-save',mode:'capture',probeEnabled:false,phase:'pre-invocation',apiCompletion:'UNKNOWN',apiInvocation:'UNKNOWN: intent persisted before invocation'}};
 const result=interruptedOperation(observations,cause);
 expect(result).toMatchObject({cause,activeOperation:{label:'initial-save',phase:'pre-invocation'},apiCompletion:'UNKNOWN',apiMilliseconds:'UNKNOWN: outer interruption is not an API completion',completedOperationRowsRetained:0});
 expect(result).not.toHaveProperty('milliseconds');expect(observations.operations).toEqual([]);
});
it('retains earlier rows and marks interrupted ON settlement incomplete without a latency',()=>{
 const observations={operations:[{label:'initial-save',status:'ok',milliseconds:7},{label:'rename-one',status:'pending-observation',apiCompletion:'rejected',error:{message:'writer rejected'},probe:{pendingTransactions:1},counterCompleteness:'UNKNOWN: unsettled partial snapshot'}],activeOperation:{label:'rename-one',probeEnabled:true,phase:'probe-settling',apiCompletion:'rejected'}};
 const before=structuredClone(observations),result=interruptedOperation(observations,'watchdog');
 expect(result).toMatchObject({activeOperation:{label:'rename-one',probeEnabled:true},apiCompletion:'rejected',counterCompleteness:'UNKNOWN: no final settled snapshot',completedOperationRowsRetained:2});
 expect(observations).toEqual(before);expect(result).not.toHaveProperty('milliseconds');
});
