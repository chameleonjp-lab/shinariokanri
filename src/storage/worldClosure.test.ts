import {expect,it,vi} from 'vitest';
import {createEntity,createProject} from '../domain/model';
import {readWorldClosure} from './worldClosure';
import type {ProjectData} from '../domain/types';

const id=(value:number)=>`a2050000-0000-4000-8000-${value.toString(16).padStart(12,'0')}`;
const reference=(value:number)=>({projectId:id(value+100),immutableSnapshotId:id(value),contentHash:'a'.repeat(64)});
it('reads the literal transitive outer keys and preserves every field of each immutable row',async()=>{
 const root=createProject('work');root.worldReferences=[reference(1)];
 const rows=Object.fromEntries([1,2,3].map(value=>{const project=createProject(`world ${value}`);project.projectId=id(value+100);project.worldReferences=value===3?[]:[reference(value+1)];return[id(value),{id:id(value),project}];}));
 const read=vi.fn(async(key:string)=>rows[key]),full=vi.fn(async()=>({}));
 const result=await readWorldClosure([root],read,full);
 expect(read.mock.calls.map(([key])=>key)).toEqual([id(1),id(2),id(3)]);expect(full).not.toHaveBeenCalled();
 expect(Object.keys(result)).toEqual([id(1),id(2),id(3)]);for(const key of Object.keys(result))expect(result[key]).toBe(rows[key].project);
});
it('uses the exact full-registry fallback for missing outer ownership instead of declaring absence',async()=>{
 const root=createProject('unknown owner');root.worldReferences=[reference(1)];const owner=createProject('retained owner');
 const all:{[key:string]:ProjectData}={[id(2)]:owner},full=vi.fn(async()=>all);
 expect(await readWorldClosure([root],async()=>undefined,full)).toBe(all);expect(full).toHaveBeenCalledOnce();
});
it('keeps unsupported dependency shapes on the full path',async()=>{
 const root=createProject('unknown shape'),note=createEntity(root.projectId,'note','unsupported native record');
 root.entities=[{...note,kind:'future-kind'} as never];const all={[id(2)]:createProject('full fallback')},read=vi.fn(async()=>undefined),full=vi.fn(async()=>all);
 expect(await readWorldClosure([root],read,full)).toBe(all);expect(read).not.toHaveBeenCalled();expect(full).toHaveBeenCalledOnce();
});
it('cancels after a held read without publishing a partial closure or starting fallback',async()=>{
 const root=createProject('cancelled');root.worldReferences=[reference(1)];const controller=new AbortController(),full=vi.fn(async()=>({}));
 await expect(readWorldClosure([root],async()=>{controller.abort();return undefined;},full,controller.signal)).rejects.toMatchObject({code:'CANCELLED'});expect(full).not.toHaveBeenCalled();
});
