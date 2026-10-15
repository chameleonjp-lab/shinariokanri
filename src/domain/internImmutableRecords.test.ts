import {describe,expect,it,vi} from 'vitest';
import {createEntity,createProject,newId,textToRichText,validateProject} from './model';
import {captureImmutablePlainData} from './immutablePlainData';
import {createImmutableRecordInterningSession,internImmutableRecords,internImmutableRecordsAsync} from './internImmutableRecords';
import {deepStrictEqual} from 'node:assert/strict';
import {jsonBytes,sha256} from '../storage/json';

const own=<T>(v:T)=>captureImmutablePlainData(v).value;
describe('scope-owned full-value record sharing',()=>{
 it('preserves identity of a fully shared frozen graph with no record substitutions',()=>{
  const project=createProject('同じ記録とcalendarを参照する複数画像'),entity=createEntity(project.projectId,'note','共通の記録',{body:textToRichText('同じidentity')}),calendar=project.calendars[0]!;
  project.entities.push(entity);
  const input=own({project,images:[{entities:[entity],calendars:[calendar]},{entities:[entity],calendars:[calendar]}]}),shared=internImmutableRecords(input);
  deepStrictEqual(shared,input);expect(shared).toBe(input);expect(shared.project).toBe(input.project);expect(shared.images).toBe(input.images);
  expect(shared.project.entities[0]).toBe(shared.images[0]!.entities[0]);expect(shared.images[0]!.entities[0]).toBe(shared.images[1]!.entities[0]);
  expect(shared.project.calendars[0]).toBe(shared.images[0]!.calendars[0]);expect(shared.images[0]!.calendars[0]).toBe(shared.images[1]!.calendars[0]);
 });
 it('copies only containers on a late replacement path and reuses the final alias copy',async()=>{
  const projectId=newId(),candidate=createEntity(projectId,'note','共有する候補',{body:textToRichText('同じ全値')}),duplicate=structuredClone(candidate);
  const branch={record:duplicate,untouched:{label:'同じidentityを維持'}};
  const input=own({candidate,left:branch,right:branch,untouched:{label:'外側の未変更枝'}}),before=jsonBytes(input),beforeHash=await sha256(before);
  expect(input.left).toBe(input.right);expect(input.left.record).not.toBe(input.candidate);
  const shared=internImmutableRecords(input);
  expect(shared).not.toBe(input);expect(shared.left).toBe(shared.right);expect(shared.left).not.toBe(input.left);
  expect(shared.left.record).toBe(shared.candidate);expect(shared.left.untouched).toBe(input.left.untouched);expect(shared.untouched).toBe(input.untouched);
  expect(input.left.record).not.toBe(input.candidate);expect(jsonBytes(input)).toEqual(before);
  expect(jsonBytes(shared)).toEqual(before);expect(await sha256(jsonBytes(shared))).toBe(beforeHash);
 });
 it('preserves null prototypes, own undefined, signed zero, key and array order, bytes, hash, and validation',async()=>{
  const project=createProject('COW値とvalidation'),candidate=createEntity(project.projectId,'note','共有候補',{body:textToRichText('保持する本文')}),duplicate=structuredClone(candidate);
  project.entities.push(duplicate);
  const custom=Object.create(null) as Record<string,unknown>;
  custom.zeta=undefined;custom.negativeZero=-0;custom.records=[duplicate,'middle',candidate];custom.alpha='最後に追加した値';
  const input=own({candidate,project,custom}),before=jsonBytes(input),beforeHash=await sha256(before),beforeValidation=validateProject(input.project);
  expect(beforeValidation.ok).toBe(true);
  const shared=internImmutableRecords(input),afterValidation=validateProject(shared.project),sharedRecords=shared.custom.records as unknown[];
  expect(Object.getPrototypeOf(shared.custom)).toBe(null);expect(Object.keys(shared.custom)).toEqual(['zeta','negativeZero','records','alpha']);
  expect(Object.hasOwn(shared.custom,'zeta')).toBe(true);expect(shared.custom.zeta).toBeUndefined();expect(Object.is(shared.custom.negativeZero,-0)).toBe(true);
  expect(sharedRecords).not.toBe(input.custom.records);expect(sharedRecords[0]).toBe(shared.candidate);
  expect(sharedRecords[1]).toBe('middle');expect(sharedRecords[2]).toBe(shared.candidate);
  expect(shared.project.entities[0]).toBe(shared.candidate);expect(shared.project.entities[0]).not.toBe(input.project.entities[0]);
  expect(afterValidation).toEqual(beforeValidation);expect(jsonBytes(input)).toEqual(before);expect(jsonBytes(shared)).toEqual(before);
  expect(await sha256(jsonBytes(shared))).toBe(beforeHash);
 });
 it('starts exact candidate comparison in a fresh scope after the 100000-reference boundary',()=>{
  const projectId=newId(),record=(index:number)=>({id:`record-${index}`,projectId,kind:'note',data:{marker:index}});
  const first=record(0),candidates=Array.from({length:99_999},(_,index)=>record(index+1)),afterClear=record(100_000);
  const input=own([first,...candidates,afterClear,structuredClone(afterClear),structuredClone(first),structuredClone(first)]),shared=internImmutableRecords(input);
  deepStrictEqual(shared,input);expect(shared).not.toBe(input);expect(shared[100_000]).toBe(shared[100_001]);
  expect(shared[0]).not.toBe(shared[100_002]);expect(shared[0]).toBe(input[0]);expect(shared[100_002]).toBe(input[100_002]);
  expect(shared[100_002]).toBe(shared[100_003]);expect(shared[100_003]).not.toBe(shared[0]);
 });
 it('keeps every field and byte while sharing separately captured equal checkpoints',async()=>{
  const p=createProject('別々に読まれた同じ記録');p.entities.push(createEntity(p.projectId,'note','原文',{body:textToRichText('😀全値を残す')}));
  const original=own({current:p,older:structuredClone(p),pending:structuredClone(p)}),shared=internImmutableRecords(original);
  expect(shared).toEqual(original);expect(jsonBytes(shared)).toEqual(jsonBytes(original));
  expect(await sha256(jsonBytes(shared))).toBe(await sha256(jsonBytes(original)));
  expect(original.current.entities[0]).not.toBe(original.older.entities[0]);
  expect(shared.current.entities[0]).toBe(shared.older.entities[0]);expect(shared.pending.entities[0]).toBe(shared.current.entities[0]);
  expect(validateProject(shared.current).ok).toBe(true);expect(Object.isFrozen(shared)).toBe(true);
 });
 it('never treats an equal ID or omitted JSON field as proof of equal own data',()=>{
  const p=createProject('全own値を比較する'),entity=createEntity(p.projectId,'note','元稿',{body:textToRichText('😀本文')});p.entities.push(entity);
  const altered=structuredClone(entity),unknown=structuredClone(entity);altered.data.body[0].text='別の本文';Object.assign(unknown,{unexpected:undefined});
  const empty=Object.create(null);Object.assign(empty,entity);
  const a={...entity,data:{...entity.data,extra:-0}},b={...entity,data:{...entity.data,extra:0}};
  const original=own([entity,altered,unknown,empty,a,b]),shared=internImmutableRecords(original);
  expect(shared).toEqual(original);expect(shared[0]).not.toBe(shared[1]);expect(shared[0]).not.toBe(shared[2]);expect(shared[0]).not.toBe(shared[3]);expect(shared[4]).not.toBe(shared[5]);
  expect(Object.hasOwn(shared[2],'unexpected')).toBe(true);expect(Object.is(shared[4].data.extra,-0)).toBe(true);expect(Object.getPrototypeOf(shared[3])).toBe(null);
  expect(validateProject(own({...p,entities:[shared[2]]})).ok).toBe(false);
 });
 it('leaves mutable, accessor and shallow-frozen caller input unchanged and uncached',()=>{
  const p=createProject('著者入力は変更しない');p.entities.push(createEntity(p.projectId,'note','原文',{body:textToRichText('本文')}));
  expect(internImmutableRecords(p)).toBe(p);expect(Object.isFrozen(p.entities[0])).toBe(false);Object.freeze(p);
  expect(internImmutableRecords(p)).toBe(p);p.entities[0].name='後の入力';expect(p.entities[0].name).toBe('後の入力');
  let reads=0;const getter=Object.freeze({id:newId(),projectId:p.projectId,kind:'note',get data(){reads++;return {};}});
  expect(internImmutableRecords(getter)).toBe(getter);expect(reads).toBe(0);
 });
});

