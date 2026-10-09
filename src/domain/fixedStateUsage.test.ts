import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {createEntity,createProject,newId,validateProject} from './model';
import type {Entity,ProjectData} from './types';
import {prepareReuse,resolveReuseContent} from './reuse';
import {startTrialVerified} from './runtimeVerified';
import {stateUsageIndex} from './stateUsage';
import {findCatalogMaintenance,findCatalogMaintenanceVerified} from './catalog';
import {exportScenario,inspectScenario,verifySnapshotHashes} from '../storage/archive';
import {jsonBytes,sha256} from '../storage/json';
import {cloneProject,ScenarioStore} from '../storage/store';

const stores:ScenarioStore[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
async function fixture(mode:'reference'|'override'='reference',overrideGate=false){
  let project=createProject('固定場面の状態利用');
  const variable=createEntity(project.projectId,'variable','固定入口が読むY',{key:'fixed-use-y',initial:{type:'boolean',value:false},externalUseDeclared:true});
  const source=createEntity(project.projectId,'flow_node','共通入口C',{nodeType:'entry',gate:{op:'compare',variableId:variable.id,comparator:'eq',value:{type:'boolean',value:false}}});
  const owner=createEntity(project.projectId,'flow_node','使用入口S',{nodeType:'entry'}),end=createEntity(project.projectId,'flow_node','完了',{nodeType:'terminal',terminalReason:'利用確認完了'});
  const edge=createEntity(project.projectId,'flow_edge','入口から完了',{fromId:owner.id,toId:end.id});
  const graph=createEntity(project.projectId,'flow_graph','使用先の経路',{nodeIds:[owner.id,end.id],edgeIds:[edge.id],entryIds:[owner.id],exitIds:[end.id]});
  project.entities.push(variable,source,owner,end,edge,graph);
  project=(await prepareReuse(project,{ownerId:owner.id,sourceId:source.id,mode,overrideFields:mode==='override'?[overrideGate?'gate':'terminalReason']:[]})).candidate;
  (project.entities.find(entity=>entity.id===source.id) as Entity<'flow_node'>).data.gate={op:'constant',value:true};
  expect(validateProject(project).ok).toBe(true);await verifySnapshotHashes([project]);
  const pinned=(project.entities.find(entity=>entity.id===owner.id) as Entity<'flow_node'>).data.reuse!.pinnedSnapshotId;
  expect((await startTrialVerified(project,{entryId:owner.id})).status).toBe('ready');
  return {project,variable,source,owner,pinned};
}
const unused=(project:ProjectData,id:string)=>findCatalogMaintenance(project).filter(f=>f.targetIds.includes(id)&&['unreferenced','external_use','retained'].includes(f.kind));

it.each(['reference','override'] as const)('keeps a %s fixed gate as an authored read after the source manuscript changes',async mode=>{
  const {project,variable,source,owner,pinned}=await fixture(mode),beforeHash=await sha256(jsonBytes(project));
  const derived=resolveReuseContent(project,project.snapshots);
  expect(stateUsageIndex(derived).get(variable.id)).toEqual([expect.objectContaining({entityId:owner.id,operation:'read',path:'data.gate.variableId'})]);
  expect(stateUsageIndex(project).get(variable.id)).toEqual([expect.objectContaining({entityId:owner.id,sourceEntityId:source.id,sourceVersionId:pinned,reuseOwnerId:owner.id,operation:'read'})]);
  expect(unused(project,variable.id)).toEqual([]);
  const verified=await findCatalogMaintenanceVerified(project);
  expect(verified.some(f=>f.targetIds.includes(variable.id)&&['unreferenced','external_use','needs_review'].includes(f.kind))).toBe(false);
  expect(await sha256(jsonBytes(project))).toBe(beforeHash);
});

it('uses the explicit local gate override instead of counting a superseded fixed gate',async()=>{
  const {project,variable}=await fixture('override',true);
  expect(stateUsageIndex(project).get(variable.id)??[]).toEqual([]);
  const verified=await findCatalogMaintenanceVerified(project);
  expect(verified).toContainEqual(expect.objectContaining({kind:'external_use',targetIds:[variable.id]}));
});

it('attributes a local gate override to the use site rather than to an old pin that never read its variable',async()=>{
  const {project,variable,owner,pinned}=await fixture('override',true);
  const local=createEntity(project.projectId,'variable','ローカル入口だけが読むZ',{key:'local-use-z',initial:{type:'boolean',value:true},externalUseDeclared:true});
  project.entities.push(local);
  (project.entities.find(entity=>entity.id===owner.id) as Entity<'flow_node'>).data.gate={op:'compare',variableId:local.id,comparator:'eq',value:{type:'boolean',value:true}};
  expect(validateProject(project).ok).toBe(true);await verifySnapshotHashes([project]);
  expect((await startTrialVerified(project,{entryId:owner.id})).status).toBe('ready');
  expect(project.snapshots.find(snapshot=>snapshot.id===pinned)!.content.entities.some(entity=>entity.id===local.id)).toBe(false);
  const uses=stateUsageIndex(project).get(local.id)!;
  expect(uses).toEqual([{entityId:owner.id,path:'data.gate.variableId',operation:'read',reason:'条件・宣言の参照'}]);
  expect(stateUsageIndex(project).get(variable.id)??[]).toEqual([]);
  expect((await findCatalogMaintenanceVerified(project)).some(f=>f.targetIds.includes(local.id)&&['unreferenced','external_use','needs_review'].includes(f.kind))).toBe(false);
});

it('retains the intermediate override edition through an outer reference and keeps a later outer override local',async()=>{
  let {project,owner:middle}=await fixture('override',true);
  const local=createEntity(project.projectId,'variable','中間が読むZ',{key:'nested-use-z',initial:{type:'boolean',value:true}});
  project.entities.push(local);
  (project.entities.find(entity=>entity.id===middle.id) as Entity<'flow_node'>).data.gate={op:'compare',variableId:local.id,comparator:'eq',value:{type:'boolean',value:true}};
  const outer=createEntity(project.projectId,'flow_node','外側の使用入口',{nodeType:'entry'}),end=createEntity(project.projectId,'flow_node','外側の完了',{nodeType:'terminal',terminalReason:'二段階の利用確認完了'});
  const edge=createEntity(project.projectId,'flow_edge','外側から完了',{fromId:outer.id,toId:end.id}),graph=createEntity(project.projectId,'flow_graph','外側の経路',{nodeIds:[outer.id,end.id],edgeIds:[edge.id],entryIds:[outer.id],exitIds:[end.id]});
  project.entities.push(outer,end,edge,graph);project=(await prepareReuse(project,{ownerId:outer.id,sourceId:middle.id,mode:'reference'})).candidate;
  const declared=project.entities.find(entity=>entity.id===outer.id) as Entity<'flow_node'>,pin=declared.data.reuse!.pinnedSnapshotId,before=await sha256(jsonBytes(project));
  expect(validateProject(project).ok).toBe(true);await verifySnapshotHashes([project]);
  expect((await startTrialVerified(project,{entryId:outer.id})).status).toBe('ready');
  expect(stateUsageIndex(project).get(local.id)!.filter(use=>use.entityId===outer.id)).toEqual([expect.objectContaining({entityId:outer.id,path:'data.gate.variableId',operation:'read',sourceEntityId:middle.id,sourceVersionId:pin,reuseOwnerId:outer.id})]);
  expect(await sha256(jsonBytes(project))).toBe(before);
  const own=createEntity(project.projectId,'variable','外側だけが読むZ',{key:'outer-use-z',initial:{type:'boolean',value:true}});
  project.entities.push(own);declared.data.reuse!.mode='override';declared.data.reuse!.overrideFields=['gate'];
  declared.data.gate={op:'compare',variableId:own.id,comparator:'eq',value:{type:'boolean',value:true}};
  expect(validateProject(project).ok).toBe(true);expect((await startTrialVerified(project,{entryId:outer.id})).status).toBe('ready');
  expect(stateUsageIndex(project).get(local.id)!.some(use=>use.entityId===outer.id)).toBe(false);
  expect(stateUsageIndex(project).get(own.id)).toEqual([{entityId:outer.id,path:'data.gate.variableId',operation:'read',reason:'条件・宣言の参照'}]);
});

it('assesses one captured image when the caller changes the fixed body while its actual SHA digest is pending',async()=>{
  const {project,variable,source,pinned}=await fixture(),pin=project.snapshots.find(snapshot=>snapshot.id===pinned)!;
  const baseline=await findCatalogMaintenanceVerified(project),expected=pin.contentHash;
  let release!:()=>void,entered!:()=>void;
  const held=new Promise<void>(resolve=>release=resolve),began=new Promise<void>(resolve=>entered=resolve);
  const digest=crypto.subtle.digest.bind(crypto.subtle);let first=true;
  const spy=vi.spyOn(crypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{
    const actual=digest(algorithm,data);
    if(first){first=false;entered();await held;}return actual;
  });
  let result:Awaited<ReturnType<typeof findCatalogMaintenanceVerified>>;
  try{
    const pending=findCatalogMaintenanceVerified(project);await began;
    const changed=structuredClone(pin.content),changedSource=changed.entities.find(entity=>entity.id===source.id) as Entity<'flow_node'>;
    changedSource.data.gate={op:'constant',value:true};
    changedSource.customValues.savedReference={type:'ref',value:variable.id};
    pin.content=changed;release();result=await pending;
  }finally{release();spy.mockRestore();}
  expect(validateProject(project).ok).toBe(true);
  expect(await sha256(jsonBytes(pin.content))).not.toBe(expected);expect(pin.contentHash).toBe(expected);
  expect(result!.filter(f=>f.targetIds.includes(variable.id))).toEqual(baseline.filter(f=>f.targetIds.includes(variable.id)));
  expect(result!.some(f=>f.targetIds.includes(variable.id)&&['unreferenced','external_use','needs_review'].includes(f.kind))).toBe(false);
});

it.each(['missing','stale'] as const)('keeps a %s fixed pin unconfirmed without calling its states unused or resealing it',async kind=>{
  const {project,variable,pinned}=await fixture(),pin=project.snapshots.find(snapshot=>snapshot.id===pinned)!;
  if(kind==='missing')project.snapshots=[];
  else (pin.content.entities.find(entity=>entity.kind==='flow_node'&&entity.data.gate?.op==='compare') as Entity<'flow_node'>).data.gate={op:'constant',value:true};
  const hash=await sha256(jsonBytes(project)),expected=pin.contentHash;
  await expect(startTrialVerified(project)).rejects.toThrow('固定版');
  expect(unused(project,variable.id)).toEqual([]);
  expect(findCatalogMaintenance(project)).toContainEqual(expect.objectContaining({kind:'needs_review',targetIds:[variable.id],reason:expect.stringContaining('未判定')}));
  const verified=await findCatalogMaintenanceVerified(project);
  expect(verified).toContainEqual(expect.objectContaining({kind:'needs_review',targetIds:[variable.id],reason:expect.stringContaining('未判定')}));
  expect(verified.some(f=>f.targetIds.includes(variable.id)&&['unreferenced','external_use','retained'].includes(f.kind))).toBe(false);
  expect(pin.contentHash).toBe(expected);expect(await sha256(jsonBytes(project))).toBe(hash);
});

it('excludes a rejected reuse owner from current effective state use',async()=>{
  const {project,variable,owner}=await fixture();(project.entities.find(entity=>entity.id===owner.id)!).status='rejected';
  expect(stateUsageIndex(project).get(variable.id)??[]).toEqual([]);
  expect(await findCatalogMaintenanceVerified(project)).toContainEqual(expect.objectContaining({kind:'external_use',targetIds:[variable.id]}));
});

it('retains the fixed read and its remapped source edition through complete-file clone, atomic import and cold reload',async()=>{
  const original=await fixture(),bytes=await exportScenario(original.project,{worker:false}),decoded=(await inspectScenario(bytes,{worker:false})).project;
  const {project:cloned,idMap}=await cloneProject(decoded),name=`fixed-state-cold-${newId()}`,store=new ScenarioStore({databaseName:name});stores.push(store);
  const prepared=await inspectScenario(await exportScenario(cloned,{worker:false}),{worker:false});await store.importScenario(prepared,{mode:'new'});store.close();
  const coldStore=new ScenarioStore({databaseName:name});stores.push(coldStore);const cold=(await coldStore.getProjectForEditing(cloned.projectId))!;
  await verifySnapshotHashes([cold]);expect((await startTrialVerified(cold,{entryId:idMap[original.owner.id]})).status).toBe('ready');
  expect(stateUsageIndex(cold).get(idMap[original.variable.id]!)).toEqual([expect.objectContaining({entityId:idMap[original.owner.id],sourceEntityId:idMap[original.source.id],sourceVersionId:idMap[original.pinned],operation:'read'})]);
  expect((await findCatalogMaintenanceVerified(cold)).some(f=>f.targetIds.includes(idMap[original.variable.id]!)&&['unreferenced','external_use'].includes(f.kind))).toBe(false);
});
