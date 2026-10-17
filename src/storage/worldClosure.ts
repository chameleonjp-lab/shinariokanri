import {collectReferences,collectRelationReferences,KIND_LABELS} from '../domain/model';
import type {Entity,ProjectData,Relation} from '../domain/types';
import {checkCancelled} from './errors';
import {probeCount} from '../observability/probe';

/** Discovery only. Native rows remain whole and callers run the original
 * structural/hash/owner validators. Unknown ownership keeps the full path. */
export async function readWorldClosure(
 roots: readonly ProjectData[],
 read: (id:string)=>Promise<{id:string;project:ProjectData}|undefined>,
 full: ()=>Promise<Record<string,ProjectData>>,
 signal?:AbortSignal,
):Promise<Record<string,ProjectData>> {
 const worlds:Record<string,ProjectData>={},explicit:string[]=[],typed:string[]=[],provided=new Set<string>(),seen=new WeakSet<object>();
 let unknown=false;
 const scan=(root:ProjectData)=>{
  if(!root||!Array.isArray(root.snapshots)){unknown=true;return;}
  provided.add(root.projectId);for(const snapshot of root.snapshots)if(snapshot&&typeof snapshot.id==='string')provided.add(snapshot.id);else unknown=true;
  const pending:unknown[]=[root];
  while(pending.length){
   const value=pending.pop();if(value===null||typeof value!=='object'||seen.has(value))continue;seen.add(value);
   if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null){unknown=true;continue;}
   const record=value as Record<string,unknown>;
   if(Object.hasOwn(record,'worldReferences')){
    if(!Array.isArray(record.worldReferences))unknown=true;
    else for(const reference of record.worldReferences)if(reference&&typeof reference==='object'&&typeof reference.immutableSnapshotId==='string')explicit.push(reference.immutableSnapshotId);else unknown=true;
   }
   try{
    let references:ReturnType<typeof collectReferences>=[];
    if(typeof record.kind==='string'&&typeof record.projectId==='string'&&record.data&&typeof record.data==='object'){
     if(Object.hasOwn(KIND_LABELS,record.kind))references=collectReferences(record as unknown as Entity);else unknown=true;
    }else if(typeof record.relationType==='string'&&typeof record.projectId==='string'&&typeof record.fromId==='string')references=collectRelationReferences(record as unknown as Relation);
    for(const reference of references)if(reference.scope==='snapshot')typed.push(reference.id);
   }catch{unknown=true;}
   for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(record)))if(Object.hasOwn(descriptor,'value'))pending.push(descriptor.value);else unknown=true;
  }
 };
 const fallback=async()=>{probeCount('world.closure.fullFallback');checkCancelled(signal);const result=await full();checkCancelled(signal);return result;};
 for(const root of roots)scan(root);
 const visited=new Set<string>();
 while(explicit.length||typed.length){
  checkCancelled(signal);if(unknown)return fallback();
  // Explicit editions establish retained snapshot owners before typed anchors
  // are resolved. A retained old ID is not necessarily a native outer key.
  const isTyped=explicit.length===0,id=(isTyped?typed:explicit).pop()!;
  if(isTyped&&provided.has(id)||worlds[id]||visited.has(id))continue;visited.add(id);
  const row=await read(id);checkCancelled(signal);if(!row)return fallback();
  worlds[row.id]=row.project;scan(row.project);
 }
 if(unknown)return fallback();
 return worlds;
}
