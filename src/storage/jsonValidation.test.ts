import {expect,it} from 'vitest';
import {validateJsonValue,canonicalJson,exceedsJsonBytes} from './json';
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

it('validates a shared graph without expanding its billion JSON paths and rechecks later mutations',()=>{
 const leaf:{text:string;child?:unknown}={text:'漢字😀'};
 let graph:unknown=leaf;
 for(let level=0;level<30;level++)graph={first:graph,second:graph};
 expect(()=>validateJsonValue(graph)).not.toThrow();
 leaf.text='\ud800';
 expect(()=>validateJsonValue(graph)).toThrow(StorageError);
 leaf.text='漢字😀';leaf.child=graph;
 expect(()=>validateJsonValue(graph)).toThrow('循環');
 delete leaf.child;
 expect(()=>validateJsonValue(graph)).not.toThrow();
});

it('chooses dictionary encoding by exact Unicode JSON bytes at the boundary, including shared values and omissions',()=>{
 const shared={text:'😀漢字\n"',present:null,absent:undefined};
 const value={first:shared,second:shared,array:[shared,false,0,-1.5]};
 const bytes=new TextEncoder().encode(canonicalJson(value)).byteLength;
 expect(exceedsJsonBytes(value,bytes-1)).toBe(true);
 expect(exceedsJsonBytes(value,bytes)).toBe(false);
 expect(exceedsJsonBytes(value,bytes+1)).toBe(false);
});
