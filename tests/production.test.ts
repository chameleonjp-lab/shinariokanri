import {describe,it,expect} from 'vitest';
import {createProject,createEntity,textToRichText} from '../src/domain/model';
import {dialogueContentHash,reconcileDeliverables,productionCounts} from '../src/domain/production';
describe('production identity and review state',()=>{
 it('keeps hashes stable on rename/reorder but flags translation and recording after original content changes',async()=>{
  const p=createProject('試験');
  const line=createEntity(p.projectId,'dialogue_line','台詞',{text:textToRichText('鍵を持っている？')});
  p.entities.push(line);
  const hash=await dialogueContentHash(p,line);
  const translation=createEntity(p.projectId,'localization','英語',{sourceLineId:line.id,language:'en',sourceHash:hash,text:textToRichText('Do you have the key?'),stage:'reviewed'});
  const recording=createEntity(p.projectId,'recording','収録',{sourceLineId:line.id,language:'ja',sourceHash:hash,stage:'reviewed'});
  p.entities.push(translation,recording);
  const rename=structuredClone(p);rename.entities.reverse();rename.entities.find(e=>e.id===line.id)!.name='改名';
  expect(await dialogueContentHash(rename,line)).toBe(hash);
  const changed=structuredClone(p);const edited=changed.entities.find(e=>e.kind==='dialogue_line')!;
  if(edited.kind==='dialogue_line')edited.data.text[0]!.text='銀色の鍵を持っている？';
  const result=await reconcileDeliverables(p,changed);
  expect(result.entities.filter(e=>e.kind==='localization'||e.kind==='recording').map(e=>e.data.stage)).toEqual(['needs_review','needs_review']);
  expect(translation.data.stage).toBe('reviewed');expect(recording.data.sourceHash).toBe(hash);
 });
 it('counts common scenes once for production and per visit for a route',()=>{
  const p=createProject('合流');const scene=createEntity(p.projectId,'scene','共通場面');p.entities.push(scene);
  const count=productionCounts(p,[scene.id,scene.id]);expect(count.uniqueSceneCount).toBe(1);expect(count.routeOccurrences).toBe(2);
 });
});
