import {expect,it} from 'vitest';
import {validateJsonValue,canonicalJson} from './json';
import {StorageError} from './errors';

it('keeps ordered Unicode JSON, omitted fields and shared values unchanged before a cold read',()=>{
 const shared={text:'漢字😀\n',values:[null,true,false,0,-1,1.5]};
 const value={later:shared,absent:undefined,first:shared};
 const before=canonicalJson(value);
 validateJsonValue(value);
 expect(canonicalJson(value)).toBe(before);
 expect(Object.hasOwn(value,'absent')).toBe(true);
 expect(value.first).toBe(value.later);
 expect(value.first.values).toEqual([null,true,false,0,-1,1.5]);
});

it('refuses malformed durable values before any cold image becomes editable',()=>{
 const circular:Record<string,unknown>={};circular.self=circular;
 const values=[undefined,[undefined],{value:NaN},{value:Infinity},{value:-Infinity},{value:1n},{value:()=>0},{value:Symbol('private')},{text:'\ud800'},{text:'\udc00'},circular];
 for(const value of values){
  let failure:unknown;try{validateJsonValue(value);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(StorageError);
  expect((failure as StorageError).code).toBe('VALIDATION_FAILED');
  expect(()=>canonicalJson(value)).toThrow(StorageError);
 }
});
