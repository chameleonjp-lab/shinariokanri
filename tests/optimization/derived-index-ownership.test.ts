import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createEntity,createProject,newId,emptyValidity,ENTITY_SCHEMAS} from '../../src/domain/model';
import {filterCatalogEntities,buildJapaneseAuthorIndex} from '../../src/domain/catalog';
import {stateUsageIndex} from '../../src/domain/stateUsage';
import {suggestLinkCandidates} from '../../src/domain/linkCandidates';
import {prepareReferenceIndex,cachedReferencesTo,referencesTo} from '../../src/ui/referenceIndex';
import type {ProjectData,Query} from '../../src/domain/types';
import {startProbe} from '../../src/observability/probe';
import {beginDerivedEvaluation} from '../../src/domain/derivedIndexes';

const stores:ScenarioStore[]=[];
function store(accountId='author-a',derivedIndexes?:false|{entries?:number;references?:number;textCodeUnits?:number}){
  const value=new ScenarioStore({databaseName:`p206-${newId()}`,accountId,derivedIndexes});stores.push(value);return value;
}
function fixture(){
  const p=createProject('owned derived data'),person=createEntity(p.projectId,'character','葵');
  const event=createEntity(p.projectId,'event','門の出来事',{participants:[{characterId:person.id,role:'actor'}]});
  const scene=createEntity(p.projectId,'scene','霧の門',{eventIds:[event.id]});
  p.entities.push(person,event,scene);
  return p;
}
async function saved(s:ScenarioStore,p=fixture()){
  return (await s.saveProject(p,{reason:'seed',includeHistory:false,immutableView:true})).project;
}
const dependency:Query={op:'production',value:'done'};
afterEach(async()=>{for(const s of stores.splice(0))await s.deleteDatabase();});

it('shares dependency and text preparation across compilations and saved views of one actual store source',async()=>{
  const s=store(),p=await saved(s),again=(await s.getProjectForEditing(p.projectId,{immutableView:true}))!;
  expect(again).not.toBe(p);expect(again.entities).toBe(p.entities);
  const probe=startProbe();
  try{
    filterCatalogEntities(p,dependency);filterCatalogEntities(again,dependency);
    expect(filterCatalogEntities(p,{op:'text',value:'霧'}).map(e=>e.name)).toEqual(['霧の門']);
    expect(filterCatalogEntities(again,{op:'text',value:'門'}).map(e=>e.name)).toEqual(['門の出来事','霧の門']);
    expect(probe.snapshot().counters['query.index.builds']).toBe(1);
    expect(probe.snapshot().counters['query.text.rows']).toBe(p.entities.length);
  }finally{probe.stop();}
});

for(const invalidation of ['role','release','close'] as const)it(`drops reuse after actual store ${invalidation}, including old view calls`,async()=>{
  const s=store(),p=await saved(s),probe=startProbe();
  try{
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(1);
    if(invalidation==='role')s.setAuthorAccess({});
    else if(invalidation==='release')s.releaseEditor(p.projectId);
    else s.close();
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(3);
  }finally{probe.stop();}
});

it('keeps mutable views fresh and never substitutes a trusted same-ID entity for a foreign row',async()=>{
  const s=store(),p=await saved(s),row=p.entities[0]!,foreign=structuredClone(row);
  foreign.name='別の可変本文';
  filterCatalogEntities(p,{op:'text',value:'葵'});
  expect(filterCatalogEntities(p,{op:'text',value:'別の可変本文'},[foreign])).toEqual([foreign]);
  foreign.name='さらに更新';
  expect(filterCatalogEntities(p,{op:'text',value:'別の可変本文'},[foreign])).toEqual([]);
  expect(filterCatalogEntities(p,{op:'text',value:'さらに更新'},[foreign])).toEqual([foreign]);
  const mutable=(await s.getProjectForEditing(p.projectId))!;
  mutable.entities[0]!.name='可変の作者入力';
  expect(filterCatalogEntities(mutable,{op:'text',value:'可変の作者入力'}).map(e=>e.id)).toEqual([row.id]);
  mutable.entities[0]!.name='次の入力';
  expect(filterCatalogEntities(mutable,{op:'text',value:'可変の作者入力'})).toEqual([]);
});

