import Dexie from 'dexie';
import type {ProjectData} from '../domain/types';
import {canonicalJson,sha256,jsonBytes} from './json';
import {probeCount,probePayload} from '../observability/probe';

export interface AlternativeHeadSummary {id:string;name:string;headVersionId:string;contentHash:string}
export interface ProjectSummary {
  projectId:string; name:string; revision:string; entityCount:number|null;
  contentState:'unloaded'|'error'; error?:string; alternativeHeads?:AlternativeHeadSummary[];
  saveState:{localSaved:true;pendingCount:number|null;recoveredPendingCount:number|null;pendingAssetCount:'unloaded';serverRevision:string|null;syncState:'pending'|'synced'|'conflict'|'unloaded'};
}
export interface StoredProjectSummary {
  projectId:string; name:string; revision:string; entityCount:number;
  version:2; sourceHash:string; digest:string; alternativeHeads:AlternativeHeadSummary[];
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
  const alternativeHeads=(project.authorAlternatives??[]).map(branch=>({id:branch.id,name:branch.name,headVersionId:branch.headVersionId,contentHash:branch.versions.find(version=>version.id===branch.headVersionId)?.contentHash??''}));
  const row={version:2 as const,alternativeHeads,projectId:project.projectId,name:project.name,revision:project.revision,entityCount:project.entities.filter(entity=>!entity.deletedAt).length,sourceHash};
  return {...row,digest:await sha256(jsonBytes(row))};
}
export async function validProjectSummary(row:StoredProjectSummary|undefined,projectId:string,sourceHash:string):Promise<boolean> {
  if(!row||row.version!==2||!Array.isArray(row.alternativeHeads)||row.alternativeHeads.length>100||row.alternativeHeads.some(head=>!head||typeof head.id!=='string'||typeof head.name!=='string'||typeof head.headVersionId!=='string'||typeof head.contentHash!=='string')||row.projectId!==projectId||row.sourceHash!==sourceHash||typeof row.name!=='string'||typeof row.revision!=='string'||!/^(0|[1-9]\d*)$/.test(row.revision)||!Number.isSafeInteger(row.entityCount)||row.entityCount<0)return false;
  const {digest,...value}=row;
  return typeof digest==='string'&&digest===await sha256(new TextEncoder().encode(canonicalJson(value)));
}

export interface WorldSourceSummary {projectId:string;name:string;revision:string;registryOnly:true;contentState:'unloaded'|'error';sourceIdentity:'identified'|'unknown';error?:string}
export interface StoredWorldSource {id:string;projectId:string;name:string;revision:string;version:1;digest:string}
export async function deriveWorldSource(id:string,project:ProjectData):Promise<StoredWorldSource>{
 const row={id,projectId:project.projectId,name:project.name,revision:project.revision,version:1 as const};
 return {...row,digest:await sha256(jsonBytes(row))};
}
export async function validWorldSource(row:StoredWorldSource|undefined,id:string):Promise<boolean>{
 if(!row||row.id!==id||row.version!==1||typeof row.projectId!=='string'||typeof row.name!=='string'||typeof row.revision!=='string'||!/^(0|[1-9]\d*)$/.test(row.revision))return false;
 const {digest,...value}=row;return typeof digest==='string'&&digest===await sha256(jsonBytes(value));
}
