import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import * as catalog from '../../src/domain/catalog';
import {createEntity,createProject,newId} from '../../src/domain/model';
import {ScenarioStore} from '../../src/storage/store';
import {startProbe} from '../../src/observability/probe';
import type {ProjectData,Query} from '../../src/domain/types';

const invoke=(name:string,...args:unknown[])=>{const fn=Reflect.get(catalog,name);expect(typeof fn,`missing ${name}`).toBe('function');return fn(...args);};
const stores:ScenarioStore[]=[];
const all:Query={op:'all',children:[]};
function fixture(){const p=createProject('ordered collection');for(let i=0;i<125;i++)p.entities.push(createEntity(p.projectId,'note',`項目${i}`,{body:[]}));return p;}
async function saved(){const s=new ScenarioStore({databaseName:'p207-'+newId(),accountId:'collection-author'});stores.push(s);const p=(await s.saveProject(fixture(),{reason:'seed',includeHistory:false,immutableView:true})).project;return {s,p};}
afterEach(async()=>{for(const s of stores.splice(0))await s.deleteDatabase();});

it('reads only requested IDs and keeps unloaded, absent and stale results distinct',()=>{
  const a={id:'a',name:'A'},hidden={id:'hidden',name:'選択中'},calls:string[][]=[];
  const reader=(ids:readonly string[])=>{calls.push([...ids]);return new Map(ids.flatMap(id=>id==='a'?[[id,{state:'loaded',row:a}]]:id==='hidden'?[[id,{state:'loaded',row:hidden}]]:id==='missing'?[[id,{state:'absent'}]]:[]));};
  let current=true;const view=invoke('createOrderedCollection',['a','unread','missing'],reader,()=>current);
  expect(view.readPage(0,3)).toEqual({state:'unloaded',rows:[a],missingIds:['missing'],unloadedIds:['unread']});
  expect(view.selected('hidden')).toEqual({state:'loaded',row:hidden});expect(view.positionOf('hidden')).toBe(-1);
  expect(calls).toEqual([['a','unread','missing'],['hidden']]);
  current=false;expect(view.readPage(0,1)).toEqual({state:'stale',rows:[],missingIds:[],unloadedIds:[]});
  expect(view.selected('a')).toEqual({state:'stale'});expect(calls).toHaveLength(2);
});

it('rechecks source ownership after a reader invalidates it during acquisition',()=>{
  let current=true;
  const view=invoke('createOrderedCollection',['a'],()=>{current=false;return new Map([['a',{state:'loaded',row:{id:'a'}}]]);},()=>current);
  expect(view.readPage(0,1)).toEqual({state:'stale',rows:[],missingIds:[],unloadedIds:[]});
  current=true;expect(view.selected('a')).toEqual({state:'stale'});
});

it('shares one fresh proof inside a synchronous read frame and expires it across an await',async()=>{
  let proofs=0,active=true;
  const view=invoke('createOrderedCollection',['a'],()=>new Map([['a',{state:'loaded',row:{id:'a'}}]]),()=>{proofs++;return active;},()=>active);
  expect(typeof view.beginRead).toBe('function');const frame=view.beginRead();
  expect(frame.positionOf('a')).toBe(0);expect(frame.readPage(0,1).rows).toEqual([{id:'a'}]);expect(frame.selected('a')).toEqual({state:'loaded',row:{id:'a'}});
  expect(proofs).toBe(1);await Promise.resolve();
  expect(frame.readPage(0,1).state).toBe('stale');expect(frame.selected('a')).toEqual({state:'stale'});
  expect(view.readPage(0,1).rows).toEqual([{id:'a'}]);expect(proofs).toBe(2);
  active=false;expect(view.selected('a')).toEqual({state:'stale'});
});

it('keeps a mismatched returned row unchecked instead of substituting it for a requested ID',()=>{
  const view=invoke('createOrderedCollection',['a'],()=>new Map([['a',{state:'loaded',row:{id:'other'}}]]));
  expect(view.readPage(0,1)).toEqual({state:'unloaded',rows:[],missingIds:[],unloadedIds:['a']});
  expect(view.selected('a')).toEqual({state:'unloaded'});
});

