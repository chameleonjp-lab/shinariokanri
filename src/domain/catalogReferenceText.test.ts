import {expect,it} from 'vitest';
import {collectCatalogText,matchesQuery} from './catalog';
import {createEntity,createProject,newId,textToRichText} from './model';

it('excludes reference leaves whose field names do not end in Id or Ids',()=>{
  const project=createProject(),goalId=newId(),memberId=newId();
  const person=createEntity(project.projectId,'character','人物',{goals:[goalId]});
  const group=createEntity(project.projectId,'group','分類',{members:[memberId]});
  expect(matchesQuery(project,person,{op:'text',value:goalId})).toBe(false);
  expect(matchesQuery(project,group,{op:'text',value:memberId})).toBe(false);
  expect(collectCatalogText(person).map(term=>term.path)).not.toContain('data.goals[0]');
  expect(collectCatalogText(group).map(term=>term.path)).not.toContain('data.members[0]');
});

it('retains kind-specific goal text and UUID-looking text explicitly written by the author',()=>{
  const project=createProject(),id=newId();
  const scene=createEntity(project.projectId,'scene','場面',{goals:textToRichText('扉を開く '+id)});
  const person=createEntity(project.projectId,'character','人物',{goals:[id],body:textToRichText('引用した識別子 '+id)});
  expect(matchesQuery(project,scene,{op:'text',value:'扉を開く'})).toBe(true);
  expect(matchesQuery(project,scene,{op:'text',value:id})).toBe(true);
  expect(matchesQuery(project,person,{op:'text',value:id})).toBe(true);
  expect(collectCatalogText(person).filter(term=>term.text===id)).toEqual([]);
  expect(collectCatalogText(person).find(term=>term.path==='data.body[0].text')?.text).toContain(id);
});