it('compares every own value asynchronously without changing legacy bytes or private input',async()=>{
 const p=createProject('mainの全値比較'),first=createEntity(p.projectId,'note','原稿',{body:textToRichText('😀原文')});
 const different={...first,data:{...first.data,unknown:undefined}},a={...first,data:{...first.data,zero:-0}},b={...first,data:{...first.data,zero:0}};
 const input=own({before:[first,a],after:[structuredClone(first),different,b]}),before=jsonBytes(input),result=await internImmutableRecordsAsync(input);
 deepStrictEqual(result,input);expect(Buffer.from(jsonBytes(result)).equals(Buffer.from(before))).toBe(true);expect(result.before[0]).toBe(result.after[0]);expect(result.after[1]).not.toBe(result.before[0]);expect(result.before[1]).not.toBe(result.after[2]);expect(Object.hasOwn(result.after[1].data,'unknown')).toBe(true);expect(Object.is((result.before[1].data as unknown as Record<string,unknown>).zero,-0)).toBe(true);expect(Object.isFrozen(result)).toBe(true);
});
it('yields to a queued cancellation during a large private comparison and keeps all source fields',async()=>{
 const projectId=newId(),records=Array.from({length:20000},(_,i)=>({id:newId(),projectId,kind:'note',data:{body:[{id:newId(),kind:'paragraph',text:'😀原文'+i}]}}));
 const input=own({before:records,after:structuredClone(records)}),before=jsonBytes(input),controller=new AbortController();
 const task=internImmutableRecordsAsync(input,controller.signal),rejected=expect(task).rejects.toMatchObject({code:'CANCELLED'});setTimeout(()=>controller.abort(),0);await rejected;
 expect(input.before).toHaveLength(20000);expect(input.after).toHaveLength(20000);expect(Buffer.from(jsonBytes(input)).equals(Buffer.from(before))).toBe(true);
});