it('separates equal project/entity IDs and revisions in different account stores',async()=>{
  const source=fixture(),other=structuredClone(source);other.entities[0]!.name='別accountの秘密';
  const a=await saved(store('a'),source),b=await saved(store('b'),other);
  expect(a.projectId).toBe(b.projectId);expect(a.revision).toBe(b.revision);
  expect(filterCatalogEntities(a,{op:'text',value:'葵'}).map(e=>e.id)).toEqual([a.entities[0]!.id]);
  expect(filterCatalogEntities(b,{op:'text',value:'葵'})).toEqual([]);
  expect(filterCatalogEntities(a,{op:'text',value:'別accountの秘密'})).toEqual([]);
  expect(filterCatalogEntities(b,{op:'text',value:'別accountの秘密'}).map(e=>e.id)).toEqual([b.entities[0]!.id]);
});

it('bounds shared logical retention without evicting and rebuilding the admitted prefix',async()=>{
  const s=store('bounded',{entries:1,references:100,textCodeUnits:8}),p=await saved(s),probe=startProbe();
  try{
    filterCatalogEntities(p,{op:'text',value:'霧'});
    filterCatalogEntities(p,{op:'text',value:'門'});
    expect(probe.snapshot().counters['query.text.rows']).toBe(5);
    expect(s.derivedIndexRetention()).toMatchObject({entries:1,textCodeUnits:1});
    expect(s.derivedIndexRetention().references).toBeLessThanOrEqual(100);
    s.releaseEditor(p.projectId);
    expect(s.derivedIndexRetention()).toEqual({owners:0,entries:0,references:0,textCodeUnits:0});
  }finally{probe.stop();}
});

it('supports the literal disabled comparison path with no retained derived owner',async()=>{
  const s=store('disabled',false),p=await saved(s),probe=startProbe();
  try{
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(2);
    expect(s.derivedIndexRetention()).toEqual({owners:0,entries:0,references:0,textCodeUnits:0});
  }finally{probe.stop();}
});

it('invalidates normalized terms when actual nested schema reference meaning changes',async()=>{
  const s=store(),input=fixture(),person=input.entities[0]!;
  if(person.kind!=='character')throw Error('fixture kind');person.data.reading=person.id;
  const p=await saved(s,input),schema=ENTITY_SCHEMAS.character;
  if(schema.type!=='object')throw Error('fixture schema');
  const field=schema.fields.reading!,original=field.schema;
  try{
    expect(filterCatalogEntities(p,{op:'text',value:person.id}).map(e=>e.id)).toEqual([person.id]);
    field.schema={type:'ref',scope:'entity',kinds:['character']};
    expect(filterCatalogEntities(p,{op:'text',value:person.id})).toEqual([]);
  }finally{field.schema=original;}
});

