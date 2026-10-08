import {describe,it,expect} from 'vitest';
import {createProject,createEntity,newId,textToRichText} from '../src/domain/model';
import {deletionImpact,duplicateCandidates,previewMerge} from '../src/domain/maintenance';
describe('identity-preserving maintenance',()=>{
 it('reports references and merges only structured references without replacing text',()=>{
  const p=createProject('参照試験');
  const a=createEntity(p.projectId,'character','アオ');const b=createEntity(p.projectId,'character','アオ');
  const scene=createEntity(p.projectId,'scene','再会',{povId:a.id,body:textToRichText(`記録番号は ${a.id}`)});
  p.entities.push(a,b,scene);
  expect(duplicateCandidates(p)[0]!.ids).toEqual([a.id,b.id]);
  expect(deletionImpact(p,a.id).some(impact=>impact.sourceId===scene.id)).toBe(true);
  const plan=previewMerge(p,{sourceId:a.id,survivorId:b.id,fields:{},operationId:newId(),deletedAt:new Date().toISOString()});
  const result=plan.project.entities.find(e=>e.id===scene.id)!;
  expect(result.kind).toBe('scene');if(result.kind==='scene'){expect(result.data.povId).toBe(b.id);expect(result.data.body[0]!.text).toContain(a.id);}
  expect(plan.project.entities.find(e=>e.id===a.id)!.deletedAt).toBeTruthy();
  expect(scene.data.povId).toBe(a.id);
 });
});
