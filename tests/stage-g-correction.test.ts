import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, emptyValidity } from '../src/domain/model';
import { ScenarioStore, cloneProject } from '../src/storage/store';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { startTrial, stepTrial } from '../src/domain/runtime';
import { prepareTrialCorrection, prepareTrialCorrectionSave, replayTraceAgainstRevision } from '../src/domain/traceReconfirmation';
function fixture() {
 const p=createProject('一文の再読'), scene=createEntity(p.projectId,'scene','着いた場面',{body:[{id:newId(),kind:'paragraph',text:'旧い一文。'}]}), entry=createEntity(p.projectId,'flow_node','入口',{nodeType:'entry'}), target=createEntity(p.projectId,'flow_node','本文',{nodeType:'scene',sceneId:scene.id}), end=createEntity(p.projectId,'flow_node','結末',{nodeType:'terminal',terminalReason:'終わり'}), edge=createEntity(p.projectId,'flow_edge','読む',{fromId:entry.id,toId:target.id}), finish=createEntity(p.projectId,'flow_edge','終える',{fromId:target.id,toId:end.id});
 p.entities.push(scene,entry,target,end,edge,finish);return {p,scene,entry,target,end,edge};
}
describe('G12 separate correction and same path replay',()=>{
 it('captures edition, paragraph, seed and partial choice history separately and returns to the corrected line',async()=>{
  const f=fixture(), session=stepTrial(f.p,startTrial(f.p,{seed:'fixed-seed'}),{edgeId:f.edge.id}), plan=await prepareTrialCorrection(f.p,session,{entityId:f.scene.id,blockId:f.scene.data.body[0].id});
  expect(plan.anchor.sourceVersionId).toBe(plan.snapshots[0].id);expect(plan.candidate).not.toBe(f.scene);expect(plan.sourceTrace.data.seed).toBe('fixed-seed');
  f.p.entities.push(...plan.entities);f.p.snapshots.push(...plan.snapshots);const old=structuredClone(plan.sourceTrace);
  f.scene.data.body[0].text='直した一文。';f.p.revision='2';
  const result=await replayTraceAgainstRevision(f.p,plan.sourceTrace.id);
  expect(result.status).toBe('same_path');expect(result.session?.nodeId).toBe(f.target.id);expect(result.session?.content.entities.find(e=>e.id===f.scene.id)?.data).toMatchObject({body:[{text:'直した一文。'}]});expect(plan.sourceTrace).toEqual(old);
 });
 it.each([['leading paragraph','🌌🦊XYZ'], ['leading paragraph','🌌🦊XYZ\nΔΩЖ'], ['leading\nparagraph','🌌🦊XYZ\nΔΩЖ']])('returns a new snapshot anchor past %s to a completely rewritten paragraph: %s',async(leading,text)=>{
  const f=fixture(), oldBlockId=f.scene.data.body[0].id;
  f.scene.data.body=[{id:newId(),kind:'paragraph',text:leading}, {id:oldBlockId,kind:'paragraph',text:'abc'}, {id:newId(),kind:'paragraph',text:'trailing paragraph'}];
  const session=stepTrial(f.p,startTrial(f.p),{edgeId:f.edge.id}), plan=await prepareTrialCorrection(f.p,session,{entityId:f.scene.id,blockId:oldBlockId}), oldPlan=structuredClone(plan);
  const prepared=await prepareTrialCorrectionSave(f.p,plan,text), replay=await replayTraceAgainstRevision(prepared.project,plan.sourceTrace.id,{targetVersionId:prepared.targetVersionId});
  expect(replay.status).toBe('same_path');
  const corrected=replay.session?.content.entities.find(entity=>entity.id===f.scene.id);
  if(corrected?.kind!=='scene')throw new Error('corrected scene missing');
  expect(corrected.data.body.map(block=>block.text)).toEqual([...leading.split('\n'),...text.split('\n'),'trailing paragraph']);
  const correctedBlock=corrected.data.body[leading.split('\n').length];
  expect(correctedBlock.id).not.toBe(oldBlockId);
  expect(prepared.targetAnchor).toEqual({entityId:f.scene.id,blockId:correctedBlock.id,sourceVersionId:prepared.targetVersionId});
  expect(prepared.project.entities.find(entity=>entity.id===plan.sourceTrace.id)).toEqual(oldPlan.sourceTrace);
  expect(prepared.project.snapshots.find(snapshot=>snapshot.id===plan.snapshots[0].id)).toEqual(oldPlan.snapshots[0]);
  expect(plan).toEqual(oldPlan);
 });
 it('keeps the selected target when saving unchanged text after an imported multiline block',async()=>{
  const f=fixture(), blockId=f.scene.data.body[0].id;
  f.scene.data.body.unshift({id:newId(),kind:'paragraph',text:'leading\nparagraph'});
  const session=stepTrial(f.p,startTrial(f.p),{edgeId:f.edge.id}), plan=await prepareTrialCorrection(f.p,session,{entityId:f.scene.id,blockId}), prepared=await prepareTrialCorrectionSave(f.p,plan,'旧い一文。');
  expect(prepared.targetAnchor).toEqual({entityId:f.scene.id,blockId,sourceVersionId:prepared.targetVersionId});
 });
 it('stops on the first removed choice and keeps the original trace byte for byte',async()=>{
  const f=fixture(), session=stepTrial(f.p,startTrial(f.p),{edgeId:f.edge.id}), plan=await prepareTrialCorrection(f.p,session,{entityId:f.scene.id,blockId:f.scene.data.body[0].id});
  f.p.entities.push(...plan.entities);f.p.snapshots.push(...plan.snapshots);const old=JSON.stringify(plan.sourceTrace);f.p.entities=f.p.entities.filter(e=>e.id!==f.edge.id);f.p.revision='2';
  const result=await replayTraceAgainstRevision(f.p,plan.sourceTrace.id);
  expect(result.status).toBe('unexecutable');expect(result.firstDifference).toMatchObject({choice:1,edgeIds:[f.edge.id]});expect(result.firstDifference?.reason).toBeTruthy();expect(result.session?.nodeId).toBe(f.entry.id);expect(JSON.stringify(plan.sourceTrace)).toBe(old);
 });
 it('atomically adopts the candidate with pinned provenance, survives native clone, and undoes as one command',async()=>{
  const f=fixture(), review=createEntity(f.p.projectId,'review','本文への指摘',{target:{entityId:f.scene.id,blockId:f.scene.data.body[0].id,start:0,end:2},targetVersionId:f.p.projectId,body:[{id:newId(),kind:'paragraph',text:'確認'}],stage:'open'});f.p.entities.push(review);f.p.relations.push({id:newId(),projectId:f.p.projectId,revision:'0',fromId:f.scene.id,toId:f.entry.id,relationType:'reference',direction:'forward',validity:{...emptyValidity(),presentationAnchor:{entityId:f.scene.id,blockId:f.scene.data.body[0].id,start:0,end:2}},evidenceIds:[],status:'confirmed',visibility:'private'});
  const store=new ScenarioStore({databaseName:`correction-${newId()}`});
  try{
   const base=(await store.saveProject(f.p,{reason:'試験開始'})).project, session=stepTrial(base,startTrial(base),{edgeId:f.edge.id}), plan=await prepareTrialCorrection(base,session,{entityId:f.scene.id,blockId:f.scene.data.body[0].id}), prepared=await prepareTrialCorrectionSave(base,plan,'直した一文。');
   expect(base.entities.find(e=>e.id===f.scene.id)?.data).toMatchObject({body:[{text:'旧い一文。'}]});expect(prepared.project.relations[0].validity.presentationAnchor?.positionStatus).toBe('unresolved');expect(base.relations[0].validity.presentationAnchor?.positionStatus).toBeUndefined();
   const saved=(await store.saveProject(prepared.project,{reason:'修正候補を採用'})).project, replay=await replayTraceAgainstRevision(saved,plan.sourceTrace.id,{targetVersionId:prepared.targetVersionId});expect(replay.status).toBe('same_path');
   const clone=await cloneProject((await inspectScenario(await exportScenario(saved))).project),trace=clone.project.entities.find(e=>e.id===clone.idMap[plan.sourceTrace.id]);expect(trace?.data).toMatchObject({correctionAnchor:{entityId:clone.idMap[f.scene.id],blockId:clone.idMap[f.scene.data.body[0].id],sourceVersionId:clone.idMap[plan.snapshots[0].id]}});
   const undone=(await store.undo(saved.projectId)).project;expect(undone.entities.find(e=>e.id===f.scene.id)?.data).toMatchObject({body:[{text:'旧い一文。'}]});expect(undone.entities.find(e=>e.id===plan.sourceTrace.id)?.deletedAt).toBeTruthy();expect(undone.snapshots.some(s=>s.id===plan.snapshots[0].id)).toBe(true);
   const resumed=structuredClone(undone);resumed.entities=resumed.entities.map(entity=>{if(entity.id!==plan.sourceTrace.id&&entity.id!==plan.sourceTrace.data.startCheckpointId)return entity;const {deletedAt:_deleted,deletionOperationId:_operation,...active}=entity;return active;});const corrupted=resumed.entities.find(entity=>entity.id===plan.sourceTrace.id);if(corrupted?.kind!=='trace')throw new Error('trace');corrupted.data.steps[0].after.rngPosition++;await expect(store.saveProject(resumed,{reason:'破損した経路を復元しようとする'})).rejects.toThrow(/一致しません/);
   await expect(prepareTrialCorrectionSave({...base,revision:'999'},plan,'残す入力')).rejects.toThrow('更新');
  }finally{await store.deleteDatabase();}
 });

});