it('uses a full fallback for root dependency replacement and drops the lease on revision save',async()=>{
  const s=store(),p=await saved(s),probe=startProbe();
  try{
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    p.worldReferences=[...p.worldReferences];
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(3);
    const current=(await s.getProjectForEditing(p.projectId,{immutableView:true}))!;
    await s.saveProject({...current,name:'new revision'},{reason:'rename',includeHistory:false,immutableView:true});
    expect(s.derivedIndexRetention()).toMatchObject({entries:0,references:0,textCodeUnits:0});
    filterCatalogEntities(current,dependency);filterCatalogEntities(current,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(5);
  }finally{probe.stop();}
});

it('replaces warmed author terms after real rename, alias, reorder and archive saves without changing old views',async()=>{
  const source=fixture(),person=source.entities[0]!;
  if(person.kind!=='character')throw Error('fixture person kind');
  person.data.aliases=[{id:newId(),text:'旧別名',reading:'きゅうべつめい',validity:emptyValidity(),audienceHolderIds:[],isPublicDefault:true}];
  const s=store(),original=await saved(s,source),personId=person.id;
  expect(filterCatalogEntities(original,{op:'text',value:'旧別名'}).map(e=>e.id)).toEqual([personId]);
  buildJapaneseAuthorIndex(original);
  const editable=(await s.getProjectForEditing(original.projectId))!,edited=editable.entities.find(e=>e.id===personId)!;
  if(edited.kind!=='character')throw Error('editable person kind');
  edited.name='改名した人物';edited.data.aliases![0]!.text='新しい別名';
  editable.entities.reverse();
  const next=(await s.saveProject(editable,{reason:'rename alias and order',includeHistory:false,immutableView:true})).project;
  expect(beginDerivedEvaluation(original)).toBeUndefined();
  expect(filterCatalogEntities(next,{op:'text',value:'旧別名'})).toEqual([]);
  expect(filterCatalogEntities(next,{op:'text',value:'新しい別名'}).map(e=>e.id)).toEqual([personId]);
  expect(filterCatalogEntities(next,{op:'text',value:''}).map(e=>e.id)).toEqual([...source.entities].reverse().map(e=>e.id));
  expect(buildJapaneseAuthorIndex(next).some(entry=>entry.term==='新しい別名')).toBe(true);
  expect(buildJapaneseAuthorIndex(next).some(entry=>entry.term==='旧別名')).toBe(false);
  // Old caller-held immutable data stays historically correct, but unregistered.
  expect(filterCatalogEntities(original,{op:'text',value:'旧別名'}).map(e=>e.id)).toEqual([personId]);
  const archived={...next,entities:next.entities.map(e=>e.id===personId?{...e,deletedAt:'2026-10-18T00:00:00.000Z',deletionOperationId:newId()}:e)};
  const final=(await s.saveProject(archived,{reason:'archive person',includeHistory:false,immutableView:true})).project;
  expect(beginDerivedEvaluation(next)).toBeUndefined();
  expect(filterCatalogEntities(final,{op:'text',value:'新しい別名'})).toEqual([]);
  expect(buildJapaneseAuthorIndex(final).some(entry=>entry.entityId===personId)).toBe(false);
});

it('shares Japanese preparation but returns independent editable entry containers',async()=>{
  const s=store(),p=await saved(s),probe=startProbe();
  try{
    const first=buildJapaneseAuthorIndex(p);first[0]!.term='caller change';first[0]!.classifications.push('caller category');first.length=1;
    const next=buildJapaneseAuthorIndex(p);
    expect(next).toHaveLength(p.entities.length);expect(next.some(e=>e.term==='caller change'||e.classifications.includes('caller category'))).toBe(false);
    expect(probe.snapshot().counters['derived.hit']).toBe(1);
  }finally{probe.stop();}
});

it('shares eligible state declarations without allowing returned maps or uses to corrupt the index',async()=>{
  const input=fixture(),flag=createEntity(input.projectId,'variable','flag',{key:'flag',initial:{type:'boolean',value:false}});
  const effect=createEntity(input.projectId,'effect','update',{targetId:flag.id,value:{type:'boolean',value:true}});input.entities.push(flag,effect);
  const p=await saved(store(),input),probe=startProbe();
  try{
    const first=stateUsageIndex(p);expect(first.get(flag.id)?.[0]?.operation).toBe('update');first.get(flag.id)![0]!.reason='caller change';first.clear();
    expect(stateUsageIndex(p).get(flag.id)).toEqual([{entityId:effect.id,path:'data.targetId',operation:'update',reason:''}]);
    expect(probe.snapshot().counters['derived.hit']).toBe(2);
  }finally{probe.stop();}
});

it('shares suggestion terms while recalculating option-dependent labels, ignores and Unicode positions',async()=>{
  const input=fixture();input.entities.push(createEntity(input.projectId,'character','葵'));
  const p=await saved(store(),input),firstId=p.entities[0]!.id,secondId=p.entities.at(-1)!.id,options={project:p,projectId:p.projectId},probe=startProbe();
  try{
    const first=suggestLinkCandidates('😀葵',p.entities,options);
    expect(first).toHaveLength(2);expect(first.every(c=>c.start===1&&c.end===2)).toBe(true);
    const next=suggestLinkCandidates('😀葵',p.entities,{...options,excludeEntityIds:[firstId]});
    expect(next).toHaveLength(1);expect(next[0]!.entityId).toBe(secondId);expect(next[0]!.label).not.toContain(secondId.slice(-6));
    expect(probe.snapshot().counters['derived.hit']).toBe(p.entities.length-1);
    expect(suggestLinkCandidates('😀葵',p.entities,{...options,ignoredKeys:new Set(first.map(c=>c.ignoreKey))})).toEqual([]);
  }finally{probe.stop();}
});

it('does not publish delayed reference preparation after the concrete role owner is revoked',async()=>{
  const s=store(),p=await saved(s),progress:number[]=[];let resume!:()=>void;
  const pending=prepareReferenceIndex(p.entities,{project:p,onProgress:n=>progress.push(n),yieldControl:()=>new Promise<void>(resolve=>{resume=resolve;})});
  expect(cachedReferencesTo(p.entities,p.entities[0]!.id,p)).toBeUndefined();
  s.setAuthorAccess({});resume();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(progress).toEqual([0]);
  expect(cachedReferencesTo(p.entities,p.entities[0]!.id,p)).toBeUndefined();
  expect(s.derivedIndexRetention()).toEqual({owners:0,entries:0,references:0,textCodeUnits:0});
});

it('shares an owned reference index and isolates returned rows from the shared map',async()=>{
  const p=await saved(store()),id=p.entities[0]!.id,probe=startProbe();
  try{
    const rows=referencesTo(p.entities,id,p);expect(rows.map(e=>e.name)).toEqual(['門の出来事']);rows.length=0;
    expect(referencesTo(p.entities,id,p).map(e=>e.name)).toEqual(['門の出来事']);
    expect(probe.snapshot().counters['reference.index.builds']).toBe(1);
  }finally{probe.stop();}
});

it('gives UI-held reference rows a revocable proof after actual schema and role changes',async()=>{
  const source=fixture(),id=source.entities[0]!.id;
  source.entities.push(createEntity(source.projectId,'character','新しい参照元',{reading:id}));
  const s=store(),p=await saved(s,source),read=await prepareReferenceIndex(p.entities,{project:p,yieldControl:async()=>{}});
  expect(read(id).map(e=>e.name)).toEqual(['門の出来事']);
  expect(typeof Reflect.get(read,'isCurrent'),'component-held rows need a source/schema validity proof').toBe('function');
  const isCurrent=Reflect.get(read,'isCurrent') as ()=>boolean;
  expect(isCurrent()).toBe(true);
  const definition=ENTITY_SCHEMAS.character;if(definition.type!=='object')throw Error('character schema kind');
  const field=definition.fields.reading!,original=field.schema;
  try{
    field.schema={type:'ref',scope:'entity',kinds:['character']};
    expect(isCurrent()).toBe(false);
    expect(cachedReferencesTo(p.entities,id,p)?.map(e=>e.name)).toEqual(['門の出来事','新しい参照元']);
    const next=await prepareReferenceIndex(p.entities,{project:p,yieldControl:async()=>{}});
    expect((Reflect.get(next,'isCurrent') as ()=>boolean)()).toBe(true);
    s.setAuthorAccess({});expect((Reflect.get(next,'isCurrent') as ()=>boolean)()).toBe(false);
  }finally{field.schema=original;}
});

it('clears values and uses complete regeneration while schema dependencies contain an unsupported cycle',async()=>{
  const s=store(),p=await saved(s),schema=ENTITY_SCHEMAS.character,probe=startProbe();
  if(schema.type!=='object')throw Error('fixture schema');
  try{
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    schema.fields.unsupportedCycle={schema};
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(3);
    expect(s.derivedIndexRetention().entries).toBe(0);
    delete schema.fields.unsupportedCycle;
    filterCatalogEntities(p,dependency);filterCatalogEntities(p,dependency);
    expect(probe.snapshot().counters['query.index.builds']).toBe(4);
  }finally{delete schema.fields.unsupportedCycle;probe.stop();}
});

it('rejects a replaced root accessor without executing it as an ownership check',async()=>{
  const p=await saved(store()),revision=p.revision;let calls=0;
  Object.defineProperty(p,'revision',{configurable:true,enumerable:true,get(){calls++;throw Error('accessor executed');}});
  expect(beginDerivedEvaluation(p)).toBeUndefined();expect(calls).toBe(0);
  Object.defineProperty(p,'revision',{value:revision,writable:true,enumerable:true,configurable:true});
});
