import type {Schema,DomainReference} from './model';
import type {EntityKind} from './types';

export interface ReferenceMeaning {readonly path:string;readonly scope:DomainReference['scope'];readonly kinds:readonly EntityKind[]}
export interface FieldMeaning {
  readonly kind:EntityKind;readonly key:string;readonly schemaType:Schema['type'];readonly required:boolean;readonly nullable:boolean;
  readonly reference:Readonly<{scope:DomainReference['scope'];kinds:readonly EntityKind[]}>|null;
  readonly enumValues:readonly (string|boolean|null)[]|null;
  readonly constraints:Readonly<Record<string,number|boolean>>;
  readonly references:readonly ReferenceMeaning[];
  readonly dynamicReferences:readonly Readonly<{path:string;syntax:Schema['type']}>[];
}
const valueSyntax=new Set<Schema['type']>(['typed','custom','condition','expression','richtext','time','query','name_policy','json']);

/** Registry meaning only. Labels/layout/public policy remain independent.
 * Value-dependent ASTs still use the existing bounded model reference walker;
 * these patterns never establish validation or public-disclosure permission.
 */
export function describeFieldSemantics(kind:EntityKind,key:string,field:{schema:Schema;required?:boolean;nullable?:boolean}):FieldMeaning|undefined{
  const references:ReferenceMeaning[]=[],dynamicReferences:{path:string;syntax:Schema['type']}[]=[],active=new Set<Schema>();
  const visit=(schema:Schema,path:string,depth=0):boolean=>{
    if(depth>32||!schema||typeof schema!=='object'||active.has(schema))return false;
    active.add(schema);let valid=true;
    switch(schema.type){
      case 'ref':references.push(Object.freeze({path,scope:schema.scope??'entity',kinds:Object.freeze([...(schema.kinds??[])])}));break;
      case 'array':valid=visit(schema.item,path+'[]',depth+1);break;
      case 'object':for(const [name,definition] of Object.entries(schema.fields))if(!visit(definition.schema,path+'.'+name,depth+1)){valid=false;break;}break;
      case 'record':valid=(!schema.key||visit(schema.key,path+'{key}',depth+1))&&visit(schema.value,path+'{}',depth+1);break;
      case 'union':valid=schema.choices.every(choice=>visit(choice,path,depth+1));break;
      default:if(valueSyntax.has(schema.type))dynamicReferences.push(Object.freeze({path,syntax:schema.type}));
    }
    active.delete(schema);return valid;
  };
  try{
    const schema=field.schema;if(!visit(schema,'data.'+key))return undefined;
    const direct=schema.type==='ref'?schema:schema.type==='array'&&schema.item.type==='ref'?schema.item:undefined;
    const constraints:Record<string,number|boolean>={};
    for(const name of ['min','max','maxBytes','integer','unique'] as const){const value=(schema as unknown as Record<string,unknown>)[name];if(typeof value==='number'||typeof value==='boolean')constraints[name]=value;}
    const unique=<T>(values:T[]):readonly T[]=>Object.freeze([...new Map(values.map(value=>[JSON.stringify(value),value])).values()]);
    return Object.freeze({kind,key,schemaType:schema.type,required:field.required===true,nullable:field.nullable===true,
      reference:direct?Object.freeze({scope:direct.scope??'entity',kinds:Object.freeze([...(direct.kinds??[])])}):null,
      enumValues:schema.type==='enum'?Object.freeze([...schema.values]):null,constraints:Object.freeze(constraints),references:unique(references),dynamicReferences:unique(dynamicReferences)});
  }catch{return undefined;}
}
