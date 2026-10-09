import {expect,it} from 'vitest';
import {createDemoProject,createEntity,newId,validateProject} from './model';
import {getTrialChoices,startTrial,stepTrial,trialRecordData} from './runtime';
import {findCatalogMaintenance} from './catalog';
import {stateUsageIndex} from './stateUsage';
import {deletionImpact} from './maintenance';
import type {Entity,ProjectData} from './types';

function record(project:ProjectData){
  const start=startTrial(project),choice=getTrialChoices(project,start)[0];
  expect(start.status).toBe('ready');expect(choice).toBeDefined();
  const trial=stepTrial(project,start,{edgeId:choice.edgeId}),id=newId(),data=trialRecordData(project,trial,id);
  const checkpoint=createEntity(project.projectId,'checkpoint','保存した開始状態',data.checkpoint);checkpoint.id=id;
  const trace=createEntity(project.projectId,'trace','保存した試読経路',data.trace);project.entities.push(checkpoint,trace);
  const validation=validateProject(project);expect(validation.ok,validation.ok?'':JSON.stringify(validation.issues)).toBe(true);
  return {checkpoint,trace};
}

it('keeps external unused state discoverable after an actual trial record without losing protected references',()=>{
  const project=createDemoProject(),y=createEntity(project.projectId,'variable','未使用Y',{key:'unused-y',initial:{type:'boolean',value:false},externalUseDeclared:true});project.entities.push(y);
  expect(findCatalogMaintenance(project).some(f=>f.kind==='external_use'&&f.targetIds.includes(y.id))).toBe(true);
  const saved=record(project),before=structuredClone(project);
  expect(saved.checkpoint.data.runtimeState.variableValues[y.id]).toEqual(y.data.initial);
  expect(stateUsageIndex(project).get(y.id)??[]).toEqual([]);
  expect(findCatalogMaintenance(project).some(f=>f.kind==='external_use'&&f.targetIds.includes(y.id))).toBe(true);
  expect(findCatalogMaintenance(project).some(f=>f.kind==='unreferenced'&&f.targetIds.includes(y.id))).toBe(false);
  expect(deletionImpact(project,y.id).map(f=>f.sourceId)).toEqual(expect.arrayContaining([saved.checkpoint.id,saved.trace.id]));
  expect(project).toEqual(before);
});

it('distinguishes authored read/update/reset from saved values and retains actual usage across more trial records',()=>{
  const project=createDemoProject(),x=project.entities.find((e):e is Entity<'variable'>=>e.kind==='variable')!;
  x.data.resetRules=[{on:'new_loop',value:x.data.initial,reason:'次周回で初期化'}];
  const original=stateUsageIndex(project).get(x.id)!;
  expect(original.map(u=>u.operation)).toEqual(expect.arrayContaining(['read','update','reset']));
  record(project);record(project);
  expect(stateUsageIndex(project).get(x.id)).toEqual(original);
  expect(findCatalogMaintenance(project).some(f=>f.targetIds.includes(x.id)&&['unreferenced','external_use'].includes(f.kind))).toBe(false);
});

it('shows an unused state with saved values as a candidate, then removes it only when an authored declaration uses it',()=>{
  const project=createDemoProject(),y=createEntity(project.projectId,'variable','未使用Y',{key:'unused-y',initial:{type:'boolean',value:false}});project.entities.push(y);record(project);
  const candidate=findCatalogMaintenance(project).find(f=>f.kind==='unreferenced'&&f.targetIds.includes(y.id));
  expect(candidate?.disposition).toBe('candidate');expect(candidate?.reason).toContain('保存');
  const reader=project.entities.find((entity):entity is Entity<'flow_node'>=>entity.kind==='flow_node')!;
  reader.data.gate={op:'compare',variableId:y.id,comparator:'eq',value:{type:'boolean',value:false}};
  expect(validateProject(project).ok).toBe(true);
  expect(stateUsageIndex(project).get(y.id)).toEqual([expect.objectContaining({entityId:reader.id,operation:'read'})]);
  expect(findCatalogMaintenance(project).some(f=>f.kind==='unreferenced'&&f.targetIds.includes(y.id))).toBe(false);
});

it('keeps explicit retention and reference protection while excluding review targets and rejected reads from authored use',()=>{
  const project=createDemoProject(),y=createEntity(project.projectId,'variable','保持する未使用Y',{key:'retained-y',initial:{type:'boolean',value:false}});
  y.retainIfUnreferenced=true;project.entities.push(y);const saved=record(project);
  const review=createEntity(project.projectId,'review','Yの利用先を確認',{target:y.id,targetVersionId:project.projectId});project.entities.push(review);
  const rejected=createEntity(project.projectId,'flow_node','没にした読取',{gate:{op:'compare',variableId:y.id,comparator:'eq',value:{type:'boolean',value:false}}});rejected.status='rejected';project.entities.push(rejected);
  expect(validateProject(project).ok).toBe(true);expect(stateUsageIndex(project).get(y.id)??[]).toEqual([]);
  const findings=findCatalogMaintenance(project).filter(f=>f.targetIds.includes(y.id));
  expect(findings).toContainEqual(expect.objectContaining({kind:'retained',disposition:'candidate',reason:expect.stringContaining('未使用')}));
  expect(findings.some(f=>f.kind==='unreferenced')).toBe(false);
  expect(deletionImpact(project,y.id).map(f=>f.sourceId)).toEqual(expect.arrayContaining([saved.checkpoint.id,saved.trace.id,review.id,rejected.id]));
  expect(y.deletedAt).toBeUndefined();
});

