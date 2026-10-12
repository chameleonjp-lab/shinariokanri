import {describe,expect,it} from 'vitest';
import {createEntity,createProject,newId,textToRichText,validateProject} from './model';
import {captureImmutablePlainData} from './immutablePlainData';
import {internImmutableRecords} from './internImmutableRecords';
import {jsonBytes,sha256} from '../storage/json';

const own=<T>(v:T)=>captureImmutablePlainData(v).value;
describe('scope-owned full-value record sharing',()=>{
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