it('keeps all 125 authored IDs, tail selection and original ordinals while acquiring bounded pages',async()=>{
  const {p}=await saved(),view=invoke('createCatalogCollection',p,all),expected=p.entities.map(e=>e.id),probe=startProbe();
  try{
    expect(view.ids).toEqual(expected);expect(view.positionOf(expected[124])).toBe(124);expect(view.originalIndex(expected[124])).toBe(124);
    expect(view.readPage(120,30).rows.map((e:{id:string})=>e.id)).toEqual(expected.slice(120));
    expect(view.selected(expected[124])).toEqual({state:'loaded',row:p.entities[124]});
    expect(probe.snapshot().counters['collection.page.rows']).toBe(5);
    expect(probe.snapshot().counters['collection.selected.rows']).toBe(1);
    expect(probe.snapshot().counters['db.read.rows']??0).toBe(0);
  }finally{probe.stop();}
});

it('prepares only a row lookup for plain pages, without unrelated query dependency indexes',async()=>{
  const {p}=await saved(),probe=startProbe();
  try{
    const view=invoke('createCatalogCollection',p,all);view.readPage(0,30);view.readPage(30,30);
    expect(probe.snapshot().counters['query.index.builds']??0).toBe(0);
    expect(probe.snapshot().counters['collection.index.builds']).toBe(1);
  }finally{probe.stop();}
});

it('keeps a nonmatching selected ID available without injecting it into filtered Japanese results',async()=>{
  const {p}=await saved(),selected=p.entities[124]!.id,view=invoke('createCatalogCollection',p,{op:'text',value:'項目12'});
  expect(view.ids).toEqual([p.entities[12]!.id,...p.entities.slice(120).map(e=>e.id)]);
  const hidden=p.entities[99]!.id;
  expect(view.positionOf(hidden)).toBe(-1);expect(view.selected(hidden)).toEqual({state:'loaded',row:p.entities[99]});
  expect(view.selected(selected).row.id).toBe(selected);
  expect(view.readPage(1,3).rows.map((e:{name:string})=>e.name)).toEqual(['項目120','項目121','項目122']);
});

it('refuses stale rows after source ownership changes instead of reporting an empty valid collection',async()=>{
  const {s,p}=await saved(),view=invoke('createCatalogCollection',p,all);view.readPage(0,30);
  s.setAuthorAccess({});
  expect(view.readPage(0,30).state).toBe('stale');expect(view.readPage(0,30).rows).toEqual([]);
  expect(view.selected(p.entities[0]!.id)).toEqual({state:'stale'});
});

it('fully regenerates an unknown mutable source and preserves duplicate draft rows without sharing them',()=>{
  const p=fixture(),view=invoke('createCatalogCollection',p,{op:'text',value:'項目124'}),last=p.entities[124]!;
  expect(view.ids).toEqual([last.id]);last.name='変えた入力';
  expect(view.ids).toEqual([]);expect(view.readPage(0,30).rows).toEqual([]);
  expect(view.selected(last.id)).toEqual({state:'loaded',row:last});
  const duplicate={...last,name:'同IDの未検証入力'};p.entities.push(duplicate);
  const draft=invoke('createCatalogCollection',p,all);
  expect(draft.readPage(124,2).rows).toEqual([last,duplicate]);
});

it('retains saved collection ordering and missing fixed IDs independently from selection',async()=>{
  const {p}=await saved(),missing=newId(),collection=createEntity(p.projectId,'collection','固定',{memberIds:[p.entities[124]!.id,missing,p.entities[0]!.id],sort:null});
  const view=invoke('createCatalogCollection',p,all,collection);
  expect(view.ids).toEqual([p.entities[124]!.id,p.entities[0]!.id]);
  expect(view.readPage(0,30).rows.map((e:{id:string})=>e.id)).toEqual(view.ids);
  expect(view.selected(missing)).toEqual({state:'absent'});
});