it('keeps navigation links and production targets protected without declaring a read of the state value',()=>{
  const project=createDemoProject(),y=createEntity(project.projectId,'variable','リンクだけのY',{key:'linked-y',initial:{type:'boolean',value:false},externalUseDeclared:true});project.entities.push(y);
  const note=createEntity(project.projectId,'note','Yの整理メモ',{body:[{id:newId(),kind:'paragraph',text:'Yを確認',links:[{start:0,end:1,target:{entityId:y.id}}]}]});
  const task=createEntity(project.projectId,'production_task','Yの外部利用を調査',{targetIds:[y.id]});project.entities.push(note,task);
  project.views.push({id:newId(),name:'Yを整理する一覧',view:'catalog',entityIds:[y.id],settings:{}});
  expect(validateProject(project).ok).toBe(true);const before=structuredClone(project);
  expect(stateUsageIndex(project).get(y.id)??[]).toEqual([]);
  expect(findCatalogMaintenance(project)).toContainEqual(expect.objectContaining({kind:'external_use',targetIds:[y.id],disposition:'candidate'}));
  expect(deletionImpact(project,y.id).map(f=>f.sourceId)).toEqual(expect.arrayContaining([note.id,task.id]));expect(project).toEqual(before);
});

it('keeps derived and exclusion reads distinct from a variable-description navigation link',()=>{
  const project=createDemoProject(),y=createEntity(project.projectId,'variable','算出と排他に使うY',{key:'derived-y',initial:{type:'boolean',value:false},externalUseDeclared:true});project.entities.push(y);
  const derived=createEntity(project.projectId,'variable','算出Z',{key:'derived-z',valueType:'integer',initial:{type:'integer',value:0},allowed:{min:0,max:10},derived:{op:'if',condition:{op:'compare',variableId:y.id,comparator:'eq',value:{type:'boolean',value:true}},then:{op:'value',value:{type:'integer',value:1}},else:{op:'value',value:{type:'integer',value:0}}},exclusions:[{variableId:y.id,value:{type:'integer',value:1},otherValue:{type:'boolean',value:true},reason:'YとZの禁止組合せ'}],description:[{id:newId(),kind:'paragraph',text:'Yを確認',links:[{start:0,end:1,target:{entityId:y.id}}]}]});project.entities.push(derived);
  expect(validateProject(project).ok).toBe(true);
  expect(stateUsageIndex(project).get(y.id)).toEqual([expect.objectContaining({entityId:derived.id,path:'data.derived.condition.variableId',operation:'read'}),expect.objectContaining({entityId:derived.id,path:'data.exclusions[0].variableId',operation:'read'})]);
  expect(findCatalogMaintenance(project).some(f=>['unreferenced','external_use'].includes(f.kind)&&f.targetIds.includes(y.id))).toBe(false);
});

it('reports both exclusion operands and the authored recalculation of a derived state',()=>{
  const project=createDemoProject(),peer=createEntity(project.projectId,'variable','排他の相手B',{key:'excluded-b',initial:{type:'boolean',value:false}}),owner=createEntity(project.projectId,'variable','排他を宣言するA',{key:'excluded-a',initial:{type:'boolean',value:false},exclusions:[{variableId:peer.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'AとBの両値を確認'}]}),derived=createEntity(project.projectId,'variable','Bから再計算するD',{key:'derived-d',initial:{type:'boolean',value:false},derived:{op:'variable',variableId:peer.id}});project.entities.push(owner,peer,derived);
  expect(validateProject(project).ok).toBe(true);const uses=stateUsageIndex(project);
  expect(uses.get(owner.id)).toEqual([expect.objectContaining({entityId:owner.id,path:'data.exclusions[0].value',operation:'read',reason:'AとBの両値を確認'})]);
  expect(uses.get(peer.id)?.map(use=>use.entityId)).toEqual([owner.id,derived.id]);
  expect(uses.get(derived.id)).toEqual([expect.objectContaining({entityId:derived.id,path:'data.derived',operation:'update'})]);
  expect(findCatalogMaintenance(project).some(f=>['unreferenced','external_use'].includes(f.kind)&&f.targetIds.some(id=>[owner.id,peer.id,derived.id].includes(id)))).toBe(false);
});
