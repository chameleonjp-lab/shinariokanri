import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {toJsonSchema} from '../src/domain/model';

it('keeps every locked JSON Schema constraint and adds only optional properties to existing records',()=>{
 const original=JSON.parse(readFileSync(new URL('../src/domain/schema.json',import.meta.url),'utf8')),current=toJsonSchema();
 const additions:string[]=[];
 function compare(before:unknown,after:unknown,path:string){
  if(before===null||typeof before!=='object'||Array.isArray(before)){expect(after,path).toEqual(before);return;}
  expect(after,path).toBeTypeOf('object');const old=before as Record<string,unknown>,next=after as Record<string,unknown>;
  for(const [key,value]of Object.entries(old)){
   if(key==='properties'||key==='$defs'){
    const previous=value as Record<string,unknown>,actual=next[key] as Record<string,unknown>;
    for(const [name,schema]of Object.entries(previous))compare(schema,actual[name],`${path}/${key}/${name}`);
    for(const name of Object.keys(actual).filter(name=>!Object.hasOwn(previous,name))){
     if(key==='properties'){expect((next.required as string[]|undefined)??[]).not.toContain(name);additions.push(`${path}/${key}/${name}`);}
    }
   }else compare(value,next[key],`${path}/${key}`);
  }
  expect(Object.keys(next).filter(key=>!Object.hasOwn(old,key)),path).toEqual([]);
 }
 compare(original,current,'');
 expect(additions.sort()).toEqual(['dialogue_line.scriptKind','dialogue_line.scriptNumber','dialogue_line.sourceAnchor','review.receivedContext','review.currentMatch','trace.correctionAnchor','trace.expectation'].map(value=>{const [kind,field]=value.split('.');return `/$defs/Entity_${kind}/properties/data/properties/${field}`;}).sort());
 expect(JSON.parse(readFileSync(new URL('../src/domain/schema-current.json',import.meta.url),'utf8'))).toEqual(current);
});
