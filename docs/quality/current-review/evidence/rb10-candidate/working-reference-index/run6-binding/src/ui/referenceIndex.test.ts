import {describe,expect,it} from 'vitest';
import {createEntity,createProject,newId,validateProject} from '../domain/model';
import {cachedReferencesTo,prepareReferenceIndex,referencesTo} from './referenceIndex';

function fixture(){
 const p=createProject('参照索引の境界'),a=createEntity(p.projectId,'character','A'),b=createEntity(p.projectId,'character','B');
 const shared=createEntity(p.projectId,'scene','両方を参照',{povId:a.id}),body=createEntity(p.projectId,'note','本文リンク');
 shared.data.body=[{id:newId(),kind:'paragraph',text:'AB',ruby:[],links:[{start:0,end:1,target:{entityId:a.id}},{start:1,end:2,target:{entityId:b.id}}]}];
 body.data.body=[{id:newId(),kind:'paragraph',text:'A😀B',ruby:[],links:[{start:0,end:1,target:{entityId:a.id}},{start:2,end:3,target:{entityId:b.id}}]}];
 const archived=createEntity(p.projectId,'scene','除外した参照',{povId:a.id});archived.deletedAt='2026-10-09T00:00:00Z';archived.deletionOperationId=newId();
 const self=createEntity(p.projectId,'note','自身を参照');self.data.originNoteId=self.id;
 p.entities.push(a,b,shared,body,archived,self);expect(validateProject(p)).toMatchObject({ok:true});return {p,a,b,shared,body,self};
}
describe('derived reference index publication',()=>{
 it('keeps typed/Unicode references in project order, excludes archived/self, and never mutates records',async()=>{
  const {p,a,b,shared,body,self}=fixture(),before=structuredClone(p.entities),source=[...p.entities],progress:number[]=[];
  expect(cachedReferencesTo(source,a.id)).toBeUndefined();
  await prepareReferenceIndex(source,{onProgress:n=>progress.push(n),yieldControl:async()=>{expect(cachedReferencesTo(source,a.id)).toBeUndefined();}});
  expect(cachedReferencesTo(source,a.id)?.map(e=>e.id)).toEqual([shared.id,body.id]);
  expect(cachedReferencesTo(source,b.id)?.map(e=>e.id)).toEqual([shared.id,body.id]);
  expect(cachedReferencesTo(source,self.id)).toEqual([]);expect(cachedReferencesTo(source,newId())).toEqual([]);
  expect(source).toEqual(before);expect(progress[0]).toBe(0);expect(progress.at(-1)).toBe(source.length);
  expect(referencesTo([...p.entities],a.id)).toEqual(cachedReferencesTo(source,a.id));
 });
 it('cancels a partly calculated index without publishing an empty or partial answer, and retries all rows',async()=>{
  const {p,a}=fixture();const rows=Array.from({length:1201},(_,i)=>createEntity(p.projectId,'scene',`参照${i}`,{povId:a.id}));
  const source=[a,...rows],before=structuredClone(source),abort=new AbortController();let yields=0,completed=0;
  await expect(prepareReferenceIndex(source,{signal:abort.signal,onProgress:n=>completed=n,yieldControl:async()=>{yields++;if(yields===2){expect(completed).toBeGreaterThan(0);expect(completed).toBeLessThan(source.length);expect(cachedReferencesTo(source,a.id)).toBeUndefined();abort.abort();}}})).rejects.toMatchObject({name:'AbortError'});
  expect(cachedReferencesTo(source,a.id)).toBeUndefined();expect(source).toEqual(before);
  await prepareReferenceIndex(source,{yieldControl:async()=>{}});expect(cachedReferencesTo(source,a.id)?.map(e=>e.id)).toEqual(rows.map(e=>e.id));
 });
 it('binds a late result to its original source and keeps a revised source unchecked until calculated',async()=>{
  const {p,a,b,shared,body}=fixture(),old=[...p.entities],changed=structuredClone(shared);changed.data.povId=b.id;changed.data.body=[{id:shared.data.body[0]!.id,kind:'paragraph',text:'B',ruby:[],links:[{start:0,end:1,target:{entityId:b.id}}]}];
  const revised=old.map(e=>e.id===shared.id?changed:e);let release!:()=>void;const pending=prepareReferenceIndex(old,{yieldControl:()=>new Promise<void>(resolve=>{release=resolve;})});
  expect(cachedReferencesTo(revised,a.id)).toBeUndefined();release();await pending;
  expect(cachedReferencesTo(old,a.id)?.map(e=>e.id)).toEqual([shared.id,body.id]);expect(cachedReferencesTo(revised,a.id)).toBeUndefined();
  await prepareReferenceIndex(revised,{yieldControl:async()=>{}});expect(cachedReferencesTo(revised,a.id)?.map(e=>e.id)).toEqual([body.id]);expect(cachedReferencesTo(revised,b.id)?.map(e=>e.id)).toEqual([shared.id,body.id]);
  const abort=new AbortController();abort.abort();await expect(prepareReferenceIndex(revised,{signal:abort.signal})).rejects.toMatchObject({name:'AbortError'});
 });
});
