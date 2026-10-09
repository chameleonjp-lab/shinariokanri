/** Diagnostics are user-exported metadata; never accept a payload, text, or error stack. */
export type DiagnosticCode = 'VALIDATION_FAILED' | 'REFERENCE_INVALID' | 'LOCAL_SAVE_FAILED' | 'QUOTA_EXCEEDED' | 'SYNC_CONFLICT' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'FORMAT_UNSUPPORTED' | 'INTEGRITY_FAILED' | 'IMPORT_LIMIT' | 'ANALYSIS_LIMIT' | 'EXPORT_UNSUPPORTED' | 'UI_RENDER_FAILED';
const codes: readonly DiagnosticCode[] = ['VALIDATION_FAILED','REFERENCE_INVALID','LOCAL_SAVE_FAILED','QUOTA_EXCEEDED','SYNC_CONFLICT','AUTH_REQUIRED','FORBIDDEN','FORMAT_UNSUPPORTED','INTEGRITY_FAILED','IMPORT_LIMIT','ANALYSIS_LIMIT','EXPORT_UNSUPPORTED','UI_RENDER_FAILED'];
const operationPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export interface DiagnosticEnvironment {commit?:string;tree?:string;dirty?:boolean;base?:string;browser?:'Chromium'|'Edge'|'Firefox'|'Safari'|'unknown';browserVersion?:string;os?:'Windows'|'macOS'|'iOS'|'Android'|'Linux'|'unknown';osVersion?:string;width?:number;height?:number;online?:boolean}
export function createDiagnostic(code: DiagnosticCode, operationId?: string, revision?: string, metadata?:DiagnosticEnvironment) {
  if (!codes.includes(code)) throw new Error('Unknown diagnostic code');
  if (operationId !== undefined && !operationPattern.test(operationId)) throw new Error('Invalid operation ID');
  if (revision !== undefined && !/^(0|[1-9]\d*)$/.test(revision)) throw new Error('Invalid revision');
  const allowed:DiagnosticEnvironment={};
  if(metadata){
    for(const key of ['commit','tree'] as const)if(typeof metadata[key]==='string'&&/^[0-9a-f]{40}$/.test(metadata[key]!))allowed[key]=metadata[key];
    if(typeof metadata.dirty==='boolean')allowed.dirty=metadata.dirty;
    if(typeof metadata.base==='string'&&/^\/[A-Za-z0-9_/-]{0,100}\/$/.test(metadata.base))allowed.base=metadata.base;
    if(['Chromium','Edge','Firefox','Safari','unknown'].includes(metadata.browser??''))allowed.browser=metadata.browser;
    if(['Windows','macOS','iOS','Android','Linux','unknown'].includes(metadata.os??''))allowed.os=metadata.os;
    for(const key of ['browserVersion','osVersion'] as const)if(typeof metadata[key]==='string'&&/^\d+(?:\.\d+){0,4}$/.test(metadata[key]!)&&metadata[key]!.length<=32)allowed[key]=metadata[key];
    for(const key of ['width','height'] as const)if(Number.isSafeInteger(metadata[key])&&metadata[key]!>=0&&metadata[key]!<=10000)allowed[key]=metadata[key];
    if(typeof metadata.online==='boolean')allowed.online=metadata.online;
  }
  return {schemaVersion:'1.0.0',code,operationId:operationId ?? null,revision:revision ?? null,environment:'browser',recordedAt:new Date().toISOString(),...(metadata?{metadata:allowed}:{})};
}

export type DiagnosticRecord=ReturnType<typeof createDiagnostic>;
const records=new Map<string,DiagnosticRecord[]>(),listeners=new Set<()=>void>(),empty:readonly DiagnosticRecord[]=[];
let activeAccount='guest';
export function diagnosticAccount(account:string|null){activeAccount=account??'guest';}
export function currentDiagnosticAccount(){return activeAccount==='guest'?null:activeAccount;}
export function diagnosticEnvironment():DiagnosticEnvironment{
  const ua=typeof navigator==='undefined'?'':navigator.userAgent;
  const browser=ua.match(/Edg\/([\d.]+)/)?'Edge':ua.match(/Firefox\/([\d.]+)/)?'Firefox':ua.match(/(?:Chrome|Chromium)\/([\d.]+)/)?'Chromium':ua.match(/Version\/([\d.]+).*Safari/)?'Safari':'unknown';
  const browserVersion=ua.match(browser==='Edge'?/Edg\/([\d.]+)/:browser==='Firefox'?/Firefox\/([\d.]+)/:browser==='Chromium'?/(?:Chrome|Chromium)\/([\d.]+)/:/Version\/([\d.]+)/)?.[1];
  const os=/iPhone|iPad|iPod/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'unknown';
  const osVersion=ua.match(os==='iOS'?/OS ([\d_]+)/:os==='Android'?/Android ([\d.]+)/:os==='Windows'?/Windows NT ([\d.]+)/:/Mac OS X ([\d_]+)/)?.[1]?.replaceAll('_','.');
  return {commit:import.meta.env.SCENARIO_BUILD_COMMIT,tree:import.meta.env.SCENARIO_BUILD_TREE,dirty:import.meta.env.SCENARIO_BUILD_DIRTY,base:import.meta.env.BASE_URL,browser,browserVersion,os,osVersion,...typeof window==='undefined'?{}:{width:window.innerWidth,height:window.innerHeight,online:navigator.onLine}};
}
/** Never serialize cause, message, path, request, manuscript, stack, account ID or Auth. */
export function recordDiagnostic(cause:unknown,context:{accountId?:string|null;operationId?:string;revision?:string;code?:DiagnosticCode}={}){
  try{
    const inputCode=cause&&typeof cause==='object'&&'code'in cause?String(cause.code):'';
    if(inputCode==='CANCELLED'||cause instanceof DOMException&&cause.name==='AbortError')return;
    const aliases:Record<string,DiagnosticCode>={SAVE_FAILED:'LOCAL_SAVE_FAILED',REVISION_CONFLICT:'SYNC_CONFLICT',OPERATION_CONFLICT:'SYNC_CONFLICT',REVISION_CHANGED:'SYNC_CONFLICT',ARCHIVE_INVALID:'INTEGRITY_FAILED',HASH_MISMATCH:'INTEGRITY_FAILED',UNSAFE_PATH:'INTEGRITY_FAILED',ASSET_MISSING:'INTEGRITY_FAILED',ASSET_INVALID:'INTEGRITY_FAILED',LIMIT_EXCEEDED:'IMPORT_LIMIT',PROTOCOL_INVALID:'INTEGRITY_FAILED'};
    const code=context.code??(codes.includes(inputCode as DiagnosticCode)?inputCode as DiagnosticCode:aliases[inputCode]??'LOCAL_SAVE_FAILED');
    const account=context.accountId===undefined?activeAccount:context.accountId??'guest',row=createDiagnostic(code,operationPattern.test(context.operationId??'')?context.operationId:undefined,/^(0|[1-9]\d*)$/.test(context.revision??'')?context.revision:undefined,diagnosticEnvironment());
    records.set(account,[...(records.get(account)??[]).slice(-19),row]);listeners.forEach(listener=>listener());return row;
  }catch{/* Recording can never change a save, restore or error outcome. */}
}
export const subscribeDiagnostics=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const diagnosticRecords=(account:string|null)=>records.get(account??'guest')??empty;
export function clearDiagnostics(account:string|null){records.delete(account??'guest');listeners.forEach(listener=>listener());}
