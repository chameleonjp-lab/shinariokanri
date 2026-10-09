/** Opt-in local numeric instrumentation; no authored text or network payload. */
export function performanceEnabled(){try{return sessionStorage.getItem('scenario-performance')==='measure';}catch{return false;}}
export function commandMeasurementStart(){return performanceEnabled()?performance.now():undefined;}
export function commandCommitted(start:number|undefined,operationId:string,milliseconds?:Record<string,number>){
  if(start===undefined||!Number.isFinite(start)||start<0||!performanceEnabled())return;
  try{performance.measure('scenario-local-save',{start,end:performance.now(),detail:{operationId,...milliseconds?{milliseconds}:{} }});}catch{/* Instrumentation cannot change the committed result. */}
}
export function readMeasured(start:number|undefined,projectId:string,milliseconds:Record<string,number>){
  if(start===undefined||!Number.isFinite(start)||start<0||!performanceEnabled())return;
  try{performance.measure('scenario-local-read',{start,end:performance.now(),detail:{projectId,milliseconds}});}catch{/* Optional timing must never change a read result. */}
}
