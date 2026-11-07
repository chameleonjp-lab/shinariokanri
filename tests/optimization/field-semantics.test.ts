import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as model from '../../src/domain/model';
import {FIELD_SPECS} from '../../src/ui/fieldSpecs';
import {PROJECTION_FIELDS} from '../../src/domain/projection';

const contract=JSON.parse(readFileSync(new URL('./field-semantic-contract.json',import.meta.url),'utf8'));
const serial=(value:unknown)=>JSON.parse(JSON.stringify(value));
const meaning=(kind:string,field:string)=>{
  const describe=Reflect.get(model,'entityFieldMeaning');
  expect(typeof describe,'missing common model field semantics').toBe('function');
  return Reflect.apply(describe,undefined,[kind,field]);
};

it('preserves the independent original-main model, UI wording/order and public allowlist contracts',()=>{
  expect(contract.sourceCommit).toBe('a13d8fad93b1a4a14c4cc4d45ab98783388de177');
  expect(model.ENTITY_KINDS).toEqual(contract.kinds);
  // The approved additions are optional; every original field/schema and its UI/public meaning stays exact.
  const additions:Record<string,string[]>={dialogue_line:['scriptKind','scriptNumber','sourceAnchor'],trace:['correctionAnchor','expectation'],review:['receivedContext','currentMatch']};
  const current=serial(model.ENTITY_SCHEMAS);
  for(const kind of contract.kinds){
    const old=contract.model[kind],actual=current[kind],extra=Object.keys(actual.fields).filter(key=>!Object.hasOwn(old.fields,key));
    expect(extra.sort()).toEqual((additions[kind]??[]).slice().sort());
    expect({...actual,fields:Object.fromEntries(Object.keys(old.fields).map(key=>[key,actual.fields[key]]))}).toEqual(old);
    for(const key of extra)expect(actual.fields[key].required).not.toBe(true);
    const oldKeys=new Set(contract.ui[kind].map((field:{key:string})=>field.key));
    expect(serial(FIELD_SPECS[kind]).filter((field:{key:string})=>oldKeys.has(field.key))).toEqual(contract.ui[kind]);
    expect(FIELD_SPECS[kind].filter(field=>!oldKeys.has(field.key)).map(field=>field.key).sort()).toEqual(kind==='dialogue_line'?additions.dialogue_line.slice().sort():[]);
  }
  const publicFields=serial(PROJECTION_FIELDS);
  for(const [kind,fields]of Object.entries(contract.public) as [string,Record<string,unknown>][]){
    expect(Object.fromEntries(Object.keys(fields).map(key=>[key,publicFields[kind][key]]))).toEqual(fields);
    expect(Object.keys(publicFields[kind]).filter(key=>!Object.hasOwn(fields,key)).sort()).toEqual(kind==='dialogue_line'?additions.dialogue_line.slice().sort():[]);
  }
  expect(Object.keys(publicFields).sort()).toEqual(Object.keys(contract.public).sort());
  const schema=readFileSync(new URL('../../src/domain/schema.json',import.meta.url));
  expect(createHash('sha256').update(schema).digest('hex')).toBe(contract.files.find((row:{path:string})=>row.path==='src/domain/schema.json').sha256);
  const currentSchema=readFileSync(new URL('../../src/domain/schema-current.json',import.meta.url));
  expect(model.toJsonSchema()).toEqual(JSON.parse(currentSchema.toString()));
});

it('covers all 345 fields of 43 kinds against frozen expectations independent of the new descriptor',()=>{
  expect(contract.fields).toHaveLength(345);expect(new Set(contract.fields.map((row:{kind:string})=>row.kind)).size).toBe(43);
  for(const row of contract.fields){
    const original=contract.model[row.kind].fields[row.field];
    const constraints=Object.fromEntries(['min','max','maxBytes','integer','unique'].filter(key=>typeof original.schema[key]==='number'||typeof original.schema[key]==='boolean').map(key=>[key,original.schema[key]]));
    expect(meaning(row.kind,row.field)).toMatchObject({kind:row.kind,key:row.field,schemaType:row.model,required:original.required===true,nullable:original.nullable===true,reference:row.reference,enumValues:row.values,constraints});
  }
  expect(meaning('character','unknownField')).toBeUndefined();
  expect(meaning('__proto__','constructor')).toBeUndefined();
});

it('keeps kind-specific text, nested/conditional reference syntax and public restrictions distinct',()=>{
  expect(meaning('character','goals')).toMatchObject({schemaType:'array',reference:{scope:'entity',kinds:['goal']},references:[{path:'data.goals[]',scope:'entity',kinds:['goal']}]});
  expect(meaning('scene','goals')).toMatchObject({schemaType:'richtext',reference:null,dynamicReferences:[{path:'data.goals',syntax:'richtext'}]});
  expect(meaning('flow_edge','toId').references).toContainEqual({path:'data.toId',scope:'entity',kinds:['flow_node']});
  expect(meaning('flow_node','gate').dynamicReferences).toContainEqual({path:'data.gate',syntax:'condition'});
  expect(meaning('checkpoint','runtimeState').references).toContainEqual({path:'data.runtimeState.variableValues{key}',scope:'entity',kinds:['variable']});
  expect(meaning('checkpoint','runtimeState').references).toContainEqual({path:'data.runtimeState.itemInstances[].typeId',scope:'entity',kinds:['item']});
  expect(meaning('collection','mode').enumValues).toEqual(['dynamic','fixed']);
  expect(PROJECTION_FIELDS.collection?.mode).toMatchObject({values:['fixed']});
  expect(PROJECTION_FIELDS.scene).not.toHaveProperty('goals');
  // These are independent UI policies, not mistakes to erase by auto-generation.
  expect(FIELD_SPECS.group!.find(field=>field.key==='members')?.kinds).toEqual(['character']);
  expect(meaning('group','members').reference.kinds).toEqual([]);
});