describe('private sequential worker interning',()=>{
 it('reuses only complete frozen graphs, preserving changed own values and source topology across input roots',async()=>{
  const project=createProject('連続するprivate画像'),record=createEntity(project.projectId,'note','原文',{body:textToRichText('😀全値')});
  const initial=own({current:[record],history:[structuredClone(record)]}),session=createImmutableRecordInterningSession();
  const first=session.intern(initial),again=session.intern(initial);
  expect(again).toBe(first);expect(first.current[0]).toBe(first.history[0]);expect(initial.current[0]).not.toBe(initial.history[0]);
  const edited=structuredClone(record);edited.data.body[0].text='別の本文';
  const undefinedOwn={...structuredClone(record),unknown:undefined},nullPrototype=Object.assign(Object.create(null),record);
  const next=own({history:initial.history,current:[edited,undefinedOwn,nullPrototype],negativeZero:-0});
  const before=jsonBytes(next),actual=session.intern(next);
  deepStrictEqual(actual,next);expect(actual.history[0]).toBe(first.current[0]);expect(actual.current[0]).not.toBe(first.current[0]);
  expect(actual.current[1]).not.toBe(first.current[0]);expect(Object.hasOwn(actual.current[1],'unknown')).toBe(true);
  expect(Object.getPrototypeOf(actual.current[2])).toBe(null);expect(Object.is(actual.negativeZero,-0)).toBe(true);
  expect(await sha256(jsonBytes(actual))).toBe(await sha256(before));expect(next.current[0].data.body[0].text).toBe('別の本文');expect(initial.current[0]).not.toBe(initial.history[0]);
  const mutable=structuredClone(record);expect(session.intern(mutable)).toBe(mutable);mutable.name='後の編集';expect(first.current[0].name).toBe('原文');
 });
 it('discards candidate identity on reset and after changed traversal intrinsics',()=>{
  const project=createProject('private範囲'),record=own(createEntity(project.projectId,'note','元記録')),session=createImmutableRecordInterningSession();
  const first=session.intern(own([record])),other=own([structuredClone(record)]);
  expect(session.intern(other)[0]).toBe(first[0]);session.clear();
  const afterReset=own([structuredClone(record)]);expect(session.intern(afterReset)[0]).toBe(afterReset[0]);
  const next=own([structuredClone(record)]),keys=Object.keys,spy=vi.spyOn(Object,'keys').mockImplementation(value=>keys(value));
  try{expect(session.intern(next)[0]).toBe(next[0]);expect(spy).toHaveBeenCalled();}finally{spy.mockRestore();}
  const final=own([structuredClone(record)]);expect(session.intern(final)[0]).toBe(final[0]);
 });
 it('keeps accessor, cycle and shallow-frozen inputs on their uncached path',()=>{
  const session=createImmutableRecordInterningSession();let reads=0;const accessor=Object.freeze({get value(){reads++;return 1;}});
  const cycle:Record<string,unknown>={};cycle.self=cycle;Object.freeze(cycle);
  const shallow=Object.freeze({child:{text:'変更可能'}});
  expect(session.intern(accessor)).toBe(accessor);expect(reads).toBe(0);expect(session.intern(cycle)).toBe(cycle);
  expect(session.intern(shallow)).toBe(shallow);shallow.child.text='後の入力';expect(shallow.child.text).toBe('後の入力');
 });
});
