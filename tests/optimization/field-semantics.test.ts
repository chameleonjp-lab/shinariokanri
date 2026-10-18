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
  expect(serial(model.ENTITY_SCHEMAS)).toEqual(contract.model);
  expect(serial(FIELD_SPECS)).toEqual(contract.ui);
  expect(serial(PROJECTION_FIELDS)).toEqual(contract.public);
  const schema=readFileSync(new URL('../../src/domain/schema.json',import.meta.url));
  expect(createHash('sha256').update(schema).digest('hex')).toBe(contract.files.find((row:{path:string})=>row.path==='src/domain/schema.json').sha256);
  expect(model.toJsonSchema()).toEqual(JSON.parse(schema.toString()));
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
