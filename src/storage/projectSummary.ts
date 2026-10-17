import Dexie from 'dexie';
import type {ProjectData} from '../domain/types';
import {canonicalJson,sha256,jsonBytes} from './json';
import {probeCount,probePayload} from '../observability/probe';

export interface ProjectSummary {
  projectId:string; name:string; revision:string; entityCount:number|null;
  contentState:'unloaded'|'error'; error?:string;
  saveState:{localSaved:true;pendingCount:number|null;recoveredPendingCount:number|null;pendingAssetCount:'unloaded';serverRevision:string|null;syncState:'pending'|'synced'|'conflict'|'unloaded'};
}
export interface StoredProjectSummary {
  projectId:string; name:string; revision:string; entityCount:number;
  version:1; sourceHash:string; digest:string;
}
/** Read the native header on the caller's transaction, without decoding parts.
 * This read is intentionally observable: small inline headers still cost bytes.
 * The fingerprint detects changed headers, not corruption in unloaded bodies. */
export function nativeProjectHeader(projectId:string):Promise<Record<string,unknown>|undefined> {
  return new Dexie.Promise((resolve,reject)=>{
    const request=Dexie.currentTransaction!.idbtrans.objectStore('projects').get(projectId);
    request.onsuccess=()=>{const value=request.result;probeCount('db.read.calls',1,'projects');probeCount('db.read.requested',1,'projects');probeCount('db.read.rows',value?1:0,'projects');probePayload('db.read.payloadBytes',value?[value]:[],'projects');resolve(value);};
    request.onerror=()=>reject(request.error);
  });
}
export const summarySourceHash=(header:Record<string,unknown>)=>sha256(jsonBytes(header));
export async function deriveProjectSummary(project:ProjectData,sourceHash:string):Promise<StoredProjectSummary> {
  const row={version:1 as const,projectId:project.projectId,name:project.name,revision:project.revision,entityCount:project.entities.filter(entity=>!entity.deletedAt).length,sourceHash};
  return {...row,digest:await sha256(jsonBytes(row))};
}
export async function validProjectSummary(row:StoredProjectSummary|undefined,projectId:string,sourceHash:string):Promise<boolean> {
  if(!row||row.version!==1||row.projectId!==projectId||row.sourceHash!==sourceHash||typeof row.name!=='string'||typeof row.revision!=='string'||!/^(0|[1-9]\d*)$/.test(row.revision)||!Number.isSafeInteger(row.entityCount)||row.entityCount<0)return false;
  const {digest,...value}=row;
  return typeof digest==='string'&&digest===await sha256(new TextEncoder().encode(canonicalJson(value)));
}
